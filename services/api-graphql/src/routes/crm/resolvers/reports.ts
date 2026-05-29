// CRM reporting GraphQL resolvers — live reads off the source tables.

import { reportingService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

export const reportQueryResolvers = {
  crmSnapshot: async (_p: unknown, _args: unknown, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return reportingService.tenantSnapshot(toCrmContext(ctx.request));
  },

  pipelineFunnel: async (_p: unknown, args: { pipelineId: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return reportingService.pipelineFunnel(toCrmContext(ctx.request), args.pipelineId);
  },

  winLossByRep: async (
    _p: unknown,
    args: { pipelineId?: string; since?: string },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return reportingService.winLossByRep(toCrmContext(ctx.request), {
      pipelineId: args.pipelineId,
      since: args.since ? new Date(args.since) : undefined,
    });
  },

  customerAcquisitionByMonth: async (_p: unknown, args: { months?: number }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return reportingService.acquisitionByMonth(toCrmContext(ctx.request), args);
  },
};
