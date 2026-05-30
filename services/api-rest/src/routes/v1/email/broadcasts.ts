// Email broadcasts — segment-targeted marketing campaigns.
//
//   GET    /v1/email/broadcasts                 → list
//   POST   /v1/email/broadcasts                 → create (draft)
//   GET    /v1/email/broadcasts/estimate        → recipient estimate (?segment_id=)
//   GET    /v1/email/broadcasts/:id             → one
//   PATCH  /v1/email/broadcasts/:id             → update (draft only)
//   GET    /v1/email/broadcasts/:id/stats       → engagement counts
//   POST   /v1/email/broadcasts/:id/send        → send now
//   POST   /v1/email/broadcasts/:id/schedule    → schedule
//   POST   /v1/email/broadcasts/:id/cancel      → cancel a scheduled send

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { broadcastService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

const IdParam = z.object({ id: z.string().uuid() });
const EstimateQuery = z.object({ segment_id: z.string().uuid().optional() });

const emailBroadcastRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/email/broadcasts', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    return ok(await broadcastService.list(toEmailContext(request)));
  });

  app.get('/v1/email/broadcasts/estimate', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const q = EstimateQuery.parse(request.query);
    return ok(
      await broadcastService.estimateRecipients(toEmailContext(request), q.segment_id ?? null)
    );
  });

  app.post('/v1/email/broadcasts', async (request, reply) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const row = await broadcastService.create(toEmailContext(request), request.body);
    reply.code(201);
    return ok(row);
  });

  app.get('/v1/email/broadcasts/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await broadcastService.get(toEmailContext(request), id));
  });

  app.patch('/v1/email/broadcasts/:id', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await broadcastService.update(toEmailContext(request), id, request.body));
  });

  app.get('/v1/email/broadcasts/:id/stats', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await broadcastService.stats(toEmailContext(request), id));
  });

  app.post('/v1/email/broadcasts/:id/send', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await broadcastService.sendNow(toEmailContext(request), id));
  });

  app.post('/v1/email/broadcasts/:id/schedule', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await broadcastService.schedule(toEmailContext(request), id, request.body));
  });

  app.post('/v1/email/broadcasts/:id/cancel', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await broadcastService.cancel(toEmailContext(request), id));
  });

  return Promise.resolve();
};

export default emailBroadcastRoutes;
