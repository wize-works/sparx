// CRM customer GraphQL resolvers — thin wrappers over @sparx/crm's
// customerService. Same service functions REST + MCP call, so a bug fixed
// in customerService.list() is fixed here on next deploy.

import { customerService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

type CustomerType = 'prospect' | 'retail' | 'b2b';

export const customerQueryResolvers = {
  crmCustomers: async (
    _p: unknown,
    args: { type?: CustomerType; tag?: string; q?: string; take?: number; skip?: number },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return customerService.list(toCrmContext(ctx.request), args);
  },

  crmCustomer: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return customerService.get(toCrmContext(ctx.request), args.id);
  },

  crmTopCustomers: async (
    _p: unknown,
    args: { limit?: number; type?: 'retail' | 'b2b' },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return customerService.getTopBySpend(toCrmContext(ctx.request), args);
  },

  crmInactiveCustomers: async (
    _p: unknown,
    args: { days: number; limit?: number },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return customerService.getInactive(toCrmContext(ctx.request), args);
  },
};

export const customerMutationResolvers = {
  createCustomer: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return customerService.create(toCrmContext(ctx.request), args.input);
  },

  updateCustomer: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return customerService.update(toCrmContext(ctx.request), args.id, args.input);
  },

  deleteCustomer: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    await customerService.softDelete(toCrmContext(ctx.request), args.id);
    return true;
  },

  bulkAssignCustomers: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    const result = await customerService.bulkAssign(toCrmContext(ctx.request), args.input);
    return result.updatedCount;
  },

  bulkTagCustomers: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    const result = await customerService.bulkTag(toCrmContext(ctx.request), args.input);
    return result.updatedCount;
  },

  mergeCustomers: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'admin');
    await requireCrmModule(ctx.request);
    const result = await customerService.merge(toCrmContext(ctx.request), args.input);
    return result.primary;
  },
};
