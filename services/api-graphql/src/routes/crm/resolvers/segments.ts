// CRM segment GraphQL resolvers.

import { segmentService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

export const segmentQueryResolvers = {
  segments: async (_p: unknown, args: { includeArchived?: boolean }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return segmentService.list(toCrmContext(ctx.request), args);
  },

  segment: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return segmentService.get(toCrmContext(ctx.request), args.id);
  },

  segmentMembers: async (
    _p: unknown,
    args: { id: string; limit?: number; offset?: number },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return segmentService.members(toCrmContext(ctx.request), args.id, {
      limit: args.limit,
      offset: args.offset,
    });
  },

  segmentMemberCount: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return segmentService.memberCount(toCrmContext(ctx.request), args.id);
  },

  previewSegmentCount: async (
    _p: unknown,
    args: { rule: unknown; sampleSize?: number },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return segmentService.previewCount(toCrmContext(ctx.request), args);
  },
};

export const segmentMutationResolvers = {
  createSegment: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return segmentService.create(toCrmContext(ctx.request), args.input);
  },

  updateSegment: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return segmentService.update(toCrmContext(ctx.request), args.id, args.input);
  },

  archiveSegment: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    await segmentService.archive(toCrmContext(ctx.request), args.id);
    return true;
  },

  recomputeSegment: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'admin');
    await requireCrmModule(ctx.request);
    return segmentService.recomputeFull(toCrmContext(ctx.request), { segmentId: args.id });
  },
};
