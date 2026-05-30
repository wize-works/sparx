// Internal endpoint that feeds business events into the email automation
// engine. A Pub/Sub push subscription (or the commerce/CRM schedulers) POSTs
// events here; automationService.evaluateTrigger matches enabled automations,
// applies suppression + frequency caps, and enqueues ScheduledSend rows.
//
// Auth: shared secret in `X-Sparx-Internal-Cron-Token` (same trust boundary as
// the CRM cron endpoints — ClusterIP only).
//
//   POST /internal/email/trigger   { tenantId, type, data }

import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { automationService } from '@sparx/email-platform';

import { env } from '../../env.js';

const CRON_TOKEN_HEADER = 'x-sparx-internal-cron-token';

class UnauthorizedError extends Error {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED' as const;
}

function authorize(request: FastifyRequest): void {
  const expected = env.SPARX_INTERNAL_CRON_TOKEN;
  if (!expected) throw new UnauthorizedError('Internal cron token is not configured.');
  const provided = request.headers[CRON_TOKEN_HEADER];
  if (typeof provided !== 'string' || provided.length === 0) {
    throw new UnauthorizedError('Missing X-Sparx-Internal-Cron-Token header.');
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedError('Invalid cron token.');
  }
}

const TriggerBody = z.object({
  tenantId: z.string().uuid(),
  type: z.string().min(1).max(63),
  data: z.record(z.string(), z.unknown()).default({}),
});

const emailTriggerRoutes: FastifyPluginAsync = (app) => {
  app.post('/internal/email/trigger', async (request) => {
    authorize(request);
    const { tenantId, type, data } = TriggerBody.parse(request.body);
    const result = await automationService.evaluateTrigger({ tenantId }, { type, data });
    return { success: true, data: result };
  });

  return Promise.resolve();
};

export default emailTriggerRoutes;
