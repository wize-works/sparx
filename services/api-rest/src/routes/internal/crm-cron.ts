// Internal endpoints invoked by the CRM k8s CronJobs (k8s/cronjobs/).
//
// Auth: shared secret in `X-Sparx-Internal-Cron-Token`, constant-time
// compared against env.SPARX_INTERNAL_CRON_TOKEN. No JWT — these endpoints
// are ClusterIP-only and only the CronJob pods reach them.
//
// Each endpoint runs one daily scheduler:
//   • POST /internal/crm/partition-rollover   → ensureCrmActivitiesPartitions
//   • POST /internal/crm/automation-triggers  → runDailyAutomationTriggers (per active tenant)
//   • POST /internal/crm/overdue-reminders    → emitOverdueTaskReminders (per active tenant)
//   • POST /internal/crm/segment-recompute    → segmentService.recomputeFull (per active tenant)
//
// Per-tenant loops are sequential. CRM-active tenant count is tiny in
// Phase 1; sequential keeps DB load predictable and lets one failing
// tenant be logged + skipped without poisoning the rest.

import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { crmSchedulers, segmentService } from '@sparx/crm';

import { env } from '../../env.js';

const CRON_TOKEN_HEADER = 'x-sparx-internal-cron-token';

function authorize(request: FastifyRequest): void {
  const expected = env.SPARX_INTERNAL_CRON_TOKEN;
  if (!expected) {
    // No token configured → endpoints are disabled. Treat as 401 so a
    // forgotten secret in prod surfaces loudly in CronJob logs.
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
  const tenants = await crmSchedulers.listCrmActiveTenants();
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

const crmCronRoutes: FastifyPluginAsync = (app) => {
  app.post('/internal/crm/partition-rollover', async (request) => {
    authorize(request);
    const result = await crmSchedulers.ensureCrmActivitiesPartitions();
    return { success: true, data: result };
  });

  app.post('/internal/crm/automation-triggers', async (request) => {
    authorize(request);
    const summary = await forEachActiveTenant((tenantId) =>
      crmSchedulers.runDailyAutomationTriggers({ tenantId })
    );
    return { success: true, data: summary };
  });

  app.post('/internal/crm/overdue-reminders', async (request) => {
    authorize(request);
    const summary = await forEachActiveTenant((tenantId) => crmSchedulers.emitOverdueTaskReminders({ tenantId }));
    return { success: true, data: summary };
  });

  app.post('/internal/crm/segment-recompute', async (request) => {
    authorize(request);
    const summary = await forEachActiveTenant((tenantId) =>
      segmentService.recomputeFull({ tenantId })
    );
    return { success: true, data: summary };
  });

  return Promise.resolve();
};

// Local copy of @sparx/api-core/errors' unauthorized() so this file doesn't
// have to import the FastifyError class chain. The errors plugin wraps any
// thrown Error in the platform envelope; we just need a recognizable
// statusCode + code.
class UnauthorizedError extends Error {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED' as const;
}
function unauthorized(message: string): UnauthorizedError {
  return new UnauthorizedError(message);
}

export default crmCronRoutes;
