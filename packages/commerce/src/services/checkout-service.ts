// checkoutService — multi-step state machine driving cart → order.
//
// State machine:
//   cart_review → contact → shipping → payment → review → completed
//                                                       ↘ expired
//
// All side effects (payment intent, shipping rate, tax calculation) are
// captured as provider refs on CheckoutSession so the flow is idempotent
// across reloads. complete() is the single function that creates an
// Order via @sparx/crm's orderService and fires the post-commit events
// (order.placed, inventory.adjusted, email.send).

import { orderService } from '@sparx/crm';
import {
  type CheckoutSessionSnapshot,
  CompleteCheckoutInput,
  StartCheckoutInput,
  SubmitContactInput,
  SubmitPaymentInput,
  SubmitShippingInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { CheckoutSession, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

import * as discountService from './discount-service';
import * as providerService from './provider-service';

const DEFAULT_SESSION_TTL_MIN = 60; // 1 hour

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
      where: { id: input.cartId, abandonedAt: null },
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

    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MIN * 60_000);
    const session = await tx.checkoutSession.create({
      data: {
        tenantId: ctx.tenantId,
        cartId: input.cartId,
        step: 'cart_review',
        channel: input.channel,
        currency: input.currency,
        customerId: input.customerId ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        customerEmail: input.customerEmail ?? null,
        subtotalCents: cart.subtotalCents,
        discountTotalCents: cart.discountTotalCents,
        shippingTotalCents: cart.shippingTotalCents,
        taxTotalCents: cart.taxTotalCents,
        giftCardAppliedCents: cart.giftCardAppliedCents,
        storeCreditAppliedCents: cart.storeCreditAppliedCents,
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

// ─── reads ───────────────────────────────────────────────────────────

export async function get(
  ctx: ServiceContext,
  sessionId: string
): Promise<CheckoutSessionSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.checkoutSession.findFirst({ where: { id: sessionId } });
    return row ? serializeSession(row) : null;
  });
}

// ─── step transitions ────────────────────────────────────────────────

export async function submitContact(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SubmitContactInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const session = await assertSessionWritable(tx, input.sessionId);
    assertCanAdvance(session.step, 'contact');
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: 'contact',
        customerEmail: input.email,
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
  await withTenant(ctx, async (tx) => {
    const session = await assertSessionWritable(tx, input.sessionId);
    assertCanAdvance(session.step, 'shipping');
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: 'shipping',
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress ?? input.shippingAddress,
        shippingProviderSlug: input.shippingProviderSlug,
        shippingRateRef: input.shippingRateRef,
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
          shippingProviderSlug: input.shippingProviderSlug,
          shippingRateRef: input.shippingRateRef,
        },
      },
    });
  });
}

export async function submitPayment(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SubmitPaymentInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const session = await assertSessionWritable(tx, input.sessionId);
    assertCanAdvance(session.step, 'payment');

    // B2B-only fields are accepted only on b2b_portal sessions.
    if (input.poNumber && session.channel !== 'b2b_portal') {
      throw new CommerceValidationError('PO numbers are only accepted on b2b_portal checkouts');
    }

    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        step: 'review',
        paymentProviderSlug: input.paymentProviderSlug,
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
  installationId: string;
  clientSecret?: string;
  amountCents: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded';
}

export async function createPaymentIntent(
  ctx: ServiceContext,
  input: { sessionId: string; idempotencyKey?: string }
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

  // Stable order hash so the provider can spot tampering between
  // intent creation + confirmation. Quick + deterministic; the worker
  // re-derives it from the session and compares on webhook receipt.
  const orderHash = `${session.cartId}:${session.totalCents}:${session.currency}`;

  const intent = await providerService.runPaymentCreate(
    ctx,
    {
      amountCents: session.totalCents,
      currency: session.currency,
      orderHash,
      description: `Sparx order — checkout session ${session.id.slice(0, 8)}`,
      metadata: {
        sparx_checkout_session_id: session.id,
        sparx_cart_id: session.cartId,
        sparx_channel: session.channel,
      },
    },
    {
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }
  );

  await withTenant(ctx, async (tx) => {
    await tx.checkoutSession.update({
      where: { id: session.id },
      data: {
        paymentProviderSlug: intent.providerSlug,
        paymentRef: intent.paymentRef,
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
        after: { paymentProviderSlug: intent.providerSlug, paymentRef: intent.paymentRef },
      },
    });
  });

  return {
    paymentRef: intent.paymentRef,
    providerSlug: intent.providerSlug,
    installationId: intent.installationId,
    ...(intent.clientSecret ? { clientSecret: intent.clientSecret } : {}),
    amountCents: session.totalCents,
    currency: session.currency,
    status: intent.status,
  };
}

// ─── complete ────────────────────────────────────────────────────────

export async function complete(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ orderId: string; orderNumber: string }> {
  const input = CompleteCheckoutInput.parse(rawInput);

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
    if (order) return { orderId: order.id, orderNumber: order.orderNumber };
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
            discounts: true,
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
    if (!session.shippingAddress) {
      throw new CommerceValidationError('Cannot complete checkout without a shipping address');
    }
    if (!session.paymentProviderSlug && session.channel !== 'b2b_portal') {
      throw new CommerceValidationError(
        'Cannot complete a retail checkout without a payment provider'
      );
    }

    // CRM owns the customer spine. Storefront orders against a guest
    // session must first have an associated customerId — the storefront
    // creates a customer (or links to an existing one by email) before
    // calling complete().
    if (!session.customerId) {
      throw new CommerceValidationError(
        'Checkout session must have a customerId before complete() (link or create the customer first)'
      );
    }

    const cart = session.cart;

    // Translate cart lines into CRM LineItemInputs. The crm-schema uses
    // decimal dollars (Money), not integer cents — convert at the
    // boundary so both modules' internal contracts stay clean.
    const items = cart.items.map((it) => ({
      productId: it.variant.productId,
      variantId: it.variantId,
      sku: it.variant.sku,
      name: it.variant.product.title,
      quantity: it.quantity,
      unitPrice: it.unitPriceCents / 100,
    }));

    const subtotalDollars = session.subtotalCents / 100;
    const discountDollars = session.discountTotalCents / 100;
    const shippingDollars = session.shippingTotalCents / 100;
    const taxDollars = session.taxTotalCents / 100;

    const order = await orderService.create(ctx, {
      customerId: session.customerId,
      channel:
        session.channel === 'storefront' || session.channel === 'b2b_portal'
          ? session.channel
          : 'admin',
      source: 'commerce_checkout',
      currency: session.currency,
      shippingTotal: shippingDollars,
      taxTotal: taxDollars,
      discountTotal: discountDollars,
      shippingAddress: session.shippingAddress as Parameters<
        typeof orderService.create
      >[1] extends infer A
        ? A
        : never,
      billingAddress: (session.billingAddress ?? session.shippingAddress) as Parameters<
        typeof orderService.create
      >[1] extends infer A
        ? A
        : never,
      items,
      metadata: {
        commerceCheckoutSessionId: session.id,
        commerceCartId: cart.id,
        paymentProviderSlug: session.paymentProviderSlug,
        paymentRef: session.paymentRef,
        shippingProviderSlug: session.shippingProviderSlug,
        shippingRateRef: session.shippingRateRef,
        poNumber: session.poNumber,
        paymentTermsRequested: session.paymentTermsRequested,
        subtotalCents: session.subtotalCents,
        giftCardAppliedCents: session.giftCardAppliedCents,
        storeCreditAppliedCents: session.storeCreditAppliedCents,
      },
    });

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
      },
    });

    // Freeze the cart by stamping recoveredAt — future addItem calls
    // against it will still work but the storefront should redirect to
    // the order confirmation page instead.
    await tx.cart.update({
      where: { id: cart.id },
      data: { recoveredAt: new Date() },
    });

    // Record discount usage rows so per-customer + total-usage limits
    // increment now that the cart has converted.
    for (const cd of cart.discounts) {
      await discountService.recordDiscountUsage(ctx, {
        discountId: cd.discountId,
        customerId: session.customerId,
        orderId: order.id,
        cartId: cart.id,
        appliedCents: cd.appliedCents,
      });
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

    return { orderId: order.id, orderNumber: order.orderNumber };
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'checkout.completed',
    data: {
      sessionId: input.sessionId,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    },
  });

  // Order placement is announced on the dedicated topic too so non-CRM
  // consumers (inventory decrement, fulfillment dispatch, analytics)
  // pick it up without subscribing to checkout.completed.
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'order.placed',
    data: { orderId: result.orderId, orderNumber: result.orderNumber },
  });

  return result;
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

function assertCanAdvance(from: string, to: string): void {
  const fromIdx = STEP_ORDER[from] ?? -1;
  const toIdx = STEP_ORDER[to] ?? -1;
  if (toIdx < fromIdx) {
    throw new CommerceConflictError(`Cannot move checkout from "${from}" back to "${to}"`);
  }
}

function serializeSession(row: CheckoutSession): CheckoutSessionSnapshot {
  return {
    sessionId: row.id,
    cartId: row.cartId,
    step: row.step as CheckoutSessionSnapshot['step'],
    channel: row.channel as CheckoutSessionSnapshot['channel'],
    currency: row.currency,
    customerEmail: row.customerEmail ?? undefined,
    customerId: row.customerId ?? undefined,
    b2bAccountId: row.b2bAccountId ?? undefined,
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
    totals: {
      subtotalCents: row.subtotalCents,
      discountTotalCents: row.discountTotalCents,
      shippingTotalCents: row.shippingTotalCents,
      taxTotalCents: row.taxTotalCents,
      giftCardAppliedCents: row.giftCardAppliedCents,
      storeCreditAppliedCents: row.storeCreditAppliedCents,
      totalCents: row.totalCents,
    },
    expiresAt: row.expiresAt.toISOString(),
  };
}
