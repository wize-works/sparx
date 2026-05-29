// CRM activity GraphQL resolvers — append-only event log.

import { activityService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

interface ListArgs {
  customerId?: string;
  dealId?: string;
  b2bAccountId?: string;
  type?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export const activityQueryResolvers = {
  crmActivities: async (_p: unknown, args: ListArgs, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return activityService.list(toCrmContext(ctx.request), args);
  },
};

export const activityMutationResolvers = {
  recordCrmActivity: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return activityService.record(toCrmContext(ctx.request), args.input);
  },
};
