// Deal ↔ order / quote join-table operations (locked decision #5).
//
//   GET    /v1/crm/deals/:id/orders               → list attached orders
//   POST   /v1/crm/deals/:id/orders               → attach order
//   DELETE /v1/crm/deals/:id/orders/:orderId      → detach order
//   GET    /v1/crm/deals/:id/quotes               → list attached quotes
//   POST   /v1/crm/deals/:id/quotes               → attach quote
//   DELETE /v1/crm/deals/:id/quotes/:quoteId      → detach quote

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dealService } from '@sparx/crm';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });
const OrderLinkParams = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
});
const QuoteLinkParams = z.object({
  id: z.string().uuid(),
  quoteId: z.string().uuid(),
});
const AttachOrderBody = z.object({ order_id: z.string().uuid() });
const AttachQuoteBody = z.object({ quote_id: z.string().uuid() });

const dealAttachmentRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/deals/:id/orders', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const rows = await dealService.listAttachedOrders(toCrmContext(request), id);
    return ok(rows);
  });

  app.post('/v1/crm/deals/:id/orders', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = AttachOrderBody.parse(request.body);
    const link = await dealService.attachOrder(toCrmContext(request), {
      dealId: id,
      orderId: body.order_id,
    });
    reply.code(201);
    return ok(link);
  });

  app.delete('/v1/crm/deals/:id/orders/:orderId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id, orderId } = OrderLinkParams.parse(request.params);
    await dealService.detachOrder(toCrmContext(request), { dealId: id, orderId });
    reply.code(204);
  });

  app.get('/v1/crm/deals/:id/quotes', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const rows = await dealService.listAttachedQuotes(toCrmContext(request), id);
    return ok(rows);
  });

  app.post('/v1/crm/deals/:id/quotes', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = AttachQuoteBody.parse(request.body);
    const link = await dealService.attachQuote(toCrmContext(request), {
      dealId: id,
      quoteId: body.quote_id,
    });
    reply.code(201);
    return ok(link);
  });

  app.delete('/v1/crm/deals/:id/quotes/:quoteId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id, quoteId } = QuoteLinkParams.parse(request.params);
    await dealService.detachQuote(toCrmContext(request), { dealId: id, quoteId });
    reply.code(204);
  });
  return Promise.resolve();
};

export default dealAttachmentRoutes;
