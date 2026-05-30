// Site Builder — publish lifecycle: publish, version history, rollback, and
// scheduled publishing.
//
//   POST   /v1/sitebuilder/publish        → publish the draft now
//   GET    /v1/sitebuilder/versions       → version history (newest first)
//   POST   /v1/sitebuilder/rollback       → roll back to a prior version
//   POST   /v1/sitebuilder/schedule       → schedule a future publish
//   GET    /v1/sitebuilder/schedules      → list schedules
//   DELETE /v1/sitebuilder/schedules/:id  → cancel a pending schedule

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { publishService, scheduleService } from '@sparx/sitebuilder';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  requireSitebuilderModule,
  toSitebuilderContext,
} from '../../../lib/sitebuilder-context.js';

const PathId = z.object({ id: z.string().uuid() });
const VersionsQuery = z.object({
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const publishRoutes: FastifyPluginAsync = (app) => {
  app.post('/v1/sitebuilder/publish', async (request) => {
    requireRole(request, 'admin');
    await requireSitebuilderModule(request);
    const version = await publishService.publishNow(toSitebuilderContext(request), request.body);
    return ok(version);
  });

  app.get('/v1/sitebuilder/preview', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const snapshot = await publishService.getDraftSnapshot(toSitebuilderContext(request));
    return ok(snapshot);
  });

  app.get('/v1/sitebuilder/versions', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const q = VersionsQuery.parse(request.query);
    const { items, total } = await publishService.listVersions(toSitebuilderContext(request), q);
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.post('/v1/sitebuilder/rollback', async (request) => {
    requireRole(request, 'admin');
    await requireSitebuilderModule(request);
    const version = await publishService.rollback(toSitebuilderContext(request), request.body);
    return ok(version);
  });

  app.post('/v1/sitebuilder/schedule', async (request, reply) => {
    requireRole(request, 'admin');
    await requireSitebuilderModule(request);
    const scheduled = await scheduleService.schedule(toSitebuilderContext(request), request.body);
    return reply.code(201).send(ok(scheduled));
  });

  app.get('/v1/sitebuilder/schedules', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const schedules = await scheduleService.listSchedules(toSitebuilderContext(request));
    return ok({ schedules });
  });

  app.delete('/v1/sitebuilder/schedules/:id', async (request) => {
    requireRole(request, 'admin');
    await requireSitebuilderModule(request);
    const { id } = PathId.parse(request.params);
    const cancelled = await scheduleService.cancel(toSitebuilderContext(request), id);
    return ok(cancelled);
  });

  return Promise.resolve();
};

export default publishRoutes;
