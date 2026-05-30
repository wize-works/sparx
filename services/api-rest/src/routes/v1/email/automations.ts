// Email automations — default flows (PRD §4) the merchant enables/configures.
//
//   GET   /v1/email/automations        → list
//   GET   /v1/email/automations/:id    → one
//   PATCH /v1/email/automations/:id    → update (enable/disable, delay, cap)

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { automationService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

const IdParam = z.object({ id: z.string().uuid() });

const emailAutomationRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/email/automations', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    return ok(await automationService.list(toEmailContext(request)));
  });

  app.get('/v1/email/automations/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await automationService.get(toEmailContext(request), id));
  });

  app.patch('/v1/email/automations/:id', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const { id } = IdParam.parse(request.params);
    return ok(await automationService.update(toEmailContext(request), id, request.body));
  });

  return Promise.resolve();
};

export default emailAutomationRoutes;
