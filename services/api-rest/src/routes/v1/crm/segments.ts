// CRM segments — CRUD + membership + preview + recompute.
//
//   GET    /v1/crm/segments                       → list (optionally archived)
//   POST   /v1/crm/segments                       → create
//   GET    /v1/crm/segments/:id                   → fetch one
//   PATCH  /v1/crm/segments/:id                   → update (rules trigger evaluator)
//   DELETE /v1/crm/segments/:id                   → archive
//   GET    /v1/crm/segments/:id/members           → materialized membership
//   GET    /v1/crm/segments/:id/member-count      → count of members
//   POST   /v1/crm/segments/preview-count         → match-count for a draft rule
//   POST   /v1/crm/segments/:id/recompute         → full re-evaluation

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { segmentService } from '@sparx/crm';
import { ok, paged } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });
const ListQuery = z.object({ include_archived: z.coerce.boolean().optional() });
const MembersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const segmentRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/segments', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const rows = await segmentService.list(toCrmContext(request), {
      includeArchived: q.include_archived,
    });
    return ok(rows);
  });

  app.get('/v1/crm/segments/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const segment = await segmentService.get(toCrmContext(request), id);
    return ok(segment);
  });

  app.post('/v1/crm/segments', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const segment = await segmentService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(segment);
  });

  app.patch('/v1/crm/segments/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const segment = await segmentService.update(toCrmContext(request), id, request.body);
    return ok(segment);
  });

  app.delete('/v1/crm/segments/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    await segmentService.archive(toCrmContext(request), id);
    reply.code(204);
  });

  app.get('/v1/crm/segments/:id/members', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const q = MembersQuery.parse(request.query);
    const [items, total] = await Promise.all([
      segmentService.members(toCrmContext(request), id, q),
      segmentService.memberCount(toCrmContext(request), id),
    ]);
    return paged(items, { total, per_page: q.limit ?? 100 });
  });

  app.get('/v1/crm/segments/:id/member-count', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const total = await segmentService.memberCount(toCrmContext(request), id);
    return ok({ total });
  });

  app.post('/v1/crm/segments/preview-count', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const result = await segmentService.previewCount(toCrmContext(request), request.body as never);
    return ok(result);
  });

  app.post('/v1/crm/segments/:id/recompute', async (request) => {
    requireRole(request, 'admin');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const result = await segmentService.recomputeFull(toCrmContext(request), { segmentId: id });
    return ok(result);
  });
  return Promise.resolve();
};

export default segmentRoutes;
