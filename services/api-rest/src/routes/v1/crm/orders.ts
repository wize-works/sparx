// CRM orders — list / get / create / update / cancel + nested payments /
// fulfillments / refunds.
//
//   GET    /v1/crm/orders                       → list (filterable)
//   POST   /v1/crm/orders                       → create
//   GET    /v1/crm/orders/:id                   → fetch one (with items)
//   PATCH  /v1/crm/orders/:id                   → update
//   POST   /v1/crm/orders/:id/cancel            → cancel
//   GET    /v1/crm/orders/:id/payments          → list payments for order
//   POST   /v1/crm/orders/:id/payments          → record a payment
//   POST   /v1/crm/orders/:id/payments/:paymentId/void  → void a payment
//   GET    /v1/crm/orders/:id/fulfillments      → list fulfillments
//   POST   /v1/crm/orders/:id/fulfillments      → create a fulfillment
//   PATCH  /v1/crm/orders/:id/fulfillments/:fId → update a fulfillment
//   GET    /v1/crm/orders/:id/refunds           → list refunds
//   POST   /v1/crm/orders/:id/refunds           → record a refund

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  orderService,
  orderPaymentsService,
  orderFulfillmentsService,
  orderRefundsService,
} from '@sparx/crm';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });
const PaymentPath = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
});
const FulfillmentPath = z.object({
  id: z.string().uuid(),
  fulfillmentId: z.string().uuid(),
});

const ListQuery = z.object({
  customer_id: z.string().uuid().optional(),
  b2b_account_id: z.string().uuid().optional(),
  status: z.string().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: z.enum(['placedAt', 'updatedAt', 'createdAt']).optional(),
});

const orderRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/orders', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const { items, total } = await orderService.list(toCrmContext(request), {
      customerId: q.customer_id,
      b2bAccountId: q.b2b_account_id,
      status: q.status,
      take: q.take,
      skip: q.skip,
      sortBy: q.sort_by,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/crm/orders/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const order = await orderService.get(toCrmContext(request), id);
    return ok(order);
  });

  app.post('/v1/crm/orders', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const order = await orderService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(order);
  });

  app.patch('/v1/crm/orders/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const order = await orderService.update(toCrmContext(request), id, request.body);
    return ok(order);
  });

  app.post('/v1/crm/orders/:id/cancel', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    // The service takes a free-form input that already includes the orderId.
    // Pass it through, but make sure the URL param wins so callers can't pass
    // a body whose `orderId` doesn't match the path.
    const body = (request.body ?? {}) as Record<string, unknown>;
    const order = await orderService.cancel(toCrmContext(request), { ...body, orderId: id });
    return ok(order);
  });

  // ── payments ────────────────────────────────────────────────────────────

  app.get('/v1/crm/orders/:id/payments', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const rows = await orderPaymentsService.listForOrder(toCrmContext(request), id);
    return ok(rows);
  });

  app.post('/v1/crm/orders/:id/payments', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const payment = await orderPaymentsService.recordPayment(toCrmContext(request), {
      ...body,
      orderId: id,
    });
    reply.code(201);
    return ok(payment);
  });

  app.post('/v1/crm/orders/:id/payments/:paymentId/void', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id, paymentId } = PaymentPath.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const payment = await orderPaymentsService.voidPayment(toCrmContext(request), {
      ...body,
      orderId: id,
      paymentId,
    });
    return ok(payment);
  });

  // ── fulfillments ────────────────────────────────────────────────────────

  app.get('/v1/crm/orders/:id/fulfillments', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const rows = await orderFulfillmentsService.listForOrder(toCrmContext(request), id);
    return ok(rows);
  });

  app.post('/v1/crm/orders/:id/fulfillments', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fulfillment = await orderFulfillmentsService.createFulfillment(toCrmContext(request), {
      ...body,
      orderId: id,
    });
    reply.code(201);
    return ok(fulfillment);
  });

  app.patch('/v1/crm/orders/:id/fulfillments/:fulfillmentId', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id, fulfillmentId } = FulfillmentPath.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fulfillment = await orderFulfillmentsService.updateFulfillment(toCrmContext(request), {
      ...body,
      orderId: id,
      fulfillmentId,
    });
    return ok(fulfillment);
  });

  // ── refunds ─────────────────────────────────────────────────────────────

  app.get('/v1/crm/orders/:id/refunds', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const rows = await orderRefundsService.listForOrder(toCrmContext(request), id);
    return ok(rows);
  });

  app.post('/v1/crm/orders/:id/refunds', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const refund = await orderRefundsService.recordRefund(toCrmContext(request), {
      ...body,
      orderId: id,
    });
    reply.code(201);
    return ok(refund);
  });

  return Promise.resolve();
};

export default orderRoutes;
