// Mounts every /v1/email/* management route group. One register call from
// app.ts so the email URL space lives behind a single registration point.
// (The legacy test-send routes stay registered separately in app.ts.)

import type { FastifyPluginAsync } from 'fastify';
import { automationService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';

import emailSettingsRoutes from './settings.js';
import emailDomainRoutes from './domains.js';
import emailSuppressionRoutes from './suppressions.js';
import emailTemplateRoutes from './templates.js';
import emailAutomationRoutes from './automations.js';
import { toEmailContext } from '../../../lib/email-context.js';

const emailRoutes: FastifyPluginAsync = async (app) => {
  await app.register(emailSettingsRoutes);
  await app.register(emailDomainRoutes);
  await app.register(emailSuppressionRoutes);
  await app.register(emailTemplateRoutes);
  await app.register(emailAutomationRoutes);

  // Idempotent seed for a freshly-activated email module — provisions the
  // default automations. Mirrors /v1/crm/bootstrap; no module gate (it fires
  // the moment activation lands, before any other email route is allowed).
  app.post('/v1/email/bootstrap', async (request) => {
    requireRole(request, 'admin');
    const automations = await automationService.provisionDefaults(toEmailContext(request));
    return ok({ bootstrapped: true, automations: automations.length });
  });
};

export default emailRoutes;
