// CRM B2B account GraphQL resolvers.

import { b2bAccountService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

interface ListArgs {
  status?: 'active' | 'credit_hold' | 'suspended' | 'inactive';
  q?: string;
  take?: number;
  skip?: number;
}

export const b2bAccountQueryResolvers = {
  b2bAccounts: async (_p: unknown, args: ListArgs, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return b2bAccountService.list(toCrmContext(ctx.request), args);
  },

  b2bAccount: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return b2bAccountService.get(toCrmContext(ctx.request), args.id);
  },
};

export const b2bAccountMutationResolvers = {
  createB2BAccount: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return b2bAccountService.create(toCrmContext(ctx.request), args.input);
  },

  updateB2BAccount: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return b2bAccountService.update(toCrmContext(ctx.request), args.id, args.input);
  },

  archiveB2BAccount: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'admin');
    await requireCrmModule(ctx.request);
    await b2bAccountService.softDelete(toCrmContext(ctx.request), args.id);
    return true;
  },
};
