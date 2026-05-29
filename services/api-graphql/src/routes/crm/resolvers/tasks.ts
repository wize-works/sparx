// CRM task GraphQL resolvers.

import { taskService } from '@sparx/crm';
import { requireAuth, requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

interface ListArgs {
  assignedToUserId?: string;
  customerId?: string;
  dealId?: string;
  status?: 'open' | 'completed' | 'cancelled';
  take?: number;
}

export const taskQueryResolvers = {
  crmTasks: async (_p: unknown, args: ListArgs, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return taskService.list(toCrmContext(ctx.request), args);
  },

  crmTask: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return taskService.get(toCrmContext(ctx.request), args.id);
  },

  crmOverdueTasks: async (_p: unknown, args: { userId?: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return taskService.getOverdue(toCrmContext(ctx.request), { userId: args.userId });
  },

  crmTodayTasks: async (_p: unknown, _args: unknown, ctx: GqlContext) => {
    const auth = requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return taskService.getTodayForUser(toCrmContext(ctx.request), { userId: auth.actorId });
  },
};

export const taskMutationResolvers = {
  createCrmTask: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireAuth(ctx.request);
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return taskService.create(toCrmContext(ctx.request), args.input);
  },

  updateCrmTask: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return taskService.update(toCrmContext(ctx.request), args.id, args.input);
  },

  completeCrmTask: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireAuth(ctx.request);
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return taskService.complete(toCrmContext(ctx.request), { taskId: args.id });
  },
};
