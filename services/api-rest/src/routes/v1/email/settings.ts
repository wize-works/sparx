// Email settings — sender identity, CAN-SPAM footer, brand fallback.
//
//   GET   /v1/email/settings   → current settings (defaults when unset)
//   PATCH /v1/email/settings   → update (partial)

import type { FastifyPluginAsync } from 'fastify';
import { settingsService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync signature.
const emailSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/email/settings', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const settings = await settingsService.get(toEmailContext(request));
    return ok(settings);
  });

  app.patch('/v1/email/settings', async (request) => {
    requireRole(request, 'editor');
    await requireEmailModule(request);
    const settings = await settingsService.update(toEmailContext(request), request.body);
    return ok(settings);
  });
};

export default emailSettingsRoutes;
