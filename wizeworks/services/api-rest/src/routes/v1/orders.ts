// Orders — the shared order root. List / get / create / update / cancel, plus
// nested payments / fulfillments / refunds.
//
// Top-level (not /v1/commerce/orders or /v1/crm/orders) because an order is a
// shared spine: Commerce checkout and B2B PO checkout both produce one, CRM
// reads it as customer history, and invoicing/inventory/dropship draw on it.
// Any module prefix here would imply an ownership — and a charge — that doesn't
// hold. Access is gated on Commerce OR B2B OR CRM via requireOrderAccess.
//
// The dashboard composes THREE page routes over this one root
// (/commerce/orders, /b2b/orders, /crm/orders), each a different lens.
//
//   GET    /v1/orders                       → list (filterable)
//   POST   /v1/orders                       → create
//   GET    /v1/orders/:id                   → fetch one (with items)
//   PATCH  /v1/orders/:id                   → update
//   POST   /v1/orders/:id/cancel            → cancel
//   GET    /v1/orders/:id/payments          → list payments for order
//   POST   /v1/orders/:id/payments          → record a payment
//   POST   /v1/orders/:id/payments/:paymentId/void  → void a payment
//   GET    /v1/orders/:id/fulfillments      → list fulfillments
//   POST   /v1/orders/:id/fulfillments      → create a fulfillment
//   PATCH  /v1/orders/:id/fulfillments/:fId → update a fulfillment
//   GET    /v1/orders/:id/fulfillments/:fId/rates       → live carrier rate quotes
//   GET    /v1/orders/:id/fulfillments/:fId/labels      → purchased labels
//   POST   /v1/orders/:id/fulfillments/:fId/buy-label   → buy a label from a rate
//   POST   /v1/orders/:id/fulfillments/:fId/void-label  → void a purchased label
//   GET    /v1/orders/:id/fulfillments/:fId/track       → live tracking status
//   GET    /v1/orders/:id/refunds           → list refunds
//   POST   /v1/orders/:id/refunds           → record a refund
//   GET    /v1/orders/:id/invoices          → the invoices raised for this order
//   POST   /v1/orders/:id/invoices          → raise one, copied from the order
//
// The carrier-label endpoints additionally require Commerce (requireCommerceModule)
// on top of the shared gate — buying and voiding labels is commerce machinery a
// CRM-only tenant has no entitlement to.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  orderService,
  orderPaymentsService,
  orderFulfillmentsService,
  orderRefundsService,
  billingFromOrderService,
} from '@wizeworks/crm';
import { listFulfillmentLabels, quoteOutboundRates, shippingService } from '@wizeworks/commerce';
import { inventoryService } from '@wizeworks/inventory';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { requireOrderAccess, toOrderContext } from '../../lib/order-context.js';
import { refundOrderThroughGateway } from '../../lib/order-refund.js';
import { reachableSiteIds } from '../../lib/property.js';
import { requireCommerceModule, toCommerceContext } from '../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const PaymentPath = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
});
const FulfillmentPath = z.object({
  id: z.string().uuid(),
  fulfillmentId: z.string().uuid(),
});
const BuyLabelBody = z.object({ rateRef: z.string().min(1).max(255) });
const VoidLabelBody = z.object({ labelRef: z.string().min(1).max(255) });
const TrackQuery = z.object({
  trackingNumber: z.string().min(1).max(127),
  carrier: z.string().min(1).max(63),
});

const ListQuery = z.object({
  customer_id: z.string().uuid().optional(),
  // B2B scoping — resolved through Customer.companyId (an Order has no
  // account column). `b2b_only=true` is what the /b2b/orders lens sends.
  b2b_account_id: z.string().uuid().optional(),
  b2b_only: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  status: z.string().optional(),
  // Only orders that count toward a customer's figures, for a list rendered
  // beside them (issue 332). Not the same as any one status.
  counted_only: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  payment_status: z.string().optional(),
  // High-level origin bucket — storefront | b2b_portal | admin | import | mcp |
  // marketplace (docs/106 §4.4). The dashboard Orders "Channel" filter.
  channel: z.string().optional(),
  // Origin-site filter (docs/58 D1) — the dashboard Orders Site filter. Omitted
  // → the whole tenant; an id → orders placed on that site (null-origin orders
  // are excluded, so they only appear under "All sites").
  property: z.string().uuid().optional(),
  // Free-text search over the order number and the buyer (name / company /
  // email). The service has always accepted `q`; it was simply never exposed
  // here, so every order list on the platform had a search box that searched
  // whatever page was already loaded, or nothing at all.
  q: z.string().max(255).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  // `total` included so a list can answer "biggest orders first" from the
  // server rather than sorting one page of rows in the browser.
  sort_by: z.enum(['placedAt', 'updatedAt', 'createdAt', 'total']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const orderRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/orders', async (request) => {
    const auth = requireRole(request, 'viewer');
    await requireOrderAccess(request);
    const q = ListQuery.parse(request.query);
    const { items, total } = await orderService.list(toOrderContext(request), {
      customerId: q.customer_id,
      companyId: q.b2b_account_id,
      b2bOnly: q.b2b_only,
      status: q.status,
      countedOnly: q.counted_only,
      paymentStatus: q.payment_status,
      channel: q.channel,
      propertyId: q.property,
      // Bound to the member's reachable sites (docs/131 §3.3) — a restricted
      // member cannot list another business's orders by omitting ?property.
      propertyIds: reachableSiteIds(auth),
      q: q.q,
      take: q.take,
      skip: q.skip,
      sortBy: q.sort_by,
      order: q.order,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/orders/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const order = await orderService.get(toOrderContext(request), id);
    return ok(order);
  });

  app.post('/v1/orders', async (request, reply) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const order = await orderService.create(toOrderContext(request), request.body);
    reply.code(201);
    return ok(order);
  });

  app.patch('/v1/orders/:id', async (request) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const order = await orderService.update(toOrderContext(request), id, request.body);
    return ok(order);
  });

  app.post('/v1/orders/:id/cancel', async (request) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    // The service takes a free-form input that already includes the orderId.
    // Pass it through, but make sure the URL param wins so callers can't pass
    // a body whose `orderId` doesn't match the path.
    const body = (request.body ?? {}) as Record<string, unknown>;
    const order = await orderService.cancel(toOrderContext(request), { ...body, orderId: id });
    return ok(order);
  });

  // ── payments ────────────────────────────────────────────────────────────

  app.get('/v1/orders/:id/payments', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const rows = await orderPaymentsService.listForOrder(toOrderContext(request), id);
    return ok(rows);
  });

  app.post('/v1/orders/:id/payments', async (request, reply) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const payment = await orderPaymentsService.recordPayment(toOrderContext(request), {
      ...body,
      orderId: id,
    });
    reply.code(201);
    return ok(payment);
  });

  app.post('/v1/orders/:id/payments/:paymentId/void', async (request) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id, paymentId } = PaymentPath.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const payment = await orderPaymentsService.voidPayment(toOrderContext(request), {
      ...body,
      orderId: id,
      paymentId,
    });
    return ok(payment);
  });

  // ── fulfillments ────────────────────────────────────────────────────────

  app.get('/v1/orders/:id/fulfillments', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const rows = await orderFulfillmentsService.listForOrder(toOrderContext(request), id);
    return ok(rows);
  });

  app.post('/v1/orders/:id/fulfillments', async (request, reply) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const orderCtx = toOrderContext(request);
    const fulfillment = await orderFulfillmentsService.createFulfillment(orderCtx, {
      ...body,
      orderId: id,
    });

    // Discharge any backorder commitments this order was carrying (docs/146
    // Phase 9.1). The pack bench does the same on its own path; this covers a
    // fulfillment recorded straight through the API, which is how a business
    // that ships from a desk rather than a bench does it every time.
    //
    // Best-effort, and unguarded by the inventory module on purpose: with the
    // module off the queue is empty, so this updates nothing and costs one
    // query. Failing a shipment that has physically happened because a queue row
    // would not move would be the wrong trade in every direction.
    await inventoryService
      .markBackordersFulfilled(orderCtx, { holderType: 'order', holderId: id })
      .catch(() => undefined);

    reply.code(201);
    return ok(fulfillment);
  });

  app.patch('/v1/orders/:id/fulfillments/:fulfillmentId', async (request) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id, fulfillmentId } = FulfillmentPath.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fulfillment = await orderFulfillmentsService.updateFulfillment(toOrderContext(request), {
      ...body,
      orderId: id,
      fulfillmentId,
    });
    return ok(fulfillment);
  });

  // ── carrier labels (real Shippo integration — docs/09) ────────────────────

  app.get('/v1/orders/:id/fulfillments/:fulfillmentId/rates', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    await requireCommerceModule(request);
    const { fulfillmentId } = FulfillmentPath.parse(request.params);
    const rates = await quoteOutboundRates(toCommerceContext(request), fulfillmentId);
    return ok(rates);
  });

  app.get('/v1/orders/:id/fulfillments/:fulfillmentId/labels', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    await requireCommerceModule(request);
    const { fulfillmentId } = FulfillmentPath.parse(request.params);
    const labels = await listFulfillmentLabels(toCommerceContext(request), fulfillmentId);
    return ok(labels);
  });

  app.post('/v1/orders/:id/fulfillments/:fulfillmentId/buy-label', async (request, reply) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    await requireCommerceModule(request);
    const { fulfillmentId } = FulfillmentPath.parse(request.params);
    const { rateRef } = BuyLabelBody.parse(request.body);
    const result = await shippingService.buyLabel(toCommerceContext(request), {
      fulfillmentId,
      rateRef,
    });
    reply.code(201);
    return ok(result);
  });

  app.post('/v1/orders/:id/fulfillments/:fulfillmentId/void-label', async (request) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    await requireCommerceModule(request);
    const { fulfillmentId } = FulfillmentPath.parse(request.params);
    const { labelRef } = VoidLabelBody.parse(request.body);
    await shippingService.voidLabel(toCommerceContext(request), { fulfillmentId, labelRef });
    return ok({ voided: true });
  });

  app.get('/v1/orders/:id/fulfillments/:fulfillmentId/track', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    await requireCommerceModule(request);
    const { trackingNumber, carrier } = TrackQuery.parse(request.query);
    const status = await shippingService.trackShipment(toCommerceContext(request), {
      trackingNumber,
      carrier,
    });
    return ok(status);
  });

  // ── refunds ─────────────────────────────────────────────────────────────

  app.get('/v1/orders/:id/refunds', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const rows = await orderRefundsService.listForOrder(toOrderContext(request), id);
    return ok(rows);
  });

  // Refund an order. By default this SETTLES through the tenant's payment gateway and
  // then records the refund — `recordRefund` alone is bookkeeping only, so the old
  // behaviour wrote a refund row while no money moved (BUG-007). A caller that has
  // already settled elsewhere (the returns flow, or a merchant who refunded offline)
  // passes its own `processorRef` and gets the record-only path, unchanged.
  app.post('/v1/orders/:id/refunds', async (request, reply) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ctx = toOrderContext(request);

    const alreadySettled = typeof body.processorRef === 'string' && body.processorRef.length > 0;
    const refund = alreadySettled
      ? await orderRefundsService.recordRefund(ctx, { ...body, orderId: id })
      : await refundOrderThroughGateway(ctx, {
          orderId: id,
          // Only forward an amount when the caller actually gave a number —
          // otherwise let the gateway helper default to the full remaining
          // amount. (A bare `Number(body.amount)` here turns a missing value
          // into NaN, which is how the empty-body refund used to reach Stripe
          // as `Invalid integer: NaN`.)
          ...(body.amount != null && Number.isFinite(Number(body.amount))
            ? { amount: Number(body.amount) }
            : {}),
          ...(typeof body.currency === 'string' ? { currency: body.currency } : {}),
          ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
        });
    reply.code(201);
    return ok(refund);
  });

  // ── invoices raised FOR this order ────────────────────────────────────────
  //
  // Asking the customer for the money. A shop with no payment provider takes
  // none at checkout, so the sale is complete and unpaid until somebody bills
  // it. Nested under the ORDER rather than under invoicing because that is where
  // the question is asked — the owner is looking at an unpaid order, not
  // browsing a document list.

  app.get('/v1/orders/:id/invoices', async (request) => {
    requireRole(request, 'viewer');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const invoices = await billingFromOrderService.listInvoicesForOrder(
      toOrderContext(request),
      id
    );
    return ok(invoices);
  });

  app.post('/v1/orders/:id/invoices', async (request, reply) => {
    requireRole(request, 'editor');
    await requireOrderAccess(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const result = await billingFromOrderService.createInvoiceForOrder(toOrderContext(request), {
      orderId: id,
      ...(typeof body.dueAt === 'string' ? { dueAt: body.dueAt } : {}),
    });
    reply.code(201);
    return ok(result);
  });

  return Promise.resolve();
};

export default orderRoutes;
