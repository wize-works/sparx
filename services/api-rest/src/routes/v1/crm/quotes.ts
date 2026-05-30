// CRM quotes — list / get / create / update + line items + lifecycle.
//
//   GET    /v1/crm/quotes                       → list
//   POST   /v1/crm/quotes                       → create
//   GET    /v1/crm/quotes/:id                   → fetch one (with items)
//   PATCH  /v1/crm/quotes/:id                   → update
//   POST   /v1/crm/quotes/:id/items             → add line item
//   DELETE /v1/crm/quotes/:id/items/:itemId     → remove line item
//   POST   /v1/crm/quotes/:id/submit            → draft → submitted
//   POST   /v1/crm/quotes/:id/accept            → submitted → accepted
//   POST   /v1/crm/quotes/:id/decline           → submitted → declined
//   POST   /v1/crm/quotes/:id/expire            → submitted → expired
//   POST   /v1/crm/quotes/:id/convert-to-order  → accepted → order created

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { quoteService, quoteLifecycleService } from '@sparx/crm';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });
const ItemPath = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

const ListQuery = z.object({
  customer_id: z.string().uuid().optional(),
  b2b_account_id: z.string().uuid().optional(),
  status: z.string().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: z.enum(['createdAt', 'updatedAt']).optional(),
});

const quoteRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/quotes', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const { items, total } = await quoteService.list(toCrmContext(request), {
      customerId: q.customer_id,
      b2bAccountId: q.b2b_account_id,
      status: q.status,
      take: q.take,
      skip: q.skip,
      sortBy: q.sort_by,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/crm/quotes/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const quote = await quoteService.get(toCrmContext(request), id);
    return ok(quote);
  });

  app.post('/v1/crm/quotes', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const quote = await quoteService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(quote);
  });

  app.patch('/v1/crm/quotes/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const quote = await quoteService.update(toCrmContext(request), id, request.body);
    return ok(quote);
  });

  // ── line items ──────────────────────────────────────────────────────────

  app.post('/v1/crm/quotes/:id/items', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const item = await quoteService.addItem(toCrmContext(request), { ...body, quoteId: id });
    reply.code(201);
    return ok(item);
  });

  app.delete('/v1/crm/quotes/:id/items/:itemId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id, itemId } = ItemPath.parse(request.params);
    await quoteService.removeItem(toCrmContext(request), { quoteId: id, itemId });
    reply.code(204);
  });

  // ── lifecycle ───────────────────────────────────────────────────────────

  app.post('/v1/crm/quotes/:id/submit', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const quote = await quoteLifecycleService.submit(toCrmContext(request), {
      ...body,
      quoteId: id,
    });
    return ok(quote);
  });

  app.post('/v1/crm/quotes/:id/accept', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const quote = await quoteLifecycleService.accept(toCrmContext(request), {
      ...body,
      quoteId: id,
    });
    return ok(quote);
  });

  app.post('/v1/crm/quotes/:id/decline', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const quote = await quoteLifecycleService.decline(toCrmContext(request), {
      ...body,
      quoteId: id,
    });
    return ok(quote);
  });

  app.post('/v1/crm/quotes/:id/expire', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const quote = await quoteLifecycleService.expire(toCrmContext(request), {
      ...body,
      quoteId: id,
    });
    return ok(quote);
  });

  app.post('/v1/crm/quotes/:id/convert-to-order', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const result = await quoteLifecycleService.convertToOrder(toCrmContext(request), {
      ...body,
      quoteId: id,
    });
    reply.code(201);
    return ok(result);
  });

  return Promise.resolve();
};

export default quoteRoutes;
