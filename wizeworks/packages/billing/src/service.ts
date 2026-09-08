// Billing service — provision + reconcile a tenant's platform subscription.
//
// One Stripe subscription per tenant, SHAPED BY THE TENANT'S PLAN (./plans): a
// `per_module` plan carries one item per active billable module, a `flat` plan
// carries one base item and never lets a module flag reach the bill. The plan also
// decides which Stripe ACCOUNT the tenant lives in, so every Stripe call in this
// file goes through `getBillingStripe(plan)` rather than a single global client.
//
// Every
// operation is GUARDED: if the platform Stripe key is unset it returns a no-op
// result, so the module-toggle path works unchanged in dev/test and ships before
// the prod ops (products, price IDs, webhook) land. Stripe failures are surfaced
// to the caller (which swallows them) — the module flag is already written, and
// the webhook is the authoritative reconciler, so billing is best-effort here.

import type Stripe from 'stripe';

import { prisma, withTenant, type Prisma } from '@wizeworks/db';
import {
  BUNDLED_FREE,
  deriveModuleStates,
  invalidateModuleCache,
  type ModuleSlug,
} from '@wizeworks/modules';

import { anyBillingConfigured, getBillingStripe, isBillingConfigured } from './client';
import { isPlatformTenant, resolveBillingPhase, type BillingPhaseView } from './gate';
import { planFor, type BillingPlan, type PlanShape } from './plans';
import {
  MODULE_MONTHLY_CENTS,
  isBillableModule,
  priceIdFor,
  type BillingInterval,
} from './price-catalog';

export interface SubscriptionSyncInput {
  tenantId: string;
  /** Billing contact — used only when first creating the Stripe customer. */
  email: string;
  name?: string;
  /** The tenant's currently EXPLICITLY-enabled modules (not derived/bundled).
   *  One Stripe item is kept per billable module in this set that has a price id. */
  enabledModules: ModuleSlug[];
}

export interface BillingResult {
  /** False when Stripe is unconfigured — the caller can treat this as a no-op. */
  applied: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

function interval(raw: string | null | undefined): BillingInterval {
  return raw === 'annual' ? 'annual' : 'monthly';
}

function tsToDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

// Stripe requires an absolute `trial_end` to be at least 48h in the future on
// subscription create; keep a safety margin above that.
const MIN_TRIAL_END_MS = 49 * 60 * 60 * 1000;

/** The trial instant to pin a CHECKOUT-created subscription to. Honours the
 *  SIGNUP-stamped clock (`tenants.trial_ends_at`) so converting mid-trial keeps the
 *  original end date — the subscription trials until then, then charges. Returns
 *  `undefined` (no trial → immediate first charge) once the clock has lapsed or
 *  sits inside Stripe's 48h floor, so a late converter is billed now rather than
 *  granted a fresh 14 days. */
function checkoutTrialData(trialEndsAt: Date | null): { trial_end: number } | undefined {
  if (trialEndsAt && trialEndsAt.getTime() - Date.now() >= MIN_TRIAL_END_MS) {
    return { trial_end: Math.floor(trialEndsAt.getTime() / 1000) };
  }
  return undefined;
}

/** Ensure the tenant has a Stripe customer, lazily creating + persisting one on
 *  first need. Shared by the module-item sync and the checkout-session opener so
 *  the `sparx_tenant_id` metadata (which the webhook resolves tenants by) is
 *  stamped identically no matter which path creates the customer. */
async function ensureStripeCustomer(
  stripe: Stripe,
  opts: { tenantId: string; existingCustomerId: string | null; email: string; name?: string | null }
): Promise<string> {
  if (opts.existingCustomerId) return opts.existingCustomerId;
  const customer = await stripe.customers.create({
    email: opts.email,
    ...(opts.name ? { name: opts.name } : {}),
    metadata: { sparx_tenant_id: opts.tenantId },
  });
  await prisma.tenant.update({
    where: { id: opts.tenantId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Reverse the price catalog: which module (if any) a Stripe price id bills for.
 *  Used by webhook reconciliation, where Stripe items carry price ids, not modules. */
export function moduleForPriceId(priceId: string): ModuleSlug | null {
  for (const m of Object.keys(MODULE_MONTHLY_CENTS) as ModuleSlug[]) {
    if (priceIdFor(m, 'monthly') === priceId || priceIdFor(m, 'annual') === priceId) return m;
  }
  return null;
}

/** The billable modules from a set that also have a configured price id for the
 *  given interval — the items we can actually put on a Stripe subscription. */
function billablePriced(
  modules: ModuleSlug[],
  iv: BillingInterval
): { module: ModuleSlug; priceId: string }[] {
  const out: { module: ModuleSlug; priceId: string }[] = [];
  for (const m of modules) {
    if (!isBillableModule(m)) continue;
    const priceId = priceIdFor(m, iv);
    if (priceId) out.push({ module: m, priceId });
  }
  return out;
}

/** A Stripe Price id from its env var, or undefined when the ops have not landed. */
function priceIdFromEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  // Blank is the same as unset — a variable that is present but empty is an ops slip,
  // not a price id, and passing '' to Stripe fails far from the cause.
  return value === '' ? undefined : value;
}

/**
 * The Checkout line items for a plan.
 *
 * - `flat` — exactly ONE item, the base price. Capacity blocks are bought later
 *   and in place, at the moment of friction, so a first checkout never carries
 *   one; and the module set is deliberately not consulted, because on a flat plan
 *   turning an app on changes the workspace and not the price.
 * - `per_module` — one item per EXPLICIT billable module that has a configured
 *   price id. Bundled-free capabilities have no flag, so are never an item.
 */
function checkoutLineItems(
  plan: BillingPlan,
  settings: Parameters<typeof deriveModuleStates>[0],
  iv: BillingInterval
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  if (plan.shape === 'flat') {
    const price = plan.base ? priceIdFromEnv(plan.base.priceEnv) : undefined;
    return price ? [{ price, quantity: 1 }] : [];
  }
  const states = deriveModuleStates(settings);
  const explicit = (Object.keys(MODULE_MONTHLY_CENTS) as ModuleSlug[]).filter(
    (m) => states[m].source === 'explicit'
  );
  return billablePriced(explicit, iv).map((d) => ({ price: d.priceId, quantity: 1 }));
}

/**
 * Bring a tenant's Stripe subscription into line with its enabled modules:
 * lazily create the customer + trialing subscription on first call, then
 * add/remove items so exactly the enabled billable modules are billed. Prorates
 * automatically (Stripe default). No-op when billing is unconfigured.
 */
export async function syncModuleItems(input: SubscriptionSyncInput): Promise<BillingResult> {
  // Cheap door first: with no Stripe key anywhere there is nothing to sync for any
  // plan, and reading the tenant row only to discover that is a query dev and test
  // should never pay. WHICH plan is wired still needs the row, below.
  if (!anyBillingConfigured()) return { applied: false };

  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      billingInterval: true,
      billingPlan: true,
      trialEndsAt: true,
    },
  });
  if (!tenant) return { applied: false };

  // The plan decides the ACCOUNT, so it has to be resolved before the client.
  const plan = planFor(tenant.billingPlan);
  const stripe = getBillingStripe(plan);
  if (!stripe) return { applied: false };

  // A FLAT plan does not bill from the module set — every app is included, and a
  // tenant who turns one on is changing their workspace, not their price. Ensure
  // the customer (so a later checkout has one) and stop. Without this the loop
  // below would put one priced line item per app onto a $49 subscription, and the
  // `desired.length === 0` branch would CANCEL the subscription of a tenant who
  // simply switched their last optional app off.
  if (plan.shape === 'flat') {
    const customerId = await ensureStripeCustomer(stripe, {
      tenantId: input.tenantId,
      existingCustomerId: tenant.stripeCustomerId,
      email: input.email,
      name: input.name,
    });
    return {
      applied: true,
      stripeCustomerId: customerId,
      ...(tenant.stripeSubscriptionId ? { stripeSubscriptionId: tenant.stripeSubscriptionId } : {}),
    };
  }

  const iv = interval(tenant.billingInterval);
  const desired = billablePriced(input.enabledModules, iv);

  // 1) Ensure the Stripe customer.
  const customerId = await ensureStripeCustomer(stripe, {
    tenantId: input.tenantId,
    existingCustomerId: tenant.stripeCustomerId,
    email: input.email,
    name: input.name,
  });

  // 2) No subscription yet → the subscription is BORN AT CHECKOUT
  //    (`createCheckoutSession`), never eagerly here. A card-less subscription
  //    can't carry a promotion code, and the tenant redeems discount codes on
  //    Stripe's hosted Checkout page — which only offers the redemption box when
  //    the Checkout Session is the thing creating the subscription. During the
  //    trial we therefore only ensure the customer + let the tenant's module flags
  //    accumulate; gating is column-driven (`resolveBillingPhase` reads
  //    `tenants.trial_ends_at`, never Stripe), so nothing needs the subscription to
  //    exist yet. Once it exists (post-checkout), step 3 keeps its items in sync.
  if (!tenant.stripeSubscriptionId) {
    return { applied: true, stripeCustomerId: customerId };
  }

  // 3) Reconcile items against an existing subscription.

  // 3a) No billable modules left — cancel the subscription rather than try to delete
  //     its last item (Stripe forbids removing the only item on a subscription). The
  //     tenant keeps its Stripe customer + history; re-enabling a module later creates
  //     a fresh subscription through the create path above.
  if (desired.length === 0) {
    await stripe.subscriptions.cancel(tenant.stripeSubscriptionId);
    await withTenant({ tenantId: input.tenantId }, (tx) =>
      tx.billingSubscriptionItem.deleteMany({ where: { tenantId: input.tenantId } })
    );
    await prisma.tenant.update({
      where: { id: input.tenantId },
      data: { stripeSubscriptionId: null },
    });
    return { applied: true, stripeCustomerId: customerId };
  }

  const existing = await withTenant({ tenantId: input.tenantId }, (tx) =>
    tx.billingSubscriptionItem.findMany({ where: { tenantId: input.tenantId } })
  );
  const existingByModule = new Map(existing.map((e) => [e.moduleKey, e]));
  const desiredKeys = new Set(desired.map((d) => d.module));

  // Add items for newly-enabled modules.
  for (const d of desired) {
    if (existingByModule.has(d.module)) continue;
    const item = await stripe.subscriptionItems.create({
      subscription: tenant.stripeSubscriptionId,
      price: d.priceId,
    });
    await withTenant({ tenantId: input.tenantId }, (tx) =>
      tx.billingSubscriptionItem.create({
        data: {
          tenantId: input.tenantId,
          stripeSubscriptionItemId: item.id,
          moduleKey: d.module,
          stripePriceId: d.priceId,
        },
      })
    );
  }

  // Remove items for modules no longer enabled (credit-prorate the remainder).
  for (const e of existing) {
    if (desiredKeys.has(e.moduleKey as ModuleSlug)) continue;
    await stripe.subscriptionItems.del(e.stripeSubscriptionItemId, {
      proration_behavior: 'create_prorations',
    });
    await withTenant({ tenantId: input.tenantId }, (tx) =>
      tx.billingSubscriptionItem.delete({ where: { id: e.id } })
    );
  }

  return {
    applied: true,
    stripeCustomerId: customerId,
    stripeSubscriptionId: tenant.stripeSubscriptionId,
  };
}

/** Create a Stripe Customer Portal session so the tenant can manage payment +
 *  subscription (docs/67 §5). Returns the URL, or null when unconfigured / no
 *  customer yet. */
export async function createPortalSession(
  tenantId: string,
  returnUrl: string
): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true, billingPlan: true },
  });
  if (!tenant?.stripeCustomerId) return null;
  // The customer id only means anything inside its own account, so the portal
  // session must be opened against the plan's account or Stripe 404s.
  const stripe = getBillingStripe(planFor(tenant.billingPlan));
  if (!stripe) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/** The outcome of opening a checkout session — a URL, or a typed reason the caller
 *  turns into a clear message. */
export type CheckoutSessionResult =
  { url: string } | { url: null; reason: 'unconfigured' | 'no_paid_modules' | 'already_active' };

/**
 * Open a Stripe Checkout Session that BIRTHS the tenant's platform subscription —
 * the trial-conversion / first-card path. `mode: 'subscription'` with one line item
 * per explicitly-enabled billable module, the trial pinned to the signup clock, and
 * `allow_promotion_codes: true` so the tenant can type a discount (promotion) code
 * on Stripe's hosted page. The resulting `customer.subscription.created` webhook
 * reconciles status + items + module flags (see reconcileFromSubscription) — this
 * function persists nothing itself.
 *
 * Returns a typed reason instead of a URL when billing is unconfigured, the tenant
 * has no paid module to bill (nothing to subscribe to), or a subscription already
 * exists (manage it in the Portal — a second checkout would duplicate it).
 */
export async function createCheckoutSession(
  tenantId: string,
  opts: { successUrl: string; cancelUrl: string }
): Promise<CheckoutSessionResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      billingInterval: true,
      billingPlan: true,
      trialEndsAt: true,
      settings: true,
    },
  });
  if (!tenant) return { url: null, reason: 'unconfigured' };

  const plan = planFor(tenant.billingPlan);
  const stripe = getBillingStripe(plan);
  if (!stripe) return { url: null, reason: 'unconfigured' };

  // A tenant with a live subscription manages payment in the Portal; a second
  // checkout would create a duplicate subscription.
  if (tenant.stripeSubscriptionId) return { url: null, reason: 'already_active' };

  const lineItems = checkoutLineItems(plan, tenant.settings, interval(tenant.billingInterval));
  // On a flat plan an empty list can only mean the base price id is unset — an ops
  // gap, not "you have bought nothing to subscribe to".
  if (lineItems.length === 0) {
    return { url: null, reason: plan.shape === 'flat' ? 'unconfigured' : 'no_paid_modules' };
  }

  const customerId = await ensureStripeCustomer(stripe, {
    tenantId,
    existingCustomerId: tenant.stripeCustomerId,
    email: tenant.email,
    name: tenant.name,
  });

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { sparx_tenant_id: tenantId },
  };
  const trial = checkoutTrialData(tenant.trialEndsAt);
  if (trial) {
    // Keep the ONE signup trial clock; day-14-no-card pauses (grace, not cancel).
    subscriptionData.trial_end = trial.trial_end;
    subscriptionData.trial_settings = { end_behavior: { missing_payment_method: 'pause' } };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    // The discount-code box the tenant asked for: Stripe renders + validates it,
    // redeeming a PROMOTION CODE (created off a coupon, @wizeworks/billing operator.ts)
    // against its restrictions. No custom field or redemption logic on our side.
    allow_promotion_codes: true,
    // Collect the card now even while trialing — the whole point of this path is
    // putting a payment method on file so the trial converts instead of pausing.
    payment_method_collection: 'always',
    subscription_data: subscriptionData,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { sparx_tenant_id: tenantId },
  });

  return session.url ? { url: session.url } : { url: null, reason: 'unconfigured' };
}

export interface BillingStateView {
  /** Whether platform Stripe is configured in this environment. */
  configured: boolean;
  /** Whether this tenant has a live subscription (a Stripe customer + sub). */
  billingActive: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: BillingInterval;
  /** Which plan this tenant bills on (./plans) — the shape of the bill and the
   *  Stripe account behind it. */
  planId: string;
  planLabel: string;
  planShape: PlanShape;
  /** The plan derived from the tenant's EXPLICIT billable module flags — what the
   *  tenant will be charged. Always populated (independent of Stripe), so the
   *  settings page is meaningful before the billing ops land. Bundled-free
   *  capabilities (invoicing via Commerce/B2B) are 'bundled', not explicit, so
   *  they never appear here.
   *
   *  EMPTY on a `flat` plan, and empty is the correct answer there rather than a
   *  missing one: no module is separately billed, so there is no per-module
   *  breakdown to show. Read `planTotalCents`, which is populated for both shapes. */
  planModules: { moduleKey: string; monthlyCents: number }[];
  planTotalCents: number;
  /** 'enterprise' for manually-provisioned tenants (Gillett Diesel, docs/92 §C5):
   *  custom-priced subscription, managed hosting, changes via support — the UI
   *  hides self-serve plan editing. Flagged in `settings.billing.planType`; the
   *  per-module breakdown above is informational only for these tenants. */
  planType: 'standard' | 'enterprise';
  /** Where the tenant sits in the Trial → Grace → Suspend lifecycle (docs/17 §6) —
   *  the banner ladder + site overlay read this. Computed from the same columns,
   *  so it never needs Stripe. */
  billing: BillingPhaseView;
}

/** A read-only snapshot for the billing settings UI. Never calls Stripe — the
 *  plan comes from our own module flags + list prices, the status from the
 *  webhook-reconciled tenant columns. Dates are ISO strings (JSON-safe). */
export async function getBillingState(tenantId: string): Promise<BillingStateView> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      billingInterval: true,
      billingPlan: true,
      settings: true,
    },
  });

  const plan = planFor(tenant?.billingPlan);
  const states = deriveModuleStates(tenant?.settings);
  const planModules =
    plan.shape === 'flat'
      ? []
      : (Object.keys(MODULE_MONTHLY_CENTS) as ModuleSlug[])
          .filter((m) => states[m].source === 'explicit')
          .map((m) => ({ moduleKey: m, monthlyCents: MODULE_MONTHLY_CENTS[m] ?? 0 }));
  // A flat plan's total is its base price, not the sum of an empty list — billing
  // $0.00 onto a $49 plan's settings screen would be a measurement nobody took.
  const planTotalCents =
    plan.shape === 'flat'
      ? (plan.base?.monthlyCents ?? 0)
      : planModules.reduce((sum, m) => sum + m.monthlyCents, 0);

  const billingSettings = (tenant?.settings as { billing?: { planType?: string } } | null)?.billing;
  const planType: 'standard' | 'enterprise' =
    billingSettings?.planType === 'enterprise' ? 'enterprise' : 'standard';

  const billing = resolveBillingPhase({
    subscriptionStatus: tenant?.subscriptionStatus ?? null,
    trialEndsAt: tenant?.trialEndsAt ?? null,
    currentPeriodEnd: tenant?.currentPeriodEnd ?? null,
    planType,
    exempt: isPlatformTenant(tenantId),
  });

  return {
    configured: isBillingConfigured(plan),
    billingActive: Boolean(tenant?.stripeSubscriptionId),
    subscriptionStatus: tenant?.subscriptionStatus ?? null,
    trialEndsAt: tenant?.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: tenant?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: tenant?.cancelAtPeriodEnd ?? false,
    billingInterval: interval(tenant?.billingInterval),
    planId: plan.id,
    planLabel: plan.label,
    planShape: plan.shape,
    planModules,
    planTotalCents,
    planType,
    billing,
  };
}

/** Persist a Stripe subscription's state onto the tenant row + rebuild its item
 *  rows. Shared by create + webhook reconciliation.
 *
 *  `billing_subscription_items` exists to DIFF a module set against Stripe items, so
 *  it is written for `per_module` plans only. A flat plan has nothing to diff, and
 *  its capacity blocks are not modules — recording them in `module_key` would make
 *  the column mean two different things depending on the row. */
async function persistSubscription(
  tenantId: string,
  sub: Stripe.Subscription,
  plan: BillingPlan
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      trialEndsAt: tsToDate(sub.trial_end),
      currentPeriodEnd: tsToDate(sub.current_period_end),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
  if (plan.shape === 'flat') return;
  await withTenant({ tenantId }, async (tx) => {
    await tx.billingSubscriptionItem.deleteMany({ where: { tenantId } });
    for (const item of sub.items.data) {
      const module = moduleForPriceId(item.price.id);
      if (!module) continue;
      await tx.billingSubscriptionItem.create({
        data: {
          tenantId,
          stripeSubscriptionItemId: item.id,
          moduleKey: module,
          stripePriceId: item.price.id,
        },
      });
    }
  });
}

/**
 * Webhook reconciliation (docs/67 §6) — Stripe is the source of truth.
 * Resolve the tenant from the subscription's customer, sync its billing columns +
 * item rows, and reconcile each BILLABLE module flag to match its item (so a
 * change made in the Stripe portal propagates to module gating). Non-billable and
 * bundled-derived modules are untouched. Returns the resolved tenant id, or null
 * if the customer maps to no tenant.
 */
export async function reconcileFromSubscription(
  sub: Stripe.Subscription,
  planId?: string | null
): Promise<string | null> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const plan = planFor(planId);
  // Scoped to the plan as well as the customer, because a Stripe customer id is
  // only meaningful INSIDE its own account: two accounts can in principle mint the
  // same id, and matching on the id alone would let one product's webhook rewrite
  // the other's tenant. Narrowing here fails closed — a mismatch reconciles nothing
  // rather than reconciling the wrong row.
  const tenant = await prisma.tenant.findFirst({
    where: { stripeCustomerId: customerId, billingPlan: plan.id },
    select: { id: true, settings: true },
  });
  if (!tenant) return null;

  await persistSubscription(tenant.id, sub, plan);

  // On a FLAT plan the subscription says nothing about which apps are on — every
  // app is included, and the items are the base plan plus capacity blocks. Running
  // the module reconciliation below would find no item matching any module and
  // switch EVERY app off for a tenant who just paid.
  if (plan.shape === 'flat') return tenant.id;

  // Reconcile billable-module flags to the subscription's items.
  const itemModules = new Set(
    sub.items.data
      .map((i) => moduleForPriceId(i.price.id))
      .filter((m): m is ModuleSlug => m !== null)
  );
  const canceled = sub.status === 'canceled' || sub.status === 'incomplete_expired';
  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const modules = { ...((settings.modules as Record<string, unknown> | undefined) ?? {}) };
  let changed = false;
  for (const m of Object.keys(MODULE_MONTHLY_CENTS) as ModuleSlug[]) {
    // A bundled-free capability (invoicing while Commerce/B2B is on) intentionally
    // carries NO Stripe item — its missing item must NOT clear the tenant's flag,
    // or a standalone purchase would be erased the moment a provider is enabled.
    // Leave it untouched; it re-bills off its own flag once the provider is gone.
    const bundledNow = (BUNDLED_FREE[m] ?? []).some((p) => {
      const providerSlot = modules[p] as Record<string, unknown> | undefined;
      return providerSlot?.enabled === true;
    });
    if (bundledNow) continue;
    const slot = (modules[m] as Record<string, unknown> | undefined) ?? {};
    const shouldEnable = !canceled && itemModules.has(m);
    if ((slot.enabled === true) !== shouldEnable) {
      modules[m] = { ...slot, enabled: shouldEnable };
      changed = true;
    }
  }
  if (changed) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { settings: { ...settings, modules } as Prisma.InputJsonValue },
    });
    invalidateModuleCache(tenant.id);
  }

  return tenant.id;
}

/** Mark a tenant past-due / active on invoice events (docs/67 §6). No module
 *  changes — gating stays until a cancellation actually lands. */
export async function setSubscriptionStatus(
  stripeCustomerId: string,
  status: string,
  planId?: string | null
): Promise<void> {
  // Same scoping as reconcileFromSubscription: the customer id is only unique
  // within its own Stripe account.
  await prisma.tenant.updateMany({
    where: { stripeCustomerId, billingPlan: planFor(planId).id },
    data: { subscriptionStatus: status },
  });
}

// The platform transaction fee is no longer a metered subscription line. The only
// platform-collected payment fee is sparx Pay's flat 0.5%, taken at charge time via
// Stripe `application_fee_amount` and recorded on payment_intents.platform_fee — see
// @wizeworks/payments (docs/94 ADR §8). Everything else is $0 (modules, not tiers).
