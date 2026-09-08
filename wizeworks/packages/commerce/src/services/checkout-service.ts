// checkoutService — multi-step state machine driving cart → order.
//
// State machine:
//   cart_review → contact → shipping → payment → review → completed
//                                                       ↘ expired
//
// All side effects (payment intent, shipping rate, tax calculation) are
// captured as provider refs on CheckoutSession so the flow is idempotent
// across reloads. complete() is the single function that creates an
// Order via @wizeworks/crm's orderService and fires the post-commit events
// (order.placed, inventory.adjusted, email.send).

import { orderService, orderPaymentsService, b2bArService } from '@wizeworks/crm';
import {
  type AppliedSurcharge,
  applySurcharges,
  type CartMadeToOrder,
  type CheckoutSessionSnapshot,
  commissionCents,
  CompleteCheckoutInput,
  StartCheckoutInput,
  SubmitContactInput,
  SubmitPaymentInput,
  SubmitShippingInput,
  type SurchargePaymentMethod,
} from '@wizeworks/commerce-schemas';
import {
  createMarketPaymentIntent,
  GatewayNotFoundError,
  type PaymentIntent,
  PaymentConfigError,
  type PaymentGateway,
  type PaymentIntentStatus,
  paymentService,
  SPARX_MARKET_GATEWAY_ID,
} from '@wizeworks/payments';
import { Prisma, withTenant } from '@wizeworks/db';
import type { CheckoutSession, TxClient } from '@wizeworks/db';
import { inventoryService, type CommittedSale } from '@wizeworks/inventory';
// purchaseApprovalRule not in generated types until migration 20260716000000 runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = TxClient & Record<string, any>;

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';
import { isInventoryActive } from '../inventory-gate';

import * as cartService from './cart-service';
import { apportionToLines, gatherCartFacts, readConditions } from './discount-conditions';
import * as discountService from './discount-service';
import * as madeToOrderService from './made-to-order-service';
import * as marketService from './market';
import * as pricingService from './pricing-service';
import * as shippingService from './shipping-service';
import * as taxService from './tax-service';
import { taxRegionCode } from './tax-region';
import { resolveShipFromAddress } from './shipping-request-resolver';
import type {
  AddressSnapshot as AddressSnapshotType,
  TaxBreakdown,
} from '@wizeworks/commerce-schemas';
import { describeRate, isCollection } from './collection-option';
import * as surchargeService from './surcharge-service';

function parseDueDays(paymentTerms: string | null | undefined): number {
  if (!paymentTerms) return 30;
  const m = /^net(\d+)$/i.exec(paymentTerms);
  return m?.[1] ? parseInt(m[1], 10) : 30;
}

const DEFAULT_SESSION_TTL_MIN = 60; // 1 hour

/** The gateway that means "we take payment ourselves" — over the counter, on
 *  collection, by arrangement. It has a catalog entry and no adapter, because
 *  recording a payment by hand has nothing to dispatch. */
const MANUAL_GATEWAY_ID = 'manual';

// Valid transitions. Anything outside this table is a 409 CONFLICT.
const STEP_ORDER: Record<string, number> = {
  cart_review: 0,
  contact: 1,
  shipping: 2,
  payment: 3,
  review: 4,
  completed: 5,
  expired: 5,
};

// ─── start ───────────────────────────────────────────────────────────

export async function start(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ sessionId: string }> {
  const input = StartCheckoutInput.parse(rawInput);

  const sessionId = await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      // `abandonedAt` deliberately NOT filtered here - see markAbandoned.
      where: { id: input.cartId },
      include: { items: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);
    if (cart.items.length === 0) {
      throw new CommerceValidationError('Cannot start checkout on an empty cart');
    }
    if (cart.currency !== input.currency) {
      throw new CommerceValidationError(
        `Cart currency ${cart.currency} does not match checkout currency ${input.currency}`
      );
    }

    // If an active session already exists for this cart, return it
    // instead of opening a parallel one. Idempotent start.
    const existing = await tx.checkoutSession.findFirst({
      where: {
        cartId: input.cartId,
        step: { notIn: ['completed', 'expired'] },
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing.id;

    // customerId/companyId are resolved server-side from the cart — never
    // trusted from the client. A cart already carries the right customerId
    // once the shopper is logged in (claimGuestCart() on login/signup), so
    // this is the same signal cart-service's pricing resolution already
    // uses; membership must additionally be ACTIVE (resolveActiveB2bAccountId)
    // so a deactivated contact doesn't carry net-terms eligibility forward.
    const customer = cart.customerId
      ? await tx.customer.findFirst({
          where: { id: cart.customerId },
          select: { companyId: true },
        })
      : null;
    const companyId = await pricingService.resolveActiveB2bAccountId(
      tx,
      cart.customerId ?? undefined,
      customer?.companyId
    );

    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MIN * 60_000);
    const session = await tx.checkoutSession.create({
      data: {
        tenantId: ctx.tenantId,
        cartId: input.cartId,
        step: 'cart_review',
        channel: input.channel,
        currency: input.currency,
        customerId: cart.customerId ?? null,
        companyId: companyId ?? null,
        customerEmail: input.customerEmail ?? null,
        subtotalCents: cart.subtotalCents,
        discountTotalCents: cart.discountTotalCents,
        shippingTotalCents: cart.shippingTotalCents,
        taxTotalCents: cart.taxTotalCents,
        giftCardAppliedCents: cart.giftCardAppliedCents,
        accountCreditAppliedCents: cart.accountCreditAppliedCents,
        totalCents: cart.totalCents,
        expiresAt,
      },
      select: { id: true },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.checkout.started',
      entityType: 'CheckoutSession',
      entityId: session.id,
      diff: { after: { cartId: input.cartId, channel: input.channel } },
    });

    return session.id;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'checkout.started',
    data: { sessionId, cartId: input.cartId, channel: input.channel },
  });

  return { sessionId };
}

/** A cart's applied savings, split across the lines that earned them.
 *
 *  One pass of `gatherCartFacts` for all of them: the facts a condition can ask
 *  about are the same basket whichever code is being weighed, and it is the
 *  lookups (collections, segments, B2B membership) that cost anything. */
async function apportionCartDiscounts(
  tx: TxClient,
  cart: { id: string; customerId: string | null; channel: string }
): Promise<Map<string, number>> {
  const byLine = new Map<string, number>();
  // Read fresh rather than off the loaded cart: settling the basket just above
  // may have deleted a saving whose sale ended, and a stale copy would put cents
  // on lines the order header no longer carries.
  const rows = await tx.cartDiscount.findMany({
    where: { cartId: cart.id },
    select: { appliedCents: true, discount: { select: { conditions: true } } },
  });
  if (rows.length === 0) return byLine;

  const each = rows.map((applied) => ({
    conditions: readConditions(applied.discount.conditions),
    appliedCents: applied.appliedCents,
  }));
  const facts = await gatherCartFacts(
    tx,
    cart,
    each.flatMap((applied) => applied.conditions)
  );
  for (const applied of each) {
    for (const [lineId, cents] of apportionToLines(
      applied.conditions,
      facts,
      applied.appliedCents
    )) {
      byLine.set(lineId, (byLine.get(lineId) ?? 0) + cents);
    }
  }
  return byLine;
}

// ─── reads ───────────────────────────────────────────────────────────

/**
 * Bring an in-flight session's money back in line with the basket it belongs to.
 *
 * `start()` takes a snapshot, and a basket goes on changing after that: a code
 * typed on a second visit to the cart, or a sale that ended underneath one. The
 * snapshot was never refreshed, so the review step and the button showed a total
 * the basket no longer agreed with, and the order was written from the stale one
 * (issues 300 and 301). A completed or expired session keeps what it froze —
 * that is a record, not a quote.
 */
async function syncSessionToCart<T extends CheckoutSession | null>(
  tx: TxClient,
  ctx: ServiceContext,
  row: T
): Promise<T> {
  if (!row) return row;
  if (row.step === 'completed' || row.step === 'expired') return row;

  await cartService.recomputeCartTotals(tx, ctx, row.cartId);
  const cart = await tx.cart.findFirst({
    where: { id: row.cartId },
    // The gift card belongs here for exactly the reason the discount does: it is
    // reserved on the BASKET, and a shopper can put one on after checkout began.
    // Syncing the discount and not the card left a session priced without a card
    // the basket was already holding — the shopper saw the reduction in the cart
    // and full price at the till.
    select: { subtotalCents: true, discountTotalCents: true, giftCardAppliedCents: true },
  });
  if (
    !cart ||
    (cart.subtotalCents === row.subtotalCents &&
      cart.discountTotalCents === row.discountTotalCents &&
      cart.giftCardAppliedCents === row.giftCardAppliedCents)
  ) {
    return row;
  }

  const totalCents = Math.max(
    0,
    cart.subtotalCents -
      cart.discountTotalCents -
      cart.giftCardAppliedCents -
      row.accountCreditAppliedCents +
      row.shippingTotalCents +
      row.taxTotalCents
  );
  return (await tx.checkoutSession.update({
    where: { id: row.id },
    data: {
      subtotalCents: cart.subtotalCents,
      discountTotalCents: cart.discountTotalCents,
      giftCardAppliedCents: cart.giftCardAppliedCents,
      totalCents,
    },
  })) as T;
}

export async function get(
  ctx: ServiceContext,
  sessionId: string
): Promise<CheckoutSessionSnapshot | null> {
  // Outside the transaction: it reads the tenant's payment config, and holding a
  // tenant transaction open across it buys nothing.
  const paymentMode = await resolvePaymentMode(ctx.tenantId);
  return withTenant(ctx, async (tx) => {
    const row = await syncSessionToCart(
      tx,
      ctx,
      await tx.checkoutSession.findFirst({ where: { id: sessionId } })
    );
    if (!row) return null;

    // Surcharge disclosure (docs/48 §6): a completed/expired session already
    // froze its surcharge into surcharge_total_cents + total; an in-flight
    // session computes it live from the active rules + the best-known payment
    // method so the storefront can disclose the fee BEFORE the customer pays.
    // Either way we recompute against active rules to surface the label.
    const specs = await surchargeService.listActiveSpecs(ctx, 'checkout', tx);
    const surcharge = applySurcharges(specs, {
      subtotalCents: Math.max(0, row.subtotalCents - row.discountTotalCents),
      shippingCents: row.shippingTotalCents,
      taxCents: row.taxTotalCents,
      paymentMethod: surchargeMethodForSession(row),
    });
    const terminal = row.step === 'completed' || row.step === 'expired';
    const surchargeTotalCents = terminal ? row.surchargeTotalCents : surcharge.totalCents;
    const totalCents = terminal ? row.totalCents : row.totalCents + surcharge.totalCents;

    const account = row.companyId
      ? await tx.company.findFirst({
          where: { id: row.companyId },
          select: { paymentTerms: true },
        })
      : null;

    return serializeSession(
      row,
      {
        surchargeTotalCents,
        totalCents,
        surchargeLabel: surchargeLabelFor(surcharge.applied),
      },
      paymentMode,
      // Against the LIVE total, surcharge included — the split has to be taken
      // from the number the storefront is about to show, or the card form says
      // one thing and the gateway charges another.
      await madeToOrderService.forCart(tx, row.cartId, totalCents),
      account?.paymentTerms
    );
  });
}

// ─── step transitions ────────────────────────────────────────────────

export async function submitContact(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SubmitContactInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const session = await assertSessionWritable(tx, input.sessionId);

    // GIVING AN EMAIL IS IDENTIFYING YOURSELF, and until now nothing acted on it:
    // the address went onto the session and the cart stayed anonymous until the
    // order was placed. Everything that asks "who is this" therefore got null —
    // most visibly the per-customer discount limit, which skips silently on a
    // null customer, so "one per customer" was unenforceable for a guest.
    //
    // Recognise a returning shopper; do NOT create a record for a new one.
    // `ensureCheckoutCustomer` at order placement is what mints a customer, and
    // it promotes them to the customer lifecycle stage — which is true of
    // somebody who bought and false of somebody still typing their address.
    const known = await linkKnownCustomer(tx, session.cartId, input.email);

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: furthestStep(session.step, 'contact'),
        ...(known ? { customerId: known } : {}),
        customerEmail: input.email,
        // Trimmed to null rather than stored blank: an empty string here would
        // read as somebody who was asked and declined, which is not the same as
        // a form that never had the field (issue 064).
        customerName: blankToNull(input.name),
        customerPhone: input.phone ?? null,
        acceptsMarketing: input.acceptsMarketing,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.checkout.contact_submitted',
      entityType: 'CheckoutSession',
      entityId: session.id,
      diff: { after: { step: 'contact' } },
    });
  });
}

export async function submitShipping(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SubmitShippingInput.parse(rawInput);

  // PRICE the chosen rate server-side. This runs BEFORE the write transaction on
  // purpose: rating opens its own tenant-scoped reads (and may call a carrier), which
  // must not nest inside the update txn. We re-quote and match the caller's rateRef
  // rather than accepting an amount from the client — a shopper could otherwise post
  // a $0 shipping charge. Storing only the ref (the old behaviour) meant
  // `shippingTotalCents` stayed 0 and every order shipped FREE regardless of the
  // option chosen, silently eating the merchant's shipping cost (BUG-005).
  const owner = await withTenant(ctx, (tx) =>
    tx.checkoutSession.findFirst({
      where: { id: input.sessionId },
      select: { cartId: true, customerId: true },
    })
  );
  if (!owner) throw new CommerceNotFoundError('CheckoutSession', input.sessionId);

  const rates = await shippingService.quoteForCart(ctx, {
    cartId: owner.cartId,
    // Absent when the order is being collected, and `quoteForCart` rates that
    // as the question it is rather than making us invent a street to ask it
    // with (issue 064).
    ...(input.shippingAddress ? { toAddress: input.shippingAddress } : {}),
  });
  // Match the chosen option in this FRESH quote. Prefer the exact ref (manual
  // rates carry a deterministic ref that survives a re-quote), then fall back to
  // the stable service identity: live carriers (Shippo) mint a new single-use
  // `rateRef` on every rating call, so the ref the shopper saw is never in the
  // re-quote and ref-only matching dead-ends every live-carrier checkout
  // (BUG-010). Either way the amount comes from THIS server quote, never the
  // client, so the BUG-005 "can't post $0 shipping" protection is intact.
  const chosen =
    rates.find((r) => r.rateRef === input.shippingRateRef) ??
    (input.shippingService
      ? rates.find(
          (r) =>
            r.providerSlug === input.shippingProviderSlug &&
            r.service === input.shippingService &&
            (input.shippingCarrier == null || r.carrier === input.shippingCarrier)
        )
      : undefined);
  if (!chosen) {
    // The quote the shopper saw is gone (rates changed, or a carrier dropped it).
    // Refuse rather than silently charging nothing for shipping.
    throw new CommerceValidationError(
      'That shipping option is no longer available — please choose a shipping method again.'
    );
  }

  // An address is optional, but only in the one case where there is genuinely
  // nowhere to send anything. A DELIVERY with no destination must never be
  // accepted: it would produce an order the shop cannot fulfil and cannot even
  // ask about, and the client is not the thing that gets to decide this.
  if (!input.shippingAddress && !isCollection(chosen)) {
    throw new CommerceValidationError(
      'This order is being delivered, so it needs an address to be delivered to.'
    );
  }

  // TAX, priced here for exactly the reasons shipping is: it needs its own
  // tenant-scoped reads, it must not nest inside the write transaction, and it
  // must never come from the client.
  //
  // Nothing called `taxService.calculate` before this — not checkout, not the
  // cart, not the B2B flow — so `taxTotalCents` stayed 0 on every order the
  // platform has ever taken, while Sell › Tax showed places in green marked
  // "Collecting" (issue 428). A shop that must charge sales tax charged none and
  // still owed it.
  const taxBreakdown = await quoteTaxForSession(ctx, {
    cartId: owner.cartId,
    customerId: owner.customerId,
    shippingAddress: input.shippingAddress,
    shippingAmountCents: chosen.amountCents,
  });

  await withTenant(ctx, async (tx) => {
    const session = await assertSessionWritable(tx, input.sessionId);
    // Re-point the total at the newly chosen rate: swap out whatever shipping the
    // session was carrying (0 on first pass, the previous pick on a change) for this
    // one, so going back and switching methods can't stack charges. Tax is swapped
    // the same way, and for the same reason — it moves when the address or the
    // delivery price does.
    const nextTaxCents = taxBreakdown?.totalTaxCents ?? 0;
    const nextTotalCents =
      session.totalCents -
      session.shippingTotalCents +
      chosen.amountCents -
      session.taxTotalCents +
      nextTaxCents;
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: furthestStep(session.step, 'shipping'),
        // Null, not a placeholder. Nothing is being posted, so there is no
        // address, and every screen that reads this one must be able to tell
        // "collected" from "we lost the address" (issue 064).
        // `Prisma.DbNull`, not `null`: on a nullable Json column that is the
        // difference between an empty column and the JSON value `null`, and
        // only the first of those is "there is no address".
        shippingAddress: input.shippingAddress ?? Prisma.DbNull,
        billingAddress: input.billingAddress ?? input.shippingAddress ?? Prisma.DbNull,
        // Record what we actually priced from this quote, not the (possibly
        // stale, single-use) ref the client sent.
        shippingProviderSlug: chosen.providerSlug,
        shippingRateRef: chosen.rateRef,
        shippingTotalCents: chosen.amountCents,
        shippingDescription: describeRate(chosen),
        taxTotalCents: nextTaxCents,
        // Null rather than a stale ref when nothing was taxable: a breakdown
        // reference that points at a calculation for a different address is
        // worse than none when somebody asks why they were charged.
        taxProviderSlug: taxBreakdown?.providerSlug ?? null,
        taxBreakdownRef: taxBreakdown?.breakdownRef ?? null,
        taxBreakdown: taxBreakdown
          ? (taxBreakdown as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        totalCents: nextTotalCents,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.checkout.shipping_submitted',
      entityType: 'CheckoutSession',
      entityId: session.id,
      diff: {
        after: {
          step: 'shipping',
          shippingProviderSlug: chosen.providerSlug,
          shippingRateRef: chosen.rateRef,
        },
      },
    });
  });
}

export async function submitPayment(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SubmitPaymentInput.parse(rawInput);
  const paymentMode = await resolvePaymentMode(ctx.tenantId);
  await withTenant(ctx, async (tx) => {
    const session = await assertSessionWritable(tx, input.sessionId);

    // PO numbers / net-terms are accepted whenever the checking-out customer
    // is an active B2B contact — never gated on channel (a B2B customer
    // orders on the same checkout everyone uses, per docs/10 §11). Exactly
    // one of "bill to account" or "pay by card" must be present.
    const billToAccount = Boolean(input.poNumber ?? input.paymentTermsRequested);
    if (billToAccount && !session.companyId) {
      throw new CommerceValidationError(
        'PO numbers and net terms are only available to B2B accounts'
      );
    }
    if (billToAccount && session.companyId) {
      const account = await tx.company.findFirst({
        where: { id: session.companyId },
        select: { paymentTerms: true },
      });
      if (account?.paymentTerms === 'prepay') {
        throw new CommerceValidationError(
          'This account is set up for prepayment — pay by card to complete your order.'
        );
      }
    }
    // The third way to owe money for something, after a card and a B2B account:
    // the business takes payment ITSELF — over the counter, on collection, by
    // arrangement. `complete()` has always supported it (a manual order carries
    // no paymentRef, exactly like net terms); this is the gate that refused to
    // let one through, so a shop that picked "Manual payments" in the provider
    // picker had a checkout that could not finish.
    //
    // Decided HERE, from the tenant's own configuration, and never from a flag
    // the client sends: otherwise any caller could declare itself paid in person
    // and place an order a card-taking shop expects money for.
    const inPerson = paymentMode === 'in_person';
    if (!billToAccount && !inPerson && !(input.paymentProviderSlug && input.paymentRef)) {
      throw new CommerceValidationError(
        'A payment provider is required unless billing to a B2B account'
      );
    }

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: 'review',
        // Recorded as the manual gateway with no ref, so the order says how it
        // is to be settled rather than looking like a card order that lost its
        // reference.
        paymentProviderSlug:
          input.paymentProviderSlug ?? (inPerson && !billToAccount ? MANUAL_GATEWAY_ID : undefined),
        paymentRef: input.paymentRef,
        poNumber: input.poNumber ?? null,
        paymentTermsRequested: input.paymentTermsRequested ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.checkout.payment_submitted',
      entityType: 'CheckoutSession',
      entityId: session.id,
      diff: {
        after: {
          step: 'review',
          paymentProviderSlug: input.paymentProviderSlug,
        },
      },
    });
  });
}

// ─── payment intent ──────────────────────────────────────────────────
//
// Storefront calls this after the customer reaches the payment step.
// It (a) resolves the active payment provider, (b) creates a real
// payment intent against the merchant's account, (c) persists the
// resulting paymentRef + providerSlug on the session, and (d) returns
// the clientSecret so Stripe Elements (or equivalent) can confirm in
// the browser. Idempotency: re-calls on the same session return the
// existing paymentRef instead of opening a parallel intent.

export interface CreatePaymentIntentResult {
  paymentRef: string;
  providerSlug: string;
  /** Inline (Stripe-family) gateways — confirm in the browser with Elements. */
  clientSecret?: string;
  /** The publishable key the browser must load Stripe.js with, when it isn't the
   *  platform's. Present for `stripe_direct` (the intent is on the merchant's own
   *  account); absent for sparx Pay / sparx.market, where the storefront's build-time
   *  key is already the right account. */
  publishableKey?: string;
  /** Hosted-redirect gateways (Square / Authorize.net / 1stPay / custom, docs/111 D4)
   *  — the vendor page the storefront sends the shopper to. When a token also rides in
   *  `clientSecret` (Authorize.net Accept Hosted), the storefront POSTs it. */
  redirectUrl?: string;
  amountCents: number;
  currency: string;
  status: PaymentIntentStatus;
}

/**
 * What a SHOPPER is told when the shop has no way to take their money.
 *
 * ── WHY THIS IS NOT THE OPERATOR'S SENTENCE ─────────────────────────────────
 *
 * It used to read: "Online payments are not configured for this site. Set up a
 * payment gateway in Settings → Payments."
 *
 * That is a message for the business owner, and it is thrown from a PUBLIC
 * checkout endpoint — so the only person who ever reads it is a customer. A
 * stranger who has picked out two loaves and a box of buns, typed their address
 * and clicked through three steps, is met with a red box telling them to go to a
 * settings screen they have never heard of, cannot reach, and have no business
 * being in. There is nothing they can do with that sentence.
 *
 * It also names our navigation to somebody who is not in our product. "Settings →
 * Payments" is workbench's furniture; on the shop it is somebody else's software
 * leaking through the wall.
 *
 * So: say what is true, say that no money has moved, and point at the one thing
 * that CAN still get them their bread — the shop itself, whose phone number and
 * address are already on the page underneath this message.
 *
 * The owner's half of this problem is not solved here. It belongs on their own
 * screens, where they can act on it.
 */
const NO_PAYMENTS_MESSAGE =
  'This shop cannot take card payments online just yet, so the order cannot be finished here. ' +
  'Nothing has been charged. Get in touch with the shop to arrange it — their details are on this site.';

/**
 * How this shop can be paid, as the storefront needs to know it.
 *
 * Read from the tenant's own configuration rather than guessed. The three
 * answers are genuinely different situations with different screens, and
 * collapsing them is what produced [#038]: a business on MANUAL payments — an
 * option the picker openly offers, describing itself as "No fee. No online card
 * processing" — got the same red dead end as a business with nothing set up at
 * all, because the storefront only ever knew how to draw a card form.
 *
 * Never throws. A shop whose gateway cannot be resolved is `unavailable`, which
 * is the honest answer and the one that renders a message a customer can act on.
 *
 * EXPORTED because checkout is not the first place a shopper needs the answer.
 * A product page that says "Pay $30.00 today" and a basket that says "To pay at
 * checkout" are both describing a card charge, and at a shop that settles in the
 * room neither happens (issue 185) — so the storefront learns the mode with the
 * rest of the site payload rather than only once checkout has begun.
 */
export async function resolvePaymentMode(
  tenantId: string
): Promise<'card' | 'in_person' | 'unavailable'> {
  // Read the tenant's CONFIG, not the adapter registry.
  //
  // `getGatewayForTenant` resolves an adapter, and `manual` deliberately has
  // none — recording a payment by hand has nothing to dispatch, which the
  // integration registry's own comment calls out as expected. So asking the
  // registry about a manual shop throws, and the first version of this function
  // read that throw as "cannot be paid" — the exact answer it exists to avoid.
  const config = await withTenant({ tenantId }, (tx) =>
    tx.tenantPaymentConfig.findUnique({
      where: { tenantId },
      select: { gatewayId: true, isActive: true },
    })
  );
  if (!config) return 'unavailable';
  if (config.gatewayId === MANUAL_GATEWAY_ID) return 'in_person';
  // Chosen but not collecting is not the same as chosen: a gateway with its keys
  // still missing takes no money, and saying `card` would draw a form that
  // cannot work.
  return config.isActive ? 'card' : 'unavailable';
}

/** Resolve the tenant's active payment gateway, or surface a clean validation error
 *  when the tenant is on manual payments / has no gateway configured. */
async function resolvePaymentGateway(tenantId: string): Promise<PaymentGateway> {
  try {
    return await paymentService.getGatewayForTenant(tenantId);
  } catch (err) {
    if (err instanceof PaymentConfigError || err instanceof GatewayNotFoundError) {
      throw new CommerceValidationError(NO_PAYMENTS_MESSAGE);
    }
    throw err;
  }
}

export async function createPaymentIntent(
  ctx: ServiceContext,
  input: { sessionId: string; idempotencyKey?: string; returnUrl?: string; cancelUrl?: string }
): Promise<CreatePaymentIntentResult> {
  const session = await withTenant(ctx, (tx) =>
    tx.checkoutSession.findFirst({ where: { id: input.sessionId } })
  );
  if (!session) throw new CommerceNotFoundError('CheckoutSession', input.sessionId);
  if (session.step === 'completed' || session.step === 'expired') {
    throw new CommerceConflictError(`Cannot create payment intent on a ${session.step} session`);
  }
  if (session.totalCents <= 0) {
    throw new CommerceValidationError('Cannot create payment intent on a zero-total session');
  }
  if (!session.customerEmail) {
    throw new CommerceValidationError(
      'Submit contact information before creating a payment intent'
    );
  }

  // Made to order (issue 026) — a deposit line is charged for its deposit and
  // no more. Everything else on the basket, tax and delivery included, is taken
  // now, so `dueNowCents` is the whole total whenever nothing asked for one.
  const madeToOrder = await withTenant(ctx, (tx) =>
    madeToOrderService.forCart(tx, session.cartId, session.totalCents)
  );
  const chargeCents = madeToOrder.dueNowCents;

  // Resolve the gateway and open the intent. The gateway sets metadata.tenantId on
  // the intent so the payment webhook can resolve the tenant; the intent id IS the
  // paymentRef the webhook later reconciles against.
  //
  // sparx.market checkouts (docs/106 §4.7) are MERCHANT-OF-RECORD: instead of the
  // tenant's gateway, the charge is a direct charge on sparx's OWN platform Stripe
  // account (no destination/transfer — the seller is settled weekly by ACH). The
  // commission is recorded on the ledger row; the SAME platform webhook reconciles.
  const metadata = {
    sparx_checkout_session_id: session.id,
    sparx_cart_id: session.cartId,
    sparx_channel: session.channel,
  };
  let providerSlug: string;
  let intent: PaymentIntent;
  if (session.channel === 'sparx_market') {
    const commissionBps = await withTenant(ctx, (tx) =>
      marketService.resolveTenantCommissionBps(tx, ctx.tenantId)
    );
    intent = await createMarketPaymentIntent({
      tenantId: ctx.tenantId,
      amountCents: chargeCents,
      currency: session.currency.toLowerCase(),
      commissionCents: commissionCents(chargeCents, commissionBps),
      metadata,
    });
    providerSlug = SPARX_MARKET_GATEWAY_ID;
  } else {
    const gateway = await resolvePaymentGateway(ctx.tenantId);
    // A gateway can resolve successfully (a stripeAccountId exists) while the
    // underlying Connect account still isn't chargeable — e.g. mid-onboarding,
    // captcha-interrupted, or since-restricted. Unlike its sibling methods
    // (confirm/capture/cancel/refund), createPaymentIntent has no internal
    // try/catch, so an account-not-ready Stripe error used to propagate raw
    // to the shopper as a generic 500. Reuse the same clean message
    // resolvePaymentGateway already gives a fully-unconfigured tenant — from
    // the shopper's side both cases mean the same thing: they can't pay yet.
    try {
      intent = await paymentService.createPaymentIntent({
        tenantId: ctx.tenantId,
        amount: chargeCents,
        currency: session.currency.toLowerCase(),
        metadata,
        ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
        ...(input.cancelUrl ? { cancelUrl: input.cancelUrl } : {}),
      });
    } catch {
      throw new CommerceValidationError(NO_PAYMENTS_MESSAGE);
    }
    providerSlug = gateway.id;
  }

  await withTenant(ctx, async (tx) => {
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        paymentProviderSlug: providerSlug,
        paymentRef: intent.id,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.checkout.payment_intent_created',
      entityType: 'CheckoutSession',
      entityId: session.id,
      diff: {
        after: { paymentProviderSlug: providerSlug, paymentRef: intent.id },
      },
    });
  });

  return {
    paymentRef: intent.id,
    providerSlug,
    ...(intent.clientSecret ? { clientSecret: intent.clientSecret } : {}),
    ...(intent.publishableKey ? { publishableKey: intent.publishableKey } : {}),
    ...(intent.redirectUrl ? { redirectUrl: intent.redirectUrl } : {}),
    amountCents: chargeCents,
    currency: session.currency,
    status: intent.status,
  };
}

// ─── complete ────────────────────────────────────────────────────────

export async function complete(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{
  orderId: string;
  orderNumber: string;
  /** True only when THIS call created the order; false on an idempotent replay.
   *  Callers gate one-shot side effects (transaction-fee metering) on it so a
   *  retried completion never double-bills. */
  freshlyPlaced: boolean;
  /** True when the order is held for B2B approval — `order.placed` (and fee
   *  metering) is deferred to the approval route. */
  pendingApproval: boolean;
  /** The gateway intent id + provider slug for a card order (absent for
   *  net-terms / manual / idempotent-replay). The checkout-complete route uses
   *  these to close the client-confirm race: right after this commits, it asks
   *  the reconciler to finish the capture if the webhook already marked the
   *  intent `succeeded` before the OrderPayment existed (BUG-002). */
  paymentRef?: string;
  paymentProviderSlug?: string;
}> {
  const input = CompleteCheckoutInput.parse(rawInput);
  const inventoryActive = await isInventoryActive(ctx.tenantId);

  // Idempotency: if a session has already been completed with this key,
  // return the prior result without recreating the order.
  const prior = await withTenant(ctx, (tx) =>
    tx.checkoutSession.findFirst({
      where: { idempotencyKey: input.idempotencyKey, step: 'completed' },
      select: { id: true, resultOrderId: true },
    })
  );
  if (prior?.resultOrderId) {
    const order = await withTenant(ctx, (tx) =>
      tx.order.findFirst({
        where: { id: prior.resultOrderId ?? '' },
        select: { id: true, orderNumber: true },
      })
    );
    if (order)
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        freshlyPlaced: false,
        pendingApproval: false,
      };
  }

  // Load the session + cart in a single transaction so we have a
  // consistent snapshot to hand to orderService.create.
  const result = await withTenant(ctx, async (tx) => {
    const session = await tx.checkoutSession.findFirst({
      where: { id: input.sessionId },
      include: {
        cart: {
          include: {
            items: { include: { variant: { include: { product: true } } } },
            // `conditions` too: a restricted offer ("15% off the core range")
            // only comes off the lines it names, and the order lines have to be
            // told which of them those were.
            discounts: { include: { discount: { select: { conditions: true } } } },
          },
        },
      },
    });
    if (!session) throw new CommerceNotFoundError('CheckoutSession', input.sessionId);
    if (session.step !== 'review') {
      throw new CommerceConflictError(
        `Cannot complete checkout from step "${session.step}"; expected "review"`
      );
    }
    // Something has to be going somewhere before an order can be placed — unless
    // nothing is being sent at all. Collecting in person has no destination by
    // definition, so demanding one was demanding a fiction (issue 064).
    if (!session.shippingAddress && !isCollection({ providerSlug: session.shippingProviderSlug })) {
      throw new CommerceValidationError('Cannot complete checkout without a shipping address');
    }
    // Re-verify B2B membership is still ACTIVE right now — the session's
    // companyId is a snapshot from start(); a long-lived session (or one
    // whose contact was deactivated mid-checkout) must not slip through on
    // a stale value for a money-committing step.
    const activeB2bAccountId = await pricingService.resolveActiveB2bAccountId(
      tx,
      session.customerId ?? undefined,
      session.companyId
    );

    if (!session.paymentProviderSlug && !activeB2bAccountId) {
      throw new CommerceValidationError(
        'Cannot complete a retail checkout without a payment provider'
      );
    }

    // B2B credit enforcement: net-terms checkouts require available credit.
    if (activeB2bAccountId && session.paymentTermsRequested) {
      const account = await tx.company.findFirst({
        where: { id: activeB2bAccountId, tenantId: ctx.tenantId },
        select: { status: true, creditLimit: true, creditUsed: true, paymentTerms: true },
      });
      if (!account) {
        throw new CommerceValidationError('B2B account not found');
      }
      if (account.status === 'credit_hold') {
        throw new CommerceValidationError(
          'Account is on credit hold — payment required before placing new orders'
        );
      }
      if (account.status === 'suspended') {
        throw new CommerceValidationError('Account is suspended — contact your account manager');
      }
      const available = Number(account.creditLimit) - Number(account.creditUsed);
      const orderDollars = session.totalCents / 100;
      if (orderDollars > available) {
        throw new CommerceValidationError(
          `Insufficient credit: $${available.toFixed(2)} available, $${orderDollars.toFixed(2)} required`
        );
      }
    }

    const cart = session.cart;

    // Origin site (docs/58 D1). The primary site identifies itself by sending no
    // `?property=`, so a cart with no site means "primary" — resolve it once here
    // and stamp it on BOTH the customer and the ORDER. The order used to take
    // `cart.propertyId` raw, so every primary-site order was site-less and vanished
    // from every site-scoped money view (Finance → Payments read "No payments yet"
    // on a paid order — BUG-004), even though the customer beside it was already
    // being defaulted to primary. Cart creation now sets this too; this stays as the
    // backstop for carts opened before that fix and for any non-storefront caller.
    const originPropertyId =
      cart.propertyId ??
      (await tx.property.findFirst({ where: { isPrimary: true }, select: { id: true } }))?.id ??
      null;

    // sparx.market checkout (docs/106 §4.7) — sparx is merchant-of-record. The order
    // persists as channel='marketplace', source='sparx_market'; sparx absorbs card
    // processing (no buyer surcharge); a settlement accrual is recorded so the seller
    // is paid `gross − commission` in the weekly ACH run.
    const isMarket = session.channel === 'sparx_market';

    // CRM owns the customer spine. A storefront/guest checkout reaches here with
    // no customerId — link-or-create a customer membership keyed on the contact
    // email and scoped to the order's origin SITE (docs/58 D2), so the order
    // attaches to a real, site-scoped customer and a later registration on this
    // site adopts the same membership instead of duplicating it. An
    // authenticated checkout that already carries a customerId keeps it.
    let customerId = session.customerId;
    if (!customerId) {
      if (!session.customerEmail) {
        throw new CommerceValidationError(
          'Checkout session must have a customer or contact email before complete()'
        );
      }
      customerId = await ensureCheckoutCustomer(
        tx,
        ctx.tenantId,
        originPropertyId,
        session.customerEmail,
        // The contact step's name first: it is the buyer, it is asked for on
        // every order, and it is there even when nothing is being posted. The
        // address is the fallback for sessions that predate that field, and for
        // any caller that still sends the name only inside one (issue 064).
        session.customerName ?? readRecipientName(session.shippingAddress)
      );
    }

    // Translate cart lines into CRM LineItemInputs. The crm-schema uses
    // decimal dollars (Money), not integer cents — convert at the
    // boundary so both modules' internal contracts stay clean.
    // What each line actually sold for. A cart keeps its saving at the header,
    // one row per code; an order line keeps its own, and every later reading of
    // that line — a refund, a margin, a commission — is taken from it. Splitting
    // it here is what stops a $42.00 shirt bought for $35.70 being refunded at
    // $42.00 (issue 298).
    const discountByLine = await apportionCartDiscounts(tx, cart);

    const items = cart.items.map((it) => ({
      productId: it.variant.productId,
      variantId: it.variantId,
      sku: it.variant.sku,
      name: it.variant.product.title,
      quantity: it.quantity,
      unitPrice: it.unitPriceCents / 100,
      discountAmount: (discountByLine.get(it.id) ?? 0) / 100,
    }));

    // The basket, settled, is what this order is priced from — not the snapshot
    // start() took, which is as old as the moment checkout began. `get()` keeps
    // an in-flight session in line on every step so the button already shows
    // this; doing it again here closes the gap between that read and the press.
    await cartService.recomputeCartTotals(tx, ctx, cart.id);
    const settled = await tx.cart.findFirstOrThrow({
      where: { id: cart.id },
      // pricingTrace carries WHICH gift card is reserved. The scalar beside it
      // says how much; only the trace says which card to debit, and the order
      // cannot be written before that is known.
      select: {
        subtotalCents: true,
        discountTotalCents: true,
        giftCardAppliedCents: true,
        pricingTrace: true,
      },
    });
    // `get()` keeps the two in line on every step, so a difference here means the
    // basket moved between the page being drawn and this button being pressed —
    // a sale ending in those seconds, most likely. STOP rather than write an
    // order for a number she was never shown: charging more than the button said
    // is the defect this run opened with (issue 298), and it is no better for
    // arriving a different way.
    if (
      settled.subtotalCents !== session.subtotalCents ||
      settled.discountTotalCents !== session.discountTotalCents ||
      settled.giftCardAppliedCents !== session.giftCardAppliedCents
    ) {
      throw new CommerceConflictError(
        'Your basket changed while you were checking out. Open it again to see the current total.'
      );
    }

    // WHICH gift card this basket is holding. The scalar says how much; only the
    // trace says which card, and both the order's record and the debit below
    // need the identity rather than the amount.
    const reservedCard = discountService.giftCardOnCart(settled.pricingTrace);

    // Today's allowance, re-checked at the binding moment (issue 026). The cart
    // checked it too, but a basket can sit open past midnight or past the last
    // one somebody else took, and this is the call that actually commits.
    await madeToOrderService.assertWithinDailyLimits(
      tx,
      cart.items.map((it) => ({ variantId: it.variantId, quantity: it.quantity }))
    );

    const subtotalDollars = settled.subtotalCents / 100;
    const discountDollars = settled.discountTotalCents / 100;
    const shippingDollars = session.shippingTotalCents / 100;
    const taxDollars = session.taxTotalCents / 100;

    // Document surcharge (docs/48 §6) — computed AFTER tax, gated by payment
    // method. Card-processor checkouts classify as 'card'; B2B net-terms / no
    // provider as 'account' (no card fee). Basis reads the post-discount amounts.
    // sparx.market absorbs processing (sparx is MoR) → no buyer-facing surcharge.
    const surcharge: { totalCents: number; applied: AppliedSurcharge[] } = isMarket
      ? { totalCents: 0, applied: [] }
      : applySurcharges(await surchargeService.listActiveSpecs(ctx, 'checkout', tx), {
          subtotalCents: Math.max(0, settled.subtotalCents - settled.discountTotalCents),
          shippingCents: session.shippingTotalCents,
          taxCents: session.taxTotalCents,
          paymentMethod: surchargeMethodForSession(session),
        });
    const surchargeDollars = surcharge.totalCents / 100;

    // The final split (issue 026), against the total the order is actually being
    // written with — surcharge included, which is why it is resolved here rather
    // than reused from the payment-intent step.
    const orderTotalCents =
      Math.max(
        0,
        settled.subtotalCents -
          settled.discountTotalCents -
          session.giftCardAppliedCents -
          session.accountCreditAppliedCents +
          session.shippingTotalCents +
          session.taxTotalCents
      ) + surcharge.totalCents;

    // The last word belongs to the number she was looking at. The checks above
    // keep the SERVER consistent with itself; only this one can tell that the
    // page in front of her had gone stale — a sale ending after the review step
    // was drawn leaves a correct server and a wrong button, and the order must
    // not be written for the figure only one of them knows (issues 298, 300).
    if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== orderTotalCents) {
      throw new CommerceConflictError(
        'The total changed while you were checking out. Open your basket to see what it comes to now.'
      );
    }

    const madeToOrder = await madeToOrderService.forCart(tx, cart.id, orderTotalCents);

    // Compose into THIS transaction (tx injection) — orderService.create opens
    // its own withTenant() when given a bare ctx, which would run in a separate,
    // isolated transaction that can't see the customer row just created above
    // (still uncommitted here). That caused a live "Customer not found" error on
    // every checkout completion — see the tx-injection comment on the B2B AR call
    // below for the established pattern this was missing.
    const order = await orderService.create(
      { ...ctx, tx },
      {
        customerId,
        // Origin site (docs/58 D1) — the storefront the order was placed on, with
        // the primary-site fallback resolved above (BUG-004).
        propertyId: originPropertyId ?? undefined,
        channel: isMarket
          ? 'marketplace'
          : session.channel === 'storefront' || session.channel === 'b2b_portal'
            ? session.channel
            : 'admin',
        source: isMarket ? 'sparx_market' : 'commerce_checkout',
        currency: session.currency,
        shippingTotal: shippingDollars,
        taxTotal: taxDollars,
        discountTotal: discountDollars,
        surchargeTotal: surchargeDollars,
        appliedSurcharges: surcharge.applied,
        // The order spine turns this into the DAY, in the business's own zone
        // (issue 026). Passed as days rather than a date so a till, an import
        // and a checkout all land on the same answer.
        ...(madeToOrder.noticeDays !== null ? { orderAheadDays: madeToOrder.noticeDays } : {}),
        // `?? undefined` and not `?? null`: the order's address fields are
        // OPTIONAL, and an explicit null fails their schema. A collected order
        // carries neither, which is the true record of it (issue 064).
        shippingAddress: (session.shippingAddress ?? undefined) as Parameters<
          typeof orderService.create
        >[1] extends infer A
          ? A
          : never,
        billingAddress: (session.billingAddress ??
          session.shippingAddress ??
          undefined) as Parameters<typeof orderService.create>[1] extends infer A ? A : never,
        items,
        metadata: {
          commerceCheckoutSessionId: session.id,
          commerceCartId: cart.id,
          paymentProviderSlug: session.paymentProviderSlug,
          paymentRef: session.paymentRef,
          shippingProviderSlug: session.shippingProviderSlug,
          shippingRateRef: session.shippingRateRef,
          // The words the shopper actually chose ("Collect in person", "USPS
          // Priority"). The ref and the slug are wire values; this is the only
          // thing on the order that a person can read, and without it the
          // console can tell you an order exists but not how it leaves.
          shippingDescription: session.shippingDescription,
          poNumber: session.poNumber,
          paymentTermsRequested: session.paymentTermsRequested,
          subtotalCents: session.subtotalCents,
          giftCardAppliedCents: session.giftCardAppliedCents,
          // The amount alone cannot answer "which card was this?" — the question
          // a shopper asks when a balance looks wrong, and the one a refund has
          // to answer before it can put money back on the right card.
          ...(reservedCard ? { giftCardCode: reservedCard.code } : {}),
          accountCreditAppliedCents: session.accountCreditAppliedCents,
        },
      }
    );

    // The gift card comes off the CARD here, and nowhere earlier. Applying one to
    // a basket only reserves it, so an abandoned basket leaves the balance whole
    // and there is no reversal step to get wrong. Composed into this transaction
    // (tx injection) so anything that fails below rolls the debit back with the
    // order: a card debited against an order that does not exist is money the
    // shopper can neither spend nor get back.
    if (reservedCard && session.giftCardAppliedCents > 0) {
      await discountService.redeemGiftCard(
        { ...ctx, tx },
        {
          giftCardId: reservedCard.id,
          deltaCents: session.giftCardAppliedCents,
          orderId: order.id,
        }
      );
      // …and the order has to KNOW it was part-paid, or the shopper pays twice.
      //
      // The order's own total is the value of the goods and the delivery: it is
      // not reduced by a gift card, because a card is not a discount. What the
      // card does is settle part of the bill, so it is recorded as MONEY IN,
      // which is what `amountPaid` and "Still owed" are already built from.
      //
      // Without this the shopper was shown "$509.00 to pay", $150 came off the
      // card, and the order was still written asking for $659 — the same $150
      // charged twice, once off the card and once on the invoice.
      await orderPaymentsService.recordPayment(
        { ...ctx, tx },
        {
          orderId: order.id,
          processor: 'gift_card',
          processorRef: reservedCard.code,
          amount: session.giftCardAppliedCents / 100,
          currency: session.currency,
          status: 'captured',
          metadata: { giftCardId: reservedCard.id, giftCardCode: reservedCard.code },
        }
      );
    }

    // Card payments: open a PENDING OrderPayment keyed to the gateway intent so the
    // payment webhook (payment.succeeded) can mark it captured + flip the order paid
    // (docs/94 ADR §10). Net-terms / manual orders carry no paymentRef — they settle
    // via the AR document or a hand-recorded payment, never a gateway intent. Also
    // back-link the payment_intents ledger row (created order-less at intent time).
    if (session.paymentRef && session.paymentProviderSlug) {
      await tx.orderPayment.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: order.id,
          processor: session.paymentProviderSlug,
          processorRef: session.paymentRef,
          // What the gateway was actually asked for, which on a deposit order
          // is less than the total. Writing the total here would show the order
          // as fully paid the moment the webhook landed, and the rest of the
          // cake would never be asked for (issue 026).
          amount: madeToOrder.dueNowCents / 100,
          currency: session.currency,
          status: 'pending',
        },
      });
      await tx.paymentIntent.updateMany({
        where: { externalId: session.paymentRef },
        data: { orderId: order.id },
      });
    }

    // sparx.market: record the settlement accrual atomically with the order so a
    // marketplace sale never lands without sparx's obligation to pay the seller
    // (gross − commission). The weekly run groups accruals into one ACH (docs/106
    // §4.7). Commission is the tenant override or the platform default.
    if (isMarket) {
      const commissionBps = await marketService.resolveTenantCommissionBps(tx, ctx.tenantId);
      await marketService.recordSettlementAccrualOnTx(tx, ctx.tenantId, {
        orderId: order.id,
        grossCents: session.totalCents,
        currency: session.currency,
        commissionBps,
        paymentRef: session.paymentRef,
      });
    }

    // B2B approval gate: if an active rule covers this account + amount, hold the
    // order for staff review instead of immediately placing it. The pending status
    // blocks invoice creation and order.placed until approved (docs/64 B2B Ph6).
    let pendingApproval = false;
    if (activeB2bAccountId) {
      // Two independent axes, so two ORs under an AND (docs/131 §4). A rule
      // covers this order when its ACCOUNT axis matches (this buyer, or any) and
      // its SITE axis matches (this business, or any). Collapsing them into one
      // OR would fire a donut-shop rule on a machine-shop order — a spending
      // control applied to a business nobody had in mind when setting it.
      const rule = await (tx as AnyTx).purchaseApprovalRule.findFirst({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          minAmountCents: { lte: session.totalCents },
          AND: [
            { OR: [{ accountId: activeB2bAccountId }, { accountId: null }] },
            { OR: [{ propertyId: order.propertyId }, { propertyId: null }] },
          ],
        },
        select: { id: true },
      });
      if (rule) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'pending_approval' },
        });
        pendingApproval = true;
      }
    }

    // B2B net-terms: auto-create the AR document and sync credit_used.
    // Skipped when the order is gated for approval — creation runs inside the
    // approval route once the order is approved.
    //
    // The receivable is now a BillingDocument on the system `net-terms-ar`
    // workflow (docs/87 §15), not a `b2b_invoices` row. createOrderArDocument
    // composes into THIS checkout transaction (tx injection) and re-syncs the
    // account's credit_used via the billing money authority.
    let b2bInvoiceId: string | null = null;
    if (!pendingApproval && activeB2bAccountId && session.paymentTermsRequested) {
      const account = await tx.company.findFirst({
        where: { id: activeB2bAccountId, tenantId: ctx.tenantId },
        select: { paymentTerms: true },
      });
      const dueDays = parseDueDays(account?.paymentTerms ?? session.paymentTermsRequested);
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + dueDays);
      // The invoice is issued by the SITE the order was placed on (docs/131
      // §3.6) — that decides whose books the number comes from and whose
      // letterhead is frozen onto it. `Order.propertyId` is nullable (SetNull:
      // orders outlive their site), while a document's issuer is required, so an
      // order with no site falls back to the tenant's primary.
      const issuingPropertyId =
        order.propertyId ??
        (
          await tx.property.findFirst({
            where: { tenantId: ctx.tenantId, isPrimary: true },
            select: { id: true },
          })
        )?.id;
      if (!issuingPropertyId) {
        throw new Error(
          `Cannot issue an AR document for order ${order.id}: tenant has no primary site.`
        );
      }
      const arDoc = await b2bArService.createOrderArDocument(
        { tenantId: ctx.tenantId, userId: ctx.userId ?? undefined, tx },
        {
          companyId: activeB2bAccountId,
          propertyId: issuingPropertyId,
          orderId: order.id,
          amount: session.totalCents / 100,
          currency: session.currency,
          dueAt,
          description: `Order ${order.orderNumber}`,
        }
      );
      b2bInvoiceId = arDoc.id;
    }

    // Decrement stock — the single sale authority (docs/100 §7.4). Each cart
    // line commits its soft hold (or decrements directly when none exists),
    // writing a `sale` movement referencing the order, atomic with this
    // completion. Skipped when the order is held for B2B approval (placement —
    // and the decrement — defers to the approval route), when inventory is off
    // (untracked = always available), or for a dropship-sourced line (the
    // supplier holds the stock — see cart-service's addItem, which never
    // reserves one of these in the first place). Idempotency keys on the
    // movements make a retried completion safe.
    let committedSales: CommittedSale[] = [];
    if (inventoryActive && !pendingApproval) {
      const trackedLines = cart.items.filter((it) => !it.variant.dropshipSourceId);
      if (trackedLines.length > 0) {
        committedSales = await inventoryService.commitSaleOnTx(tx, ctx, {
          orderId: order.id,
          lines: trackedLines.map((it) => ({
            variantId: it.variantId,
            quantity: it.quantity,
            reservationId: it.inventoryReservationId,
            lineKey: it.id,
          })),
        });
      }
    }

    // Mark the session completed + record the resulting order so the
    // idempotency-key short-circuit above can find it on retry.
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: 'completed',
        idempotencyKey: input.idempotencyKey,
        resultOrderId: order.id,
        completedAt: new Date(),
        subtotalCents: Math.round(Number(subtotalDollars) * 100),
        surchargeTotalCents: surcharge.totalCents,
        totalCents: session.totalCents + surcharge.totalCents,
      },
    });

    // Nothing is stamped on the cart to mark it bought. The session this
    // transaction just moved to `completed` IS that record, and asking it is
    // `NOT_BOUGHT_YET` in cart-service.ts.
    //
    // This used to write `recoveredAt`, borrowing the abandonment-recovery
    // column because it was nullable and meant "done with". It made every sale
    // read as a basket won back: five of Devi's completed orders sat in the
    // console's "Came back" tab and counted toward the recovery rate in a
    // shipped report (persona issue 289).

    // Record discount usage rows so per-customer + total-usage limits
    // increment now that the cart has converted.
    for (const cd of cart.discounts) {
      // Same tx-composition requirement as orderService.create above — the
      // order row this references only exists within this open transaction.
      await discountService.recordDiscountUsage(
        { ...ctx, tx },
        {
          discountId: cd.discountId,
          customerId,
          orderId: order.id,
          cartId: cart.id,
          appliedCents: cd.appliedCents,
        }
      );
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.checkout.completed',
      entityType: 'CheckoutSession',
      entityId: session.id,
      diff: { after: { orderId: order.id, orderNumber: order.orderNumber } },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      b2bInvoiceId,
      companyId: session.companyId ?? null,
      pendingApproval,
      committedSales,
      paymentRef: session.paymentRef ?? undefined,
      paymentProviderSlug: session.paymentProviderSlug ?? undefined,
    };
  });

  // Inventory threshold events (inventory.adjusted / low / depleted) fire AFTER
  // the completion transaction commits, never inside it.
  if (result.committedSales.length > 0) {
    await inventoryService.emitSaleEvents(ctx, result.committedSales);
  }

  if (result.b2bInvoiceId) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'b2b.invoice.created',
      data: {
        invoiceId: result.b2bInvoiceId,
        accountId: result.companyId,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      },
    });
  }

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'checkout.completed',
    data: {
      sessionId: input.sessionId,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      pendingApproval: result.pendingApproval,
    },
  });

  if (result.pendingApproval) {
    // Order is held for staff review — emit the approval-queue signal instead of
    // order.placed. Inventory and fulfillment listeners must NOT act until approved.
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'b2b.order.pending_approval',
      data: {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        companyId: result.companyId,
      },
    });
  } else {
    // Order placement is announced on the dedicated topic so non-CRM consumers
    // (inventory decrement, fulfillment dispatch, analytics) pick it up without
    // subscribing to checkout.completed.
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'order.placed',
      data: { orderId: result.orderId, orderNumber: result.orderNumber },
    });
  }

  return { ...result, freshlyPlaced: true };
}

// ─── expire ──────────────────────────────────────────────────────────

export async function expire(ctx: ServiceContext, sessionId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const session = await tx.checkoutSession.findFirst({
      where: { id: sessionId, step: { notIn: ['completed', 'expired'] } },
      select: { id: true },
    });
    if (!session) return;
    await tx.checkoutSession.update({
      where: { id: sessionId },
      data: { step: 'expired' },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'system',
      action: 'commerce.checkout.expired',
      entityType: 'CheckoutSession',
      entityId: sessionId,
      diff: null,
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'checkout.expired',
    data: { sessionId },
  });
}

/** Worker sweep — return ids of sessions past their TTL still in a
 *  non-terminal step so the expirer can flip them in batches. */
export async function findExpiredSessions(ctx: ServiceContext): Promise<string[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.checkoutSession.findMany({
      where: {
        step: { notIn: ['completed', 'expired'] },
        expiresAt: { lt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      take: 500,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  });
}

// ─── helpers ─────────────────────────────────────────────────────────

/**
 * Link-or-create the customer membership a guest/storefront checkout converts
 * into. Keyed on (origin site, email) to match the per-site membership model
 * (docs/58 D2): an existing membership on this site is reused (a prospect is
 * promoted to retail); otherwise a new retail membership is created on this
 * site. When the cart carries no property (e.g. the primary site sends no
 * `?property=`), we default to the tenant's primary property so this resolves
 * to the SAME membership a later account registration would (which also
 * defaults to primary) — avoiding a duplicate. Email is normalized to match how
 * the account-registration path stores it.
 */
async function ensureCheckoutCustomer(
  tx: TxClient,
  tenantId: string,
  cartPropertyId: string | null,
  email: string,
  /** What the shopper typed in "Full name" at checkout, if anything. */
  fullName?: string | null
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  let propertyId = cartPropertyId;
  if (!propertyId) {
    const primary = await tx.property.findFirst({
      where: { isPrimary: true },
      select: { id: true },
    });
    propertyId = primary?.id ?? null;
  }
  const existing = await tx.customer.findFirst({
    where: { propertyId, email: normalizedEmail, deletedAt: null },
    select: { id: true },
  });
  // Their stage is not set here. The purchase advances it, and that is derived
  // from the orders themselves in `recomputeCustomerCommerce`, which
  // `orderService.create` runs in this same transaction a moment from now. Set
  // here as well, it was a second copy of the rule that the till never got.
  if (existing) return existing.id;
  const created = await tx.customer.create({
    data: {
      tenantId,
      propertyId,
      email: normalizedEmail,
      type: 'retail',
      lifecycleStage: 'customer',
      // The name the shopper actually typed. It used to be dropped on the floor:
      // checkout REQUIRES "Full name", writes it onto the order's shipping
      // address, and then created the customer from the email alone. So the
      // business's own Orders screen showed "Who bought it:
      // rowan.pike@example.test" — the email, twice, where a person's name goes.
      // For a bakery calling out collection orders across a counter, the name is
      // the one field that matters.
      //
      // Only on CREATE. An existing customer keeps the name they gave us; a
      // one-off delivery to somebody else must not rename them.
      ...splitName(fullName),
    },
    select: { id: true },
  });
  return created.id;
}

/** A typed value, or null when nothing was typed. Deliberately not `?? null`:
 *  the case being collapsed is the EMPTY STRING, which a stored column would
 *  render as somebody who was asked and declined to answer. */
function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** The `recipientName` out of a stored address blob, if it holds one. */
export function readRecipientName(address: unknown): string | null {
  if (typeof address !== 'object' || address === null) return null;
  const name = (address as { recipientName?: unknown }).recipientName;
  return typeof name === 'string' && name.trim() !== '' ? name : null;
}

/**
 * A typed name into the two columns the schema has.
 *
 * First token is the given name, the remainder the family name — which is a
 * convention, not a truth, so it is applied ONLY where there is nothing better.
 * A single word goes entirely in `firstName` rather than being invented a
 * surname, and blank input writes nothing at all: an empty string in these
 * columns would read as "we asked and they declined", which is not what
 * happened.
 */
export function splitName(fullName?: string | null): { firstName?: string; lastName?: string } {
  const trimmed = fullName?.trim() ?? '';
  if (!trimmed) return {};
  const gap = trimmed.indexOf(' ');
  if (gap === -1) return { firstName: trimmed };
  return { firstName: trimmed.slice(0, gap), lastName: trimmed.slice(gap + 1).trim() };
}

/**
 * Attach an already-known customer to the cart, by the email they just typed.
 *
 * Returns the customer id when this address belongs to somebody the shop
 * already has, null otherwise. Scoped to the cart's own site, the same way
 * `ensureCheckoutCustomer` is, so one business cannot recognise the other's
 * shoppers. Never creates and never changes a lifecycle stage: this only
 * answers "have we met before".
 */
async function linkKnownCustomer(
  tx: TxClient,
  cartId: string,
  email: string
): Promise<string | null> {
  const cart = await tx.cart.findFirst({
    where: { id: cartId },
    select: { customerId: true, propertyId: true },
  });
  if (!cart) return null;
  if (cart.customerId) return cart.customerId;

  const existing = await tx.customer.findFirst({
    where: { propertyId: cart.propertyId, email: email.trim().toLowerCase(), deletedAt: null },
    select: { id: true },
  });
  if (!existing) return null;

  await tx.cart.update({ where: { id: cartId }, data: { customerId: existing.id } });
  return existing.id;
}

/**
 * What tax this order owes, or null when the question does not arise.
 *
 * Null means one of three honest things, and none of them is an error: the
 * order is being collected so there is no destination; the shop has no tax
 * place covering that destination; or nothing in the basket is taxable. All
 * three come back as "no tax line", which is what a shopper should see.
 *
 * The REGION is where this used to fall down even once the call existed: an
 * address carries free text ("CA", "California") and a tax place is filed as
 * "US-CA". `taxRegionCode` translates, and says nothing rather than guessing —
 * an unrecognised region then matches only the country-level place, which
 * under-charges visibly instead of charging a stranger the wrong state's rate.
 */
async function quoteTaxForSession(
  ctx: ServiceContext,
  input: {
    cartId: string;
    customerId: string | null;
    shippingAddress?: AddressSnapshotType | undefined;
    shippingAmountCents: number;
  }
): Promise<TaxBreakdown | null> {
  const to = input.shippingAddress;
  if (!to) return null;

  const read = await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId },
      select: { id: true, customerId: true, channel: true },
    });
    if (!cart) return null;
    const [items, exemptions] = await Promise.all([
      tx.cartItem.findMany({
        where: { cartId: input.cartId },
        select: {
          id: true,
          quantity: true,
          unitPriceCents: true,
          variantId: true,
          variant: { select: { productId: true, product: { select: { taxClass: true } } } },
        },
      }),
      input.customerId
        ? tx.taxExemption.findMany({
            where: { customerId: input.customerId },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    // A line is taxed on what it actually costs, so its share of the basket's
    // savings comes off first. CartItem carries no discount column — the
    // apportionment is computed, and it is the same one the order is written
    // from, so tax and the invoice agree about what was discounted.
    const discountByLine = await apportionCartDiscounts(tx, cart);
    return { items, exemptionIds: exemptions.map((e) => e.id), discountByLine };
  });
  if (!read || read.items.length === 0) return null;

  const from = await resolveShipFromAddress(ctx).catch(() => ({ country: 'US' }) as const);

  return taxService.calculate(ctx, {
    shipFrom: {
      country: from.country,
      ...(taxRegionCode(from.country, 'region' in from ? from.region : undefined)
        ? { region: taxRegionCode(from.country, 'region' in from ? from.region : undefined) }
        : {}),
    },
    shipTo: {
      country: to.country,
      ...(taxRegionCode(to.country, to.region)
        ? { region: taxRegionCode(to.country, to.region) }
        : {}),
      ...(to.postalCode ? { postalCode: to.postalCode } : {}),
      ...(to.city ? { city: to.city } : {}),
      ...(to.line1 ? { line1: to.line1 } : {}),
    },
    customerExemptionIds: read.exemptionIds,
    shippingAmountCents: input.shippingAmountCents,
    lines: read.items.map((item) => ({
      variantId: item.variantId,
      productId: item.variant.productId,
      ...(item.variant.product.taxClass ? { productTaxClass: item.variant.product.taxClass } : {}),
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountAmountCents: read.discountByLine.get(item.id) ?? 0,
    })),
  });
}

async function assertSessionWritable(tx: TxClient, sessionId: string): Promise<CheckoutSession> {
  const session = await tx.checkoutSession.findFirst({ where: { id: sessionId } });
  if (!session) throw new CommerceNotFoundError('CheckoutSession', sessionId);
  if (session.step === 'completed' || session.step === 'expired') {
    throw new CommerceConflictError(`Cannot mutate a ${session.step} checkout session`);
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new CommerceConflictError('Checkout session has expired');
  }
  return session;
}

/**
 * The step to RECORD after writing `to` on a session currently at `from`.
 *
 * ── WHY GOING BACK IS ALLOWED ───────────────────────────────────────────────
 *
 * This used to throw: `Cannot move checkout from "shipping" back to "contact"`.
 * Three things were wrong with that, in ascending order of seriousness.
 *
 *   1. The sentence is machine language, quoted step names and all, and it was
 *      rendered in a red box on a bakery's checkout to somebody buying bread.
 *   2. It forbade something THE CHECKOUT ITSELF OFFERS. Step 2 has a "← Back"
 *      button. Press it, correct your email, press Continue, and the server
 *      refuses — a dead end reached by using the buttons as drawn.
 *   3. Any customer who reopened the page hit it without touching Back at all.
 *      The form restarts at Contact while the session remembers `shipping`, so
 *      the first thing they submit is a step they have already passed.
 *
 * Editing an earlier step is not an error. It is a person changing their mind
 * about their own email address, which they are entitled to do at any point
 * before they pay. `submitShipping` was already written to be re-run — it
 * explicitly swaps out the previous rate rather than stacking a second one — so
 * the machinery for revisiting a step existed; only this guard denied it.
 *
 * What it must NOT do is drag the session backwards, or correcting a typo in an
 * email would silently discard a chosen delivery option. So the recorded step is
 * whichever of the two is FURTHER ALONG: the write lands, the progress stands.
 *
 * `completed` and `expired` are still refused, by `assertSessionWritable` — a
 * paid order is not editable, and that guard is the one that matters.
 */
export function furthestStep(from: string, to: string): string {
  const fromIdx = STEP_ORDER[from] ?? -1;
  const toIdx = STEP_ORDER[to] ?? -1;
  return toIdx >= fromIdx ? to : from;
}

/**
 * Coarse payment-method classification driving surcharge gating (docs/48 §6).
 * Shared by `get()` (pre-payment disclosure) and `complete()` (final charge) so
 * the disclosed fee and the charged fee always agree. A net-terms request →
 * 'account' (no card fee); a chosen card provider → 'card'. Before either is
 * known we default by B2B membership (not channel — a B2B customer checks out
 * on the same route as everyone else): eligible for net terms defaults to
 * 'account', everyone else defaults to 'card'.
 */
function surchargeMethodForSession(row: {
  paymentTermsRequested: string | null;
  paymentProviderSlug: string | null;
  companyId: string | null;
}): SurchargePaymentMethod {
  if (row.paymentTermsRequested) return 'account';
  if (row.paymentProviderSlug) return 'card';
  return row.companyId ? 'account' : 'card';
}

/** One human label for the disclosed surcharge: the single rule's label, or a
 *  generic heading when several rules stack. Null when nothing applies. */
function surchargeLabelFor(applied: AppliedSurcharge[]): string | null {
  if (applied.length === 0) return null;
  if (applied.length === 1) return applied[0]!.label;
  return 'Surcharges';
}

function serializeSession(
  row: CheckoutSession,
  surcharge: { surchargeTotalCents: number; totalCents: number; surchargeLabel: string | null },
  paymentMode: CheckoutSessionSnapshot['paymentMode'],
  madeToOrder: CartMadeToOrder,
  b2bAccountPaymentTerms?: string | null
): CheckoutSessionSnapshot {
  return {
    paymentMode,
    madeToOrder,
    sessionId: row.id,
    cartId: row.cartId,
    step: row.step as CheckoutSessionSnapshot['step'],
    channel: row.channel as CheckoutSessionSnapshot['channel'],
    currency: row.currency,
    customerEmail: row.customerEmail ?? undefined,
    customerName: row.customerName ?? undefined,
    customerPhone: row.customerPhone ?? undefined,
    customerId: row.customerId ?? undefined,
    companyId: row.companyId ?? undefined,
    b2bAccountPaymentTerms: b2bAccountPaymentTerms ?? undefined,
    shippingAddress: (row.shippingAddress ??
      undefined) as CheckoutSessionSnapshot['shippingAddress'],
    billingAddress: (row.billingAddress ?? undefined) as CheckoutSessionSnapshot['billingAddress'],
    shippingProviderSlug: row.shippingProviderSlug ?? undefined,
    shippingRateRef: row.shippingRateRef ?? undefined,
    shippingDescription: row.shippingDescription ?? undefined,
    paymentProviderSlug: row.paymentProviderSlug ?? undefined,
    paymentRef: row.paymentRef ?? undefined,
    taxBreakdownRef: row.taxBreakdownRef ?? undefined,
    poNumber: row.poNumber ?? undefined,
    paymentTermsRequested: row.paymentTermsRequested ?? undefined,
    surchargeLabel: surcharge.surchargeLabel ?? undefined,
    totals: {
      subtotalCents: row.subtotalCents,
      discountTotalCents: row.discountTotalCents,
      shippingTotalCents: row.shippingTotalCents,
      taxTotalCents: row.taxTotalCents,
      surchargeTotalCents: surcharge.surchargeTotalCents,
      giftCardAppliedCents: row.giftCardAppliedCents,
      accountCreditAppliedCents: row.accountCreditAppliedCents,
      totalCents: surcharge.totalCents,
    },
    expiresAt: row.expiresAt.toISOString(),
  };
}
