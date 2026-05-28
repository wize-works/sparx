// CRM B2B accounts (commerce + sales side of the spine).
//
//   GET    /v1/crm/b2b-accounts        → list (filter by status / rep / search)
//   POST   /v1/crm/b2b-accounts        → create
//   GET    /v1/crm/b2b-accounts/:id    → fetch one
//   PATCH  /v1/crm/b2b-accounts/:id    → update (status flips, credit-hold here)
//   DELETE /v1/crm/b2b-accounts/:id    → soft delete

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { b2bAccountService } from '@sparx/crm';
import { ok, paged } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  status: z.enum(['active', 'credit_hold', 'suspended', 'inactive']).optional(),
  assigned_rep_id: z.string().uuid().nullable().optional(),
  q: z.string().max(255).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const b2bAccountRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/b2b-accounts', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const { items, total } = await b2bAccountService.list(toCrmContext(request), {
      status: q.status,
      assignedRepId: q.assigned_rep_id ?? undefined,
      q: q.q,
      take: q.take,
      skip: q.skip,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/crm/b2b-accounts/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const account = await b2bAccountService.get(toCrmContext(request), id);
    return ok(account);
  });

  app.post('/v1/crm/b2b-accounts', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const account = await b2bAccountService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(account);
  });

  app.patch('/v1/crm/b2b-accounts/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const account = await b2bAccountService.update(toCrmContext(request), id, request.body);
    return ok(account);
  });

  app.delete('/v1/crm/b2b-accounts/:id', async (request, reply) => {
    requireRole(request, 'admin');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    await b2bAccountService.softDelete(toCrmContext(request), id);
    reply.code(204);
  });
  return Promise.resolve();
};

export default b2bAccountRoutes;
