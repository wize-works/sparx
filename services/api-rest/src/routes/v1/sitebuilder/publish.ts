// Site Builder — publish lifecycle: publish, version history, rollback, and
// scheduled publishing.
//
//   POST   /v1/sitebuilder/publish        → publish the draft now
//   GET    /v1/sitebuilder/versions       → version history (newest first)
//   POST   /v1/sitebuilder/rollback       → roll back to a prior version
//   POST   /v1/sitebuilder/schedule       → schedule a future publish
//   GET    /v1/sitebuilder/schedules      → list schedules
//   DELETE /v1/sitebuilder/schedules/:id  → cancel a pending schedule

import jwt from '@fastify/jwt';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { publishService, scheduleService } from '@sparx/sitebuilder';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  requireSitebuilderModule,
  toSitebuilderContext,
} from '../../../lib/sitebuilder-context.js';

void jwt; // keep the import — fastify-jwt type augmentation lives in plugins/auth.ts

const PathId = z.object({ id: z.string().uuid() });
const VersionsQuery = z.object({
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

// Site-preview token TTL. Long enough for an editing session, short enough that
// no DB revocation row is needed (it's re-minted on every dashboard render, and
// only ever exposes the merchant's own draft). See lib/preview.ts.
const SITE_PREVIEW_TTL_SECONDS = 60 * 60;

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

  // Mint a short-lived, tenant-scoped JWT that lets the PUBLIC storefront serve
  // this tenant's DRAFT site composition to the dashboard preview iframe. No DB
  // row (unlike CMS entry preview tokens) — the short TTL is the control, and it
  // only exposes the merchant's own draft. `aud: site-preview` distinguishes it
  // from session + CMS-entry tokens. Verified by lib/preview.ts#tryVerifySitePreview.
  app.get('/v1/sitebuilder/preview-token', async (request) => {
    const auth = requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const token = app.jwt.sign(
      { tid: auth.tenantId, aud: 'site-preview' },
      { expiresIn: SITE_PREVIEW_TTL_SECONDS }
    );
    return ok({ token, expires_in: SITE_PREVIEW_TTL_SECONDS });
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
