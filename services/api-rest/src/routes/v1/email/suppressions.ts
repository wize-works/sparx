// Email suppressions — the do-not-send list (manual + Mailgun-mirrored).
//
//   GET    /v1/email/suppressions          → list (scope/q filters, paged)
//   POST   /v1/email/suppressions          → add one (manual)
//   POST   /v1/email/suppressions/import   → bulk add
//   DELETE /v1/email/suppressions/:id      → remove

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { suppressionService } from '@sparx/email-platform';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

const PathId = z.object({ id: z.string().uuid() });

const emailSuppressionRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/email/suppressions', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { items, total } = await suppressionService.list(toEmailContext(request), request.query);
    return paged(items, { total });
  });

  app.post('/v1/email/suppressions', async (request, reply) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const row = await suppressionService.add(toEmailContext(request), request.body);
    reply.code(201);
    return ok(row);
  });

  app.post('/v1/email/suppressions/import', async (request) => {
    requireRole(request, 'admin');
    await requireEmailModule(request);
    const result = await suppressionService.importMany(toEmailContext(request), request.body);
    return ok(result);
  });

  app.delete('/v1/email/suppressions/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = PathId.parse(request.params);
    await suppressionService.remove(toEmailContext(request), id);
    reply.code(204);
  });

  return Promise.resolve();
};

export default emailSuppressionRoutes;
