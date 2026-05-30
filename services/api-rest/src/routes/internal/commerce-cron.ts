// Internal endpoints invoked by the Commerce k8s CronJobs (k8s/cronjobs/).
//
// Auth: shared secret in `X-Sparx-Internal-Cron-Token`, constant-time
// compared against env.SPARX_INTERNAL_CRON_TOKEN. Same pattern as CRM's
// internal cron surface.
//
// Each endpoint runs one scheduler:
//   • POST /internal/commerce/reservation-reaper  → releases expired cart reservations
//
// Per-tenant loops are sequential to keep DB load predictable. Commerce
// reaper runs every minute on a tight loop because the impact of a stuck
// reservation (held stock that a real shopper can't buy) gets worse the
// longer it sits.

import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { commerceSchedulers } from '@sparx/commerce';

import { env } from '../../env.js';

const CRON_TOKEN_HEADER = 'x-sparx-internal-cron-token';

function authorize(request: FastifyRequest): void {
  const expected = env.SPARX_INTERNAL_CRON_TOKEN;
  if (!expected) {
    throw unauthorized('Internal cron token is not configured.');
  }
  const provided = request.headers[CRON_TOKEN_HEADER];
  if (typeof provided !== 'string' || provided.length === 0) {
    throw unauthorized('Missing X-Sparx-Internal-Cron-Token header.');
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw unauthorized('Invalid cron token.');
  }
}

interface TenantOutcome {
  tenantId: string;
  ok: boolean;
  error?: string;
  result?: unknown;
}

async function forEachActiveTenant<T>(
  run: (tenantId: string) => Promise<T>
): Promise<{ tenants: number; outcomes: TenantOutcome[] }> {
  const tenants = await commerceSchedulers.listCommerceActiveTenants();
  const outcomes: TenantOutcome[] = [];
  for (const t of tenants) {
    try {
      const result = await run(t.id);
      outcomes.push({ tenantId: t.id, ok: true, result });
    } catch (err) {
      outcomes.push({
        tenantId: t.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { tenants: tenants.length, outcomes };
}

const commerceCronRoutes: FastifyPluginAsync = (app) => {
  app.post('/internal/commerce/reservation-reaper', async (request) => {
    authorize(request);
    const summary = await forEachActiveTenant((tenantId) =>
      commerceSchedulers.reapExpiredReservations({ tenantId })
    );
    return { success: true, data: summary };
  });
  return Promise.resolve();
};

function unauthorized(message: string): Error {
  const err = new Error(message);
  (err as { statusCode?: number }).statusCode = 401;
  (err as { code?: string }).code = 'UNAUTHORIZED';
  return err;
}

export default commerceCronRoutes;
