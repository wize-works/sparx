// CRM deal GraphQL resolvers.

import { dealService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

interface DealListArgs {
  pipelineId?: string;
  stageId?: string;
  customerId?: string;
  assignedRepId?: string | null;
  state?: 'open' | 'closed';
  take?: number;
  skip?: number;
}

export const dealQueryResolvers = {
  deals: async (_p: unknown, args: DealListArgs, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return dealService.list(toCrmContext(ctx.request), args);
  },

  deal: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return dealService.get(toCrmContext(ctx.request), args.id);
  },

  dealForecast: async (
    _p: unknown,
    args: { pipelineId?: string | null; startMonth?: string; endMonth?: string },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return dealService.forecast(toCrmContext(ctx.request), {
      pipelineId: args.pipelineId ?? undefined,
      startMonth: args.startMonth,
      endMonth: args.endMonth,
    });
  },
};

export const dealMutationResolvers = {
  createDeal: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return dealService.create(toCrmContext(ctx.request), args.input);
  },

  updateDeal: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return dealService.update(toCrmContext(ctx.request), args.id, args.input);
  },

  moveDealStage: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return dealService.moveStage(toCrmContext(ctx.request), args.id, args.input);
  },

  attachOrderToDeal: async (
    _p: unknown,
    args: { dealId: string; orderId: string },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    await dealService.attachOrder(toCrmContext(ctx.request), args);
    return true;
  },

  detachOrderFromDeal: async (
    _p: unknown,
    args: { dealId: string; orderId: string },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    await dealService.detachOrder(toCrmContext(ctx.request), args);
    return true;
  },

  attachQuoteToDeal: async (
    _p: unknown,
    args: { dealId: string; quoteId: string },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    await dealService.attachQuote(toCrmContext(ctx.request), args);
    return true;
  },

  detachQuoteFromDeal: async (
    _p: unknown,
    args: { dealId: string; quoteId: string },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    await dealService.detachQuote(toCrmContext(ctx.request), args);
    return true;
  },
};
