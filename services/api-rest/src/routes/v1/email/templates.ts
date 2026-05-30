// Email templates — two tracks: built-in transactional (constrained override)
// and merchant-authored marketing (TipTap body).
//
//   GET    /v1/email/templates                          → list (builtins + authored)
//   GET    /v1/email/templates/builtin/:key             → one built-in (+ override)
//   PATCH  /v1/email/templates/builtin/:key             → save override (subject + slots)
//   GET    /v1/email/templates/builtin/:key/preview     → rendered HTML
//   POST   /v1/email/templates/builtin/:key/test-send   → send a test
//   POST   /v1/email/templates                          → create authored
//   GET    /v1/email/templates/:id                      → one authored
//   PATCH  /v1/email/templates/:id                      → update authored
//   DELETE /v1/email/templates/:id                      → archive authored
//   GET    /v1/email/templates/:id/preview              → rendered HTML
//   POST   /v1/email/templates/:id/test-send            → send a test

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { templateService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

const KeyParam = z.object({ key: z.string().min(1).max(63) });
const IdParam = z.object({ id: z.string().uuid() });

const emailTemplateRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/email/templates', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    return ok(await templateService.list(toEmailContext(request)));
  });

  // ── Built-in ──────────────────────────────────────────────────────────
  app.get('/v1/email/templates/builtin/:key', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { key } = KeyParam.parse(request.params);
    return ok(await templateService.getBuiltin(toEmailContext(request), key));
  });

  app.patch('/v1/email/templates/builtin/:key', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { key } = KeyParam.parse(request.params);
    return ok(await templateService.saveBuiltinOverride(toEmailContext(request), key, request.body));
  });

  app.get('/v1/email/templates/builtin/:key/preview', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { key } = KeyParam.parse(request.params);
    return ok(
      await templateService.renderPreview(toEmailContext(request), { source: 'builtin', key })
    );
  });

  app.post('/v1/email/templates/builtin/:key/test-send', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { key } = KeyParam.parse(request.params);
    return ok(
      await templateService.testSend(toEmailContext(request), { source: 'builtin', key }, request.body)
    );
  });

  // ── Authored ──────────────────────────────────────────────────────────
  app.post('/v1/email/templates', async (request, reply) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const row = await templateService.createAuthored(toEmailContext(request), request.body);
    reply.code(201);
    return ok(row);
  });

  app.get('/v1/email/templates/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await templateService.getAuthored(toEmailContext(request), id));
  });

  app.patch('/v1/email/templates/:id', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await templateService.updateAuthored(toEmailContext(request), id, request.body));
  });

  app.delete('/v1/email/templates/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    await templateService.archiveAuthored(toEmailContext(request), id);
    reply.code(204);
  });

  app.get('/v1/email/templates/:id/preview', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(
      await templateService.renderPreview(toEmailContext(request), { source: 'authored', id })
    );
  });

  app.post('/v1/email/templates/:id/test-send', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(
      await templateService.testSend(toEmailContext(request), { source: 'authored', id }, request.body)
    );
  });

  return Promise.resolve();
};

export default emailTemplateRoutes;
