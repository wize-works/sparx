// CRM activity feed — the append-only event log (locked decision #3).
//
//   GET  /v1/crm/activities  → list (filter by customer / deal / b2b / type / window)
//   POST /v1/crm/activities  → record a new activity (human-authored notes,
//                              calls, meetings, files; consumers go through
//                              the in-process service directly)

import type { FastifyPluginAsync } from 'fastify';
import { activityService } from '@sparx/crm';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const activityRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/activities', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const rows = await activityService.list(toCrmContext(request), request.query);
    return ok(rows);
  });

  app.post('/v1/crm/activities', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const activity = await activityService.record(toCrmContext(request), request.body);
    reply.code(201);
    return ok(activity);
  });
  return Promise.resolve();
};

export default activityRoutes;
