// Email sending domains — provision in Mailgun, show DNS records, verify.
//
//   GET    /v1/email/domains              → list
//   POST   /v1/email/domains              → provision (Mailgun POST /v4/domains)
//   GET    /v1/email/domains/:id          → fetch one (incl. dns_records)
//   POST   /v1/email/domains/:id/verify   → re-check DNS, flip state
//   POST   /v1/email/domains/:id/default  → make default sender
//   DELETE /v1/email/domains/:id          → remove

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { domainService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

const PathId = z.object({ id: z.string().uuid() });

const emailDomainRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/email/domains', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const rows = await domainService.list(toEmailContext(request));
    return ok(rows);
  });

  app.get('/v1/email/domains/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { id } = PathId.parse(request.params);
    const domain = await domainService.get(toEmailContext(request), id);
    return ok(domain);
  });

  app.post('/v1/email/domains', async (request, reply) => {
    requireRole(request, 'admin');
    await requireEmailModule(request);
    const domain = await domainService.create(toEmailContext(request), request.body);
    reply.code(201);
    return ok(domain);
  });

  app.post('/v1/email/domains/:id/verify', async (request) => {
    requireRole(request, 'admin');
    await requireEmailModule(request);
    const { id } = PathId.parse(request.params);
    const domain = await domainService.verify(toEmailContext(request), id);
    return ok(domain);
  });

  app.post('/v1/email/domains/:id/default', async (request) => {
    requireRole(request, 'admin');
    await requireEmailModule(request);
    const { id } = PathId.parse(request.params);
    const domain = await domainService.setDefault(toEmailContext(request), id);
    return ok(domain);
  });

  app.delete('/v1/email/domains/:id', async (request, reply) => {
    requireRole(request, 'admin');
    await requireEmailModule(request);
    const { id } = PathId.parse(request.params);
    await domainService.remove(toEmailContext(request), id);
    reply.code(204);
  });

  return Promise.resolve();
};

export default emailDomainRoutes;
