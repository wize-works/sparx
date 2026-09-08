// Built-in entity resolvers + scanners (docs/81 §5.3).
//
// The initial resolver catalog: customer / deal / order hydrators for the common
// event triggers, and a customer scanner for scheduled (predicate) triggers. The
// field set is the documented contract the AI assistant offers and conditions
// reference — adding a field here is additive. Module-specific resolvers
// (b2b account, quote, …) register through the same `registerResolver` seam as
// their owning module wires the engine.

import type { ResolvedFields, TenantCtx } from '../engine-types';
import { PROPERTY_FIELD, registerResolver, registerScanner, type ScannedRow } from './registry';

const MS_PER_DAY = 86_400_000;

/** Prisma Decimal | number | null → number | null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Whole days between `then` and now (null-safe). */
function daysSince(then: Date | null | undefined, now: Date): number | null {
  if (!then) return null;
  return Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY);
}

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  throw new Error(`expected string id on trigger payload, got ${typeof v}`);
}

// ─── customer ──────────────────────────────────────────────────────────────

interface CustomerLike {
  id: string;
  type: string;
  lifecycleStage: string;
  leadStatus: string | null;
  email: string | null;
  companyName: string | null;
  doNotContact: boolean;
  tags: string[];
  totalSpent: unknown;
  orderCount: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  createdAt: Date;
  propertyId: string | null;
}

function customerFields(c: CustomerLike, now: Date): ResolvedFields {
  return {
    // WHICH BUSINESS this record belongs to (docs/131 §3.1) — the engine filters
    // site-scoped automations on it. Reserved key, not part of the condition
    // vocabulary. Null for a tenant-level CRM contact tied to no site.
    [PROPERTY_FIELD]: c.propertyId,
    'customer.id': c.id,
    'customer.type': c.type,
    'customer.lifecycleStage': c.lifecycleStage,
    'customer.leadStatus': c.leadStatus,
    'customer.email': c.email,
    'customer.company': c.companyName,
    'customer.doNotContact': c.doNotContact,
    'customer.tags': c.tags,
    'customer.totalSpent': num(c.totalSpent),
    'customer.orderCount': c.orderCount,
    'customer.hasOrdered': c.orderCount > 0,
    'customer.lastOrderAt': c.lastOrderAt,
    'customer.daysSinceLastOrder': daysSince(c.lastOrderAt, now),
    'customer.daysSinceCreated': daysSince(c.createdAt, now),
  };
}

const CUSTOMER_SELECT = {
  id: true,
  type: true,
  lifecycleStage: true,
  leadStatus: true,
  email: true,
  companyName: true,
  doNotContact: true,
  tags: true,
  totalSpent: true,
  orderCount: true,
  firstOrderAt: true,
  lastOrderAt: true,
  createdAt: true,
  propertyId: true,
} as const;

async function hydrateCustomer(ctx: TenantCtx, customerId: string): Promise<ResolvedFields> {
  const c = await ctx.tx.customer.findUnique({
    where: { id: customerId },
    select: CUSTOMER_SELECT,
  });
  if (!c) return {};
  return customerFields(c, new Date());
}

// ─── deal ────────────────────────────────────────────────────────────────────

async function hydrateDeal(ctx: TenantCtx, dealId: string): Promise<ResolvedFields> {
  const d = await ctx.tx.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      title: true,
      value: true,
      currency: true,
      probability: true,
      stageId: true,
      pipelineId: true,
      assignedRepId: true,
      closedAt: true,
      closedReason: true,
      expectedCloseDate: true,
      tags: true,
      customerId: true,
      // stageType (open | won | lost) drives the won/open conditions on the
      // new-lead-task + deal-closed-won-task seeds (the stage id alone can't).
      stage: { select: { stageType: true } },
    },
  });
  if (!d) return {};
  const fields: ResolvedFields = {
    'deal.id': d.id,
    'deal.title': d.title,
    // Alias for templated copy (`{{deal.name}}`); `deal.title` stays for conditions.
    'deal.name': d.title,
    'deal.value': num(d.value),
    'deal.currency': d.currency,
    'deal.probability': num(d.probability),
    'deal.stageId': d.stageId,
    'deal.stageType': d.stage.stageType,
    'deal.pipelineId': d.pipelineId,
    'deal.assignedRepId': d.assignedRepId,
    'deal.isClosed': d.closedAt !== null,
    'deal.closedReason': d.closedReason,
    'deal.expectedCloseDate': d.expectedCloseDate,
    'deal.tags': d.tags,
  };
  if (d.customerId) {
    Object.assign(fields, await hydrateCustomer(ctx, d.customerId));
  }
  return fields;
}

// ─── order ───────────────────────────────────────────────────────────────────

async function hydrateOrder(ctx: TenantCtx, orderId: string): Promise<ResolvedFields> {
  const o = await ctx.tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      channel: true,
      total: true,
      subtotal: true,
      refundTotal: true,
      currency: true,
      placedAt: true,
      customerId: true,
      propertyId: true,
    },
  });
  if (!o) return {};
  const fields: ResolvedFields = {
    'order.id': o.id,
    'order.number': o.orderNumber,
    'order.status': o.status,
    'order.paymentStatus': o.paymentStatus,
    'order.channel': o.channel,
    'order.total': num(o.total),
    'order.subtotal': num(o.subtotal),
    'order.refundTotal': num(o.refundTotal),
    'order.currency': o.currency,
    'order.placedAt': o.placedAt,
  };
  Object.assign(fields, await hydrateCustomer(ctx, o.customerId));
  // AFTER the customer merge, deliberately. hydrateCustomer sets PROPERTY_FIELD
  // too, and Object.assign would otherwise let the customer's site overwrite the
  // order's — which is wrong in both directions: a customer created before the
  // order (or a tenant-level contact) can carry a different site or none at all,
  // while the ORDER is the thing that actually happened on a storefront. The
  // order's own site is authoritative, so it is written last.
  fields[PROPERTY_FIELD] = o.propertyId;
  return fields;
}

// ─── subscription (commerce auto-ship) ───────────────────────────────────────

async function hydrateSubscription(
  ctx: TenantCtx,
  subscriptionId: string
): Promise<ResolvedFields> {
  const s = await ctx.tx.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      status: true,
      currency: true,
      intervalUnit: true,
      intervalCount: true,
      currentPeriodEnd: true,
      nextOccurrenceAt: true,
      pausedUntil: true,
      cancelledAt: true,
      customerId: true,
    },
  });
  if (!s) return {};
  const fields: ResolvedFields = {
    'subscription.id': s.id,
    'subscription.status': s.status,
    'subscription.currency': s.currency,
    'subscription.intervalUnit': s.intervalUnit,
    'subscription.intervalCount': s.intervalCount,
    'subscription.currentPeriodEnd': s.currentPeriodEnd,
    'subscription.nextOccurrenceAt': s.nextOccurrenceAt,
    'subscription.pausedUntil': s.pausedUntil,
    'subscription.isCancelled': s.cancelledAt !== null,
  };
  // Merge the customer so `customer.email` (the send recipient + the `is_set` guard)
  // and `customer.id` (the entity ref) resolve. The subscription has no site of its
  // own, so hydrateCustomer's PROPERTY_FIELD (the customer's site, or none) stands.
  Object.assign(fields, await hydrateCustomer(ctx, s.customerId));
  return fields;
}

// ─── return / RMA (docs/impl transactional-email §4 P3) ──────────────────────

async function hydrateReturn(ctx: TenantCtx, returnId: string): Promise<ResolvedFields> {
  const r = await ctx.tx.returnRequest.findUnique({
    where: { id: returnId },
    select: { id: true, status: true, preferredOutcome: true, orderId: true },
  });
  if (!r) return {};
  const fields: ResolvedFields = {
    'return.id': r.id,
    'return.status': r.status,
    'return.preferredOutcome': r.preferredOutcome,
  };
  // Merge the order (which merges its customer) so `customer.email` (recipient +
  // `is_set` guard), `order.*`, and the `order.id` ref all resolve for the send.
  Object.assign(fields, await hydrateOrder(ctx, r.orderId));
  return fields;
}

// ─── registration ────────────────────────────────────────────────────────────

const CUSTOMER_EVENTS = [
  'crm.customer.created',
  'crm.customer.updated',
  'crm.customer.subscribed',
  'crm.segment.entered',
];
const DEAL_EVENTS = ['crm.deal.created', 'crm.deal.updated', 'crm.deal.stage_changed'];
const ORDER_EVENTS = [
  'order.placed',
  'order.paid',
  // The failure side of payment, not just the success side: without it the
  // payment-failed notification seed renders "Payment failed on order " with
  // `{{order.number}}` resolved to nothing — the one detail that makes the
  // notification actionable.
  'order.payment_failed',
  'payment.captured',
  'order.cancelled',
  'order.refunded',
];
// The two events that are about a PARCEL, not just an order. Both carry
// `fulfillmentId` in their payload, and dropping it is not harmless: a shipping
// confirmation that knows only the order resolves its tracking details from "the
// latest parcel on this order", so an order that ships in two boxes can tell the
// customer the wrong tracking number. These hydrate the order like any other
// order event and then merge the parcel's own id on top, the same way the
// subscription link events merge the facts that ride in their payload.
const FULFILLMENT_EVENTS = ['order.fulfilled', 'order.delivered'];
// Commerce subscription lifecycle (docs/implementation/transactional-email §4 P2).
// Each carries `subscriptionId` in its payload; the resolver hydrates the row +
// its customer so the lifecycle emails (and any tenant automation) resolve the
// recipient and the subscription facts.
const SUBSCRIPTION_EVENTS = [
  'subscription.created',
  'subscription.renewed',
  'subscription.payment_failed',
  'subscription.paused',
  'subscription.resumed',
  'subscription.cancelled',
];
// Two subscription events carry a link the SUBSCRIPTION ROW does not have — a
// one-time bank-authentication handoff, and the hosted payment link for an
// invoice-mode bill (docs/142). Both are facts about this send, not about the
// subscription, so they ride in the payload and are merged on top of the
// hydrated row rather than being looked up.
const SUBSCRIPTION_LINK_EVENTS = ['subscription.authentication_required', 'subscription.invoiced'];
// Returns / RMA lifecycle (docs/impl transactional-email §4 P3) — payload carries
// `returnId`; the resolver hydrates the return + its order + customer.
// `return.requested` leads the list because it is the one a HUMAN has to act on:
// a shopper has asked to send something back and nobody is told until somebody
// opens the returns screen. The other three report a decision already made.
const RETURN_EVENTS = ['return.requested', 'return.approved', 'return.received', 'return.refunded'];
// B2B order approval outcomes (docs/impl transactional-email §4 P3) — the buyer's
// pending order was approved (→ placed) or rejected (→ cancelled). Both carry
// `orderId`, so they resolve through the order hydrator like any other order event.
const B2B_ORDER_EVENTS = ['b2b.order.approved', 'b2b.order.rejected'];

let installed = false;

/**
 * Register the built-in resolvers + scanners exactly once. Idempotent so it is
 * safe to call from every engine entry point (worker boot, api-rest boot, tests)
 * without double-registration.
 */
export function installBuiltinResolvers(): void {
  if (installed) return;
  installed = true;

  for (const ev of CUSTOMER_EVENTS) {
    registerResolver(ev, (ctx, p) => hydrateCustomer(ctx, str(p.customerId)));
  }
  for (const ev of DEAL_EVENTS) {
    registerResolver(ev, (ctx, p) => hydrateDeal(ctx, str(p.dealId ?? p.id)));
  }
  for (const ev of ORDER_EVENTS) {
    registerResolver(ev, (ctx, p) => hydrateOrder(ctx, str(p.orderId ?? p.id)));
  }
  for (const ev of FULFILLMENT_EVENTS) {
    registerResolver(ev, async (ctx, p) => {
      const fields = await hydrateOrder(ctx, str(p.orderId ?? p.id));
      // Empty string rather than undefined, matching the subscription link
      // events: a bound row with an empty value self-drops, where a missing key
      // renders the raw token.
      const fulfillmentId = str(p.fulfillmentId);
      fields['fulfillment.id'] = fulfillmentId;
      // The parcel's own facts, read from the ROW rather than the payload — the
      // payload carries only ids. `carrier` is the load-bearing one: a COLLECTION
      // is recorded as a fulfillment carried by `pickup`, and it publishes
      // `order.fulfilled` exactly like a despatch does. Without this field an
      // automation cannot tell the two apart, and a shipping confirmation goes
      // to somebody who just walked out of the shop holding the goods.
      if (fulfillmentId) {
        const f = await ctx.tx.orderFulfillment.findUnique({
          where: { id: fulfillmentId },
          select: { carrier: true, service: true, trackingNumber: true, status: true },
        });
        fields['fulfillment.carrier'] = f?.carrier ?? '';
        fields['fulfillment.service'] = f?.service ?? '';
        fields['fulfillment.trackingNumber'] = f?.trackingNumber ?? '';
        fields['fulfillment.status'] = f?.status ?? '';
      }
      return fields;
    });
  }
  for (const ev of SUBSCRIPTION_EVENTS) {
    registerResolver(ev, (ctx, p) => hydrateSubscription(ctx, str(p.subscriptionId ?? p.id)));
  }
  for (const ev of SUBSCRIPTION_LINK_EVENTS) {
    registerResolver(ev, async (ctx, p) => {
      const fields = await hydrateSubscription(ctx, str(p.subscriptionId ?? p.id));
      // Empty string rather than undefined: a bound row with an empty value
      // self-drops, where a missing key renders the raw `{{…}}` token.
      fields['subscription.confirmUrl'] = str(p.confirmUrl);
      fields['subscription.payUrl'] = str(p.payUrl);
      if (p.orderNumber !== undefined) fields['order.number'] = str(p.orderNumber);
      return fields;
    });
  }
  for (const ev of RETURN_EVENTS) {
    registerResolver(ev, (ctx, p) => hydrateReturn(ctx, str(p.returnId ?? p.id)));
  }
  for (const ev of B2B_ORDER_EVENTS) {
    registerResolver(ev, (ctx, p) => hydrateOrder(ctx, str(p.orderId ?? p.id)));
  }

  // Scheduled (predicate) trigger over customers — the substrate for the
  // inactivity / win-back / high-value sweeps (docs/81 §5.2). Loads the active
  // customer set (cap + soft-delete filter pushed to SQL); the predicate's
  // `where` + the automation's conditions filter it in-app via the evaluator.
  registerScanner('customer', async (ctx: TenantCtx): Promise<ScannedRow[]> => {
    const now = new Date();
    const rows = await ctx.tx.customer.findMany({
      where: { deletedAt: null },
      select: CUSTOMER_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 5_000,
    });
    return rows.map((c) => ({ id: c.id, fields: customerFields(c as CustomerLike, now) }));
  });
}
