// CRM customers — list / get / create / update / delete / bulk + queries.
//
//   GET    /v1/crm/customers              → list (filterable)
//   POST   /v1/crm/customers              → create
//   GET    /v1/crm/customers/:id          → fetch one
//   PATCH  /v1/crm/customers/:id          → update
//   DELETE /v1/crm/customers/:id          → soft delete
//   POST   /v1/crm/customers/bulk-assign  → bulk reassign rep
//   POST   /v1/crm/customers/bulk-tag     → bulk add/remove tag
//   GET    /v1/crm/customers/top          → top by spend
//   GET    /v1/crm/customers/inactive     → no order in N days
//   GET    /v1/crm/customers/duplicates   → likely duplicate clusters
//   POST   /v1/crm/customers/merge        → merge two customers
//
// Routes are intentionally thin — every write goes through customerService,
// which owns Zod validation, audit logs, and event publishing. The transport
// here is responsible only for parsing the URL/query, gating the module, and
// rendering the success envelope (locked decision #7).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { customerService } from '@sparx/crm';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  type: z.enum(['prospect', 'retail', 'b2b']).optional(),
  assigned_rep_id: z.string().uuid().nullable().optional(),
  b2b_account_id: z.string().uuid().nullable().optional(),
  tag: z.string().max(64).optional(),
  q: z.string().max(255).optional(),
  include_deleted: z.coerce.boolean().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: z.enum(['lastOrderAt', 'totalSpent', 'updatedAt', 'createdAt']).optional(),
});

const TopQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  type: z.enum(['retail', 'b2b']).optional(),
});

const InactiveQuery = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const customerRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/customers', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const ctx = toCrmContext(request);
    const { items, total } = await customerService.list(ctx, {
      type: q.type,
      assignedRepId: q.assigned_rep_id ?? undefined,
      b2bAccountId: q.b2b_account_id ?? undefined,
      tag: q.tag,
      q: q.q,
      includeDeleted: q.include_deleted,
      take: q.take,
      skip: q.skip,
      sortBy: q.sort_by,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/crm/customers/top', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = TopQuery.parse(request.query);
    const rows = await customerService.getTopBySpend(toCrmContext(request), q);
    return ok(rows);
  });

  app.get('/v1/crm/customers/inactive', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = InactiveQuery.parse(request.query);
    const rows = await customerService.getInactive(toCrmContext(request), q);
    return ok(rows);
  });

  app.get('/v1/crm/customers/duplicates', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const groups = await customerService.findLikelyDuplicates(toCrmContext(request));
    return ok(groups);
  });

  app.get('/v1/crm/customers/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const customer = await customerService.get(toCrmContext(request), id);
    return ok(customer);
  });

  app.post('/v1/crm/customers', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const customer = await customerService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(customer);
  });

  app.patch('/v1/crm/customers/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const customer = await customerService.update(toCrmContext(request), id, request.body);
    return ok(customer);
  });

  app.delete('/v1/crm/customers/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    await customerService.softDelete(toCrmContext(request), id);
    reply.code(204);
  });

  app.post('/v1/crm/customers/bulk-assign', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const result = await customerService.bulkAssign(toCrmContext(request), request.body);
    return ok(result);
  });

  app.post('/v1/crm/customers/bulk-tag', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const result = await customerService.bulkTag(toCrmContext(request), request.body);
    return ok(result);
  });

  app.post('/v1/crm/customers/merge', async (request) => {
    requireRole(request, 'admin');
    await requireCrmModule(request);
    const result = await customerService.merge(toCrmContext(request), request.body);
    return ok(result);
  });
  return Promise.resolve();
};

export default customerRoutes;
