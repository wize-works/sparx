# sparx Platform — Billing Build Plan

**Version:** 1.4
**Author:** Brandon Korous
**Last Updated:** 2026-07-25

---

> **Reconciled 2026-07-22 (docs-vs-built audit):** The **Phase 7 metered transaction fee** described throughout this plan was **removed** — there are no plan tiers, only modules, so the tiered 0.5%/0.3%/0% metered fee (`recordTransactionFee`, `meterOrderFee`, the `transaction_fee` meter/price) no longer exists in code. The **only** platform-collected payment fee is **sparx Pay's flat 0.5%**, taken at charge time via Stripe `application_fee_amount` and recorded on `payment_intents.platform_fee` (see [docs/94 §8](94-ADR-payment-gateway.md) and [docs/92 §2](92-billing-stripe-go-live.md)). The transaction-fee subsections below (Phase 1 "Transaction fee metering", Phase 7, and the fee rows in the Build Status) are **historical**. Separately, `apps/dashboard` was deleted and rebuilt as `sparx/apps/workbench`; the standalone `/settings/billing` page never shipped in workbench — only the billing **chrome banner + trial chip** (`sparx/apps/workbench/components/billing/*`) plus the **`finance.subscription`** surface exist. Plan/status derive from active module flags; the Stripe Customer Portal covers self-serve management.

> **Updated 2026-07-25 (subscription born-at-checkout + discount codes):** The subscription is **no longer created eagerly** when a module is toggled during the trial. Eager creation is incompatible with tenant-redeemable discount codes — Stripe only offers its promotion-code redemption box on a **Checkout Session that itself creates the subscription**, never on a card-less subscription or the Customer Portal. So: during the trial `syncModuleItems` ensures only the Stripe **customer** (gating is column-driven via `resolveBillingPhase`, which never needs a subscription); the subscription is **born at checkout** via `createCheckoutSession` (`mode: 'subscription'`, `allow_promotion_codes: true`, `trial_end` pinned to the signup clock) — the `finance.subscription` surface's "Set up billing" button, `POST /v1/billing/checkout`. The Customer **Portal** remains the MANAGE surface once a subscription exists. Discount codes are **promotion codes** (typeable strings on a coupon), created operator-side in `wizeworks/apps/admin/.../sparx/billing` — public or locked to one tenant — via `createPromotionCode` (`@wizeworks/billing` operator.ts). The `customer.subscription.created` webhook already reconciles the checkout-created subscription; no new webhook code.

## Overview

Billing is the final unlock before commercial launch. It is intentionally last: every module must be built and working before you gate it behind a payment wall. Billing without a complete product is a conversion killer; billing with a complete product is just revenue.

The billing model is modular: each module is a Stripe subscription item. Tenants activate modules independently, pay only for what they use, and manage everything through the embedded Stripe Customer Portal. No custom billing UI.

**Spec:** [docs/17-billing-subscriptions.md](17-billing-subscriptions.md)
**Dependency:** Requires [Tier 1 Feature 1 Phase 1](65-tier1-build-plan.md) (Stripe client + Secret Manager keys) to already exist. Stripe Connect for tenant payments (Tier 1 Feature 2 Phase 1) is separate from platform billing — this doc covers WizeWorks charging tenants, not tenants charging their customers.
**Build constraints (CLAUDE.md):** production-complete, module-gated via `requireModule`, event-driven, RLS on all tenant tables, conventional commits, no Co-Authored-By.

---

## Build Status (2026-06-12) — what's done & what's outstanding

The billing **engine is built code-side and merged**, guarded so every Stripe call
is a no-op until the prod ops below land (dev/test flip module flags with **no
Stripe configured**). The remaining work splits into **manual ops (yours)** and
**deferred code sub-slices**. Don't lose these — nothing here charges money until
the manual ops are done.

### ✅ Built (validated: typecheck + lint + 8 unit tests)

- **`@wizeworks/billing` package** — `price-catalog.ts` (module list prices in
  `MODULE_MONTHLY_CENTS`), `client.ts`
  (`isBillingConfigured()` over the single platform Stripe account), `service.ts`
  (`syncModuleItems`, `createPortalSession`, `getBillingState`,
  `reconcileFromSubscription`, `setSubscriptionStatus`).
- **DB** — subscription columns folded onto the (non-RLS) `tenants` row, which
  already held `stripe_customer_id` + `trial_ends_at`; new RLS-FORCE
  `billing_subscription_items` table. Schema + migration
  `20260813000000_platform_billing` (hand-authored; **not yet applied** — see ops).
  - **Deviation from §2:** no separate `billing_customers` table — the tenant
    dispatch row already carries the customer identity, so a second non-RLS table
    would just duplicate it. The webhook resolves a tenant from a Stripe customer
    id via `tenants.stripe_customer_id` (now `@unique`).
- **Module-toggle → Stripe sync** — `applyModuleWrites` (tenant.ts) best-effort
  syncs one item per **explicit** module; bundled-free invoicing (via
  Commerce/B2B) is never billed. Guarded + non-fatal (the webhook is authoritative).
- **Billing webhook** — `POST /v1/public/webhooks/stripe/billing` (own signing
  secret, separate from the commerce payment webhook).
- **API + UI** — `GET /v1/billing`, `POST /v1/billing/portal`; `/settings/billing`
  dashboard page (plan derived from active modules + status + Stripe portal door);
  settings-nav `billing` entry flipped `ready: true`.
- **Wiring** — api-rest Dockerfile COPY for `@wizeworks/billing`;
  `STRIPE_WEBHOOK_SECRET_BILLING` added to env.
- ~~**Phase 7 — transaction-fee metering** (§7)~~ — **REMOVED (2026-07-22).** The
  tiered `recordTransactionFee()` / `meterOrderFee` / `transaction_fee` meter path
  no longer exists (no tiers, only modules). The sole platform payment fee is now
  sparx Pay's flat 0.5%, collected in-flow via `application_fee_amount` (docs/94 §8).

### ⛏️ Outstanding — manual ops (required before billing can charge)

- [ ] **Stripe Dashboard:** create one **Product + Price** per module (monthly +
      annual) — §1.
- [ ] **Secret Manager:** set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_BILLING`,
      and `STRIPE_PRICE_<MODULE>_MONTHLY` / `_ANNUAL` for every billable module.
      Billable modules + monthly prices (source of truth:
      `wizeworks/packages/billing/src/price-catalog.ts`): builder 10, commerce 49, cms 49,
      crm 49, email 29, b2b 99, ai 49, dropship 29, invoicing 19, chat 19.
- [ ] **Register the billing webhook** endpoint in Stripe
      (`…/v1/public/webhooks/stripe/billing`) for: `customer.subscription.created`,
      `…updated`, `…deleted`, `customer.subscription.trial_will_end`,
      `invoice.payment_succeeded`, `invoice.payment_failed`.
- [ ] **Apply the migration** via the **DB Migrate workflow** (push to `main`) —
      Cloud SQL is private-IP, so `20260813000000_platform_billing` cannot be
      applied locally.
- [x] ~~**Create the `transaction_fee` Billing Meter**~~ — **no longer required
      (2026-07-22).** The metered transaction fee was removed; there is no meter or
      metered price to provision. sparx Pay's flat 0.5% is charged in-flow, not
      metered onto the subscription (docs/94 §8).

### ⛏️ Outstanding — deferred code sub-slices (each its own scope)

- [ ] **Phase 3 — trial-ending banner + choose-plan screen.** The Stripe Customer
      Portal already covers module/card/cancel management, so this is a
      nice-to-have: a day-12 dashboard banner reading `trialEndsAt`, optionally a
      `/settings/billing/choose-plan` toggle UI.
- [ ] **Phase 8 — enterprise provisioning.** Manual data op (Gillett Diesel):
      create the customer + custom-priced subscription + managed-hosting item, set
      `plan` enterprise. Runbook, not a build.
- [ ] **Integration tests** for the Stripe-dependent flows (`syncModuleItems`,
      `reconcileFromSubscription`) — guarded no-ops without Stripe configured, so
      only the pure math is unit-tested today.

> The per-phase sections below are the original plan. Where a phase is built, the
> status above is authoritative; the phase text remains as the design reference.

---

## Phase 1 — Stripe product & price catalog

In the Stripe Dashboard (not in code — prices are created once and referenced by ID):

Create one Stripe Product per module:

| Product         | Monthly Price     | Annual Price |
| --------------- | ----------------- | ------------ |
| Builder         | $10/mo            | $96/yr       |
| Commerce        | $49/mo            | $470/yr      |
| CMS             | $49/mo            | $470/yr      |
| CRM             | $49/mo            | $470/yr      |
| Email           | $29/mo            | $278/yr      |
| B2B/Wholesale   | $99/mo            | $950/yr      |
| AI/MCP          | $49/mo            | $470/yr      |
| Dropship        | $29/mo            | $278/yr      |
| Managed Hosting | $750/mo           | —            |
| Additional Site | (TBD per site/mo) | —            |

Store Stripe Price IDs in Secret Manager (not `.env` — these are prod-only values):

- `STRIPE_PRICE_{MODULE}_MONTHLY` / `STRIPE_PRICE_{MODULE}_ANNUAL` for each module
- `STRIPE_PRICE_MANAGED_HOSTING_MONTHLY`

New config file `wizeworks/packages/billing/src/price-catalog.ts`:

```typescript
export const PRICE_CATALOG = {
  builder: { monthly: process.env.STRIPE_PRICE_BUILDER_MONTHLY, annual: process.env.STRIPE_PRICE_BUILDER_ANNUAL },
  commerce: { ... },
  // ...
} as const satisfies Record<ModuleKey, { monthly: string; annual?: string }>
```

### Transaction fee metering — REMOVED (2026-07-22)

> **Historical.** The tiered metered transaction fee (0.5% / 0.3% / 0%) was removed —
> no plan tiers, only modules. The only platform payment fee is sparx Pay's **flat
> 0.5%**, taken in-flow via Stripe `application_fee_amount` (docs/94 §8), never metered
> onto the tenant's subscription. The original metered design is preserved below for
> context only; there is no `transaction_fees` meter, metered price, or `order.created`
> meter emit in code.

Commerce charges 0.5% per transaction. When CRM is also active: 0.3%. When active modules ≥ $299/mo: 0%.

Implement as Stripe metered pricing on a `transaction_fees` meter per tenant:

- On `order.created` event (in payment-capture flow): compute fee amount based on active modules → `stripe.billing.meterEvents.create({ eventName: 'transaction_fee', payload: { value: feeAmountCents, stripe_customer_id: tenant.stripeCustomerId } })`

---

## Phase 2 — Tenant Stripe customer + subscription tables

DB migration — new tables (all with RLS, matching auth-domain table pattern for `billing_subscriptions` since it needs to be read pre-tenant-context during webhook processing):

```sql
-- Non-RLS (read by webhook handler before tenant context set, like 'domains')
-- Security: queries in app always filter by tenant_id explicitly
CREATE TABLE billing_customers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_customer_id   VARCHAR(255) NOT NULL UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  subscription_status  VARCHAR(20) NOT NULL DEFAULT 'trialing',
    -- trialing | active | past_due | canceled | unpaid | paused
  trial_ends_at        TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  billing_interval     VARCHAR(10) NOT NULL DEFAULT 'monthly', -- monthly | annual
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ENABLE + FORCE (tenant-scoped)
CREATE TABLE billing_subscription_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_subscription_item_id VARCHAR(255) NOT NULL UNIQUE,
  module_key              VARCHAR(50) NOT NULL,
  stripe_price_id         VARCHAR(255) NOT NULL,
  quantity                INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

When a tenant is created (in `signUpMerchant`):

1. Create Stripe Customer with `metadata: { tenantId, email, businessName }`
2. Create Stripe Subscription with 14-day trial (`trial_period_days: 14`), items = all modules (full-access trial per docs/17 §6)
3. Insert `billing_customers` row
4. Insert `billing_subscription_items` rows for all modules (trial includes everything)

---

## Phase 3 — Trial lifecycle

The 14-day trial gives full access to all modules. No credit card required until trial end.

### Trial expiry flow

Stripe sends `customer.subscription.trial_will_end` webhook 3 days before trial ends.

Dashboard banner (day 12 = 2 days before expiry): "Your trial ends in 2 days. Choose the modules you'd like to keep." Links to `/settings/billing/choose-plan`.

`/settings/billing/choose-plan` — module selection UI:

- Grid of module cards with toggle switches (on/off)
- Running total shown at bottom: "Your plan: $X/month"
- "Set up billing" CTA → opens a Stripe **Checkout Session** (`createCheckoutSession`, `POST /v1/billing/checkout`) for card entry + discount-code redemption, births the subscription, then redirects back (see the 2026-07-25 update note above). The Customer Portal is the MANAGE door once a subscription exists, not the set-up door.

On `customer.subscription.updated` webhook (trial → active): update `billing_customers.subscription_status`, update module items to match chosen modules, gate unchosen modules.

### Trial expiry without payment

`customer.subscription.trial_will_end` → if no payment method after day 14:

- Mark subscription as `canceled`
- Disable all modules (set `enabled: false` in `Tenant.settings.modules`)
- Store goes read-only (site still renders but returns "store currently unavailable" on checkout)
- Data retained 30 days per docs/17 §6

---

## Phase 4 — Module activation & deactivation

This is the core billing engine: every module add/remove is a Stripe subscription item change.

### Activating a module

`POST /v1/billing/modules/:moduleKey/activate`:

1. Check `billing_customers.subscription_status` is `active` or `trialing`
2. `stripe.subscriptionItems.create({ subscription, price: PRICE_CATALOG[moduleKey][interval] })` → returns new subscription item
3. Insert `billing_subscription_items` row
4. Set `Tenant.settings.modules[moduleKey].enabled = true` (publishes `module.activated` Pub/Sub event)
5. Proration is automatic (Stripe default behavior — new item prorated to current period end)

### Deactivating a module

`POST /v1/billing/modules/:moduleKey/deactivate`:

1. `stripe.subscriptionItems.del(subscriptionItemId, { proration_behavior: 'credit_proration' })`
2. Delete `billing_subscription_items` row
3. Set `Tenant.settings.modules[moduleKey].enabled = false` (publishes `module.deactivated`)
4. Module routes return 404 from this point

### B2B requires Commerce guard

`POST /v1/billing/modules/b2b/activate` validates that `commerce` is already active. Returns `400` with clear error message if not.

---

## Phase 5 — Stripe Customer Portal

Tenants manage their subscription entirely through the embedded Stripe Customer Portal. No custom billing UI needed.

`GET /v1/billing/portal` → server-side creates a Stripe Billing Portal session and returns the URL:

```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: tenant.stripeCustomerId,
  return_url: `${SPARX_APP_URL}/settings/billing`,
});
return redirect(session.url);
```

The portal allows tenants to:

- View current modules and costs
- Add/remove modules (via Stripe's own item management)
- Switch monthly ↔ annual
- Update payment method
- Download invoices
- Cancel subscription (with exit survey)

Dashboard `/settings/billing`:

- Current plan summary (active modules, next billing date, amount)
- ~~Transaction fee tier display (0.5% / 0.3% / 0% based on active modules)~~ —
  removed 2026-07-22 (no tiers; sparx Pay's flat 0.5% is charged in-flow, docs/94 §8)
- "Manage billing" button → Stripe Customer Portal
- Invoice history (last 5 invoices with download links — fetched from Stripe API)

---

## Phase 6 — Webhooks

`POST /v1/webhooks/stripe/billing` (separate from the commerce webhook handler — different signing secret):

| Event                                  | Action                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `customer.subscription.trial_will_end` | Show day-12 plan-selection banner                                             |
| `customer.subscription.updated`        | Sync `billing_customers` + `billing_subscription_items` + module flags        |
| `customer.subscription.deleted`        | Mark tenant inactive, disable all modules, begin 30-day retention window      |
| `invoice.payment_succeeded`            | Update `subscription_status: active`, clear any past_due banners              |
| `invoice.payment_failed`               | Set `subscription_status: past_due`, show payment-failure banner in dashboard |
| `invoice.payment_action_required`      | SCA/3DS required — prompt tenant to authenticate                              |

Retry logic: Stripe retries failed payments 3 times over 7 days. After 7 days unpaid: `subscription_status: past_due` → store read-only. After 30 days: `subscription_status: canceled` → begin data retention countdown.

### Module sync on webhook

`customer.subscription.updated` is the source of truth for which modules are active. The webhook handler must reconcile `billing_subscription_items` against `Tenant.settings.modules` — if Stripe's subscription items include `commerce` but `modules.commerce.enabled = false`, fix it (and vice versa). This prevents drift between Stripe state and platform module flags.

---

## Phase 7 — Transaction fee enforcement — REMOVED (2026-07-22)

> **Historical.** This phase was **removed**. There are no plan tiers, only modules, so
> the tiered metered fee below (`recordTransactionFee`, `getActiveModulesTotal`, the
> `transaction_fee` meter) no longer exists in code. The sole platform payment fee is
> sparx Pay's **flat 0.5%**, taken at charge time via `application_fee_amount` and
> recorded on `payment_intents.platform_fee` (docs/94 §8). The design below is retained
> for context only.

Transaction fee calculation runs at order completion time (`POST /v1/checkout/sessions/:id/complete`):

`getActiveModulesTotal(tenantId)` lives in `wizeworks/packages/billing/src/active-total.ts`. It queries `billing_subscription_items` for the tenant, maps each `module_key` to its monthly-equivalent price from `PRICE_CATALOG` (annual prices divided by 12, rounded up), and returns the sum in cents. It does not call Stripe — it reads our own DB rows, which are the source of truth for what modules are active and at what price.

```typescript
const modules = tenant.settings.modules;
const monthlySpend = await getActiveModulesTotal(tenantId); // sum from billing_subscription_items × PRICE_CATALOG
const feeRate =
  monthlySpend >= 299_00 ? 0 : modules.crm?.enabled ? 0.003 : modules.commerce?.enabled ? 0.005 : 0;

const transactionFee = Math.round(order.total * feeRate);
if (transactionFee > 0) {
  await stripe.billing.meterEvents.create({
    eventName: 'transaction_fee',
    payload: { value: String(transactionFee), stripe_customer_id: tenant.stripeCustomerId },
  });
}
```

Fees appear on the tenant's Stripe invoice at end of billing period.

---

## Phase 8 — Enterprise & managed hosting

Enterprise tenants (Gillett Diesel) are provisioned manually:

1. Create Stripe Customer manually (or via API)
2. Set all module flags to `enabled: true` manually in DB
3. Create Stripe Subscription with custom pricing items
4. Add Managed Hosting subscription item (`STRIPE_PRICE_MANAGED_HOSTING_MONTHLY`)
5. Flag tenant as `plan_type: enterprise` in `billing_customers` (additional column)

Dashboard for enterprise tenants: billing section shows "Enterprise plan — contact support for changes" with a support email link. Portal button still works for invoices/payment method updates.

TF addition: no infrastructure changes for enterprise provisioning. It's a data operation.

---

## Build order summary

| #     | Phase                                     | Notes                                                              |
| ----- | ----------------------------------------- | ------------------------------------------------------------------ |
| 1     | Ph1 Stripe product catalog                | Manual Stripe Dashboard work + Secret Manager                      |
| 2     | Ph2 DB schema + Stripe Customer on signup | Requires Tier 1 Checkout Ph1                                       |
| 3     | Ph3 Trial lifecycle                       | After Ph2                                                          |
| 4     | Ph4 Module activation/deactivation        | After Ph2–3                                                        |
| 5     | Ph5 Customer Portal + billing settings UI | After Ph4                                                          |
| 6     | Ph6 Webhook handler                       | After Ph2                                                          |
| ~~7~~ | ~~Ph7 Transaction fee metering~~          | **REMOVED 2026-07-22** — flat 0.5% sparx Pay fee only (docs/94 §8) |
| 8     | Ph8 Enterprise provisioning               | Manual; after Ph2                                                  |

**Pre-launch checklist before enabling billing on any live tenant:**

- [ ] All modules passing functional tests
- [ ] Stripe webhook endpoint registered + verified in Stripe Dashboard
- [ ] `STRIPE_WEBHOOK_SECRET_BILLING` in Secret Manager
- [ ] Tested full trial → plan-selection → payment → module-gate flow in staging
- [ ] Tested failed payment → past_due → canceled flow in staging (use Stripe test mode)
- [ ] Enterprise tenants (Gillett Diesel) provisioned manually before billing goes live
