// CRM reporting — read-only metrics for the dashboard reports page and the
// MCP get_crm_metrics tool. Live queries today; rollup table comes later.
//
//   GET /v1/crm/reports/snapshot                  → tenant KPI snapshot
//   GET /v1/crm/reports/pipeline-funnel?pipeline_id  → funnel by stage
//   GET /v1/crm/reports/win-loss?pipeline_id&since   → win/loss by rep
//   GET /v1/crm/reports/acquisition?months           → new customers per month

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { reportingService } from '@sparx/crm';
import { ok } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const FunnelQuery = z.object({ pipeline_id: z.string().uuid() });
const WinLossQuery = z.object({
  pipeline_id: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
});
const AcquisitionQuery = z.object({ months: z.coerce.number().int().min(1).max(36).optional() });

const reportRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/reports/snapshot', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const snapshot = await reportingService.tenantSnapshot(toCrmContext(request));
    return ok(snapshot);
  });

  app.get('/v1/crm/reports/pipeline-funnel', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = FunnelQuery.parse(request.query);
    const rows = await reportingService.pipelineFunnel(toCrmContext(request), q.pipeline_id);
    return ok(rows);
  });

  app.get('/v1/crm/reports/win-loss', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = WinLossQuery.parse(request.query);
    const rows = await reportingService.winLossByRep(toCrmContext(request), {
      pipelineId: q.pipeline_id,
      since: q.since ? new Date(q.since) : undefined,
    });
    return ok(rows);
  });

  app.get('/v1/crm/reports/acquisition', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = AcquisitionQuery.parse(request.query);
    const rows = await reportingService.acquisitionByMonth(toCrmContext(request), {
      months: q.months,
    });
    return ok(rows);
  });
  return Promise.resolve();
};

export default reportRoutes;
