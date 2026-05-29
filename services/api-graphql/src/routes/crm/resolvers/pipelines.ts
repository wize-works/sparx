// CRM pipeline + stage GraphQL resolvers.

import { pipelineService } from '@sparx/crm';
import { requireRole } from '@sparx/api-core/auth';
import type { GqlContext } from '../types';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

export const pipelineQueryResolvers = {
  pipelines: async (_p: unknown, args: { includeArchived?: boolean }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return pipelineService.list(toCrmContext(ctx.request), args);
  },

  pipeline: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'viewer');
    await requireCrmModule(ctx.request);
    return pipelineService.get(toCrmContext(ctx.request), args.id);
  },
};

export const pipelineMutationResolvers = {
  createPipeline: async (_p: unknown, args: { input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return pipelineService.create(toCrmContext(ctx.request), args.input);
  },

  updatePipeline: async (_p: unknown, args: { id: string; input: unknown }, ctx: GqlContext) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return pipelineService.update(toCrmContext(ctx.request), args.id, args.input);
  },

  archivePipeline: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
    requireRole(ctx.request, 'admin');
    await requireCrmModule(ctx.request);
    return pipelineService.archive(toCrmContext(ctx.request), args.id);
  },

  createPipelineStage: async (
    _p: unknown,
    args: { pipelineId: string; input: unknown },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return pipelineService.createStage(toCrmContext(ctx.request), args.pipelineId, args.input);
  },

  updatePipelineStage: async (
    _p: unknown,
    args: { stageId: string; input: unknown },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return pipelineService.updateStage(toCrmContext(ctx.request), args.stageId, args.input);
  },

  reorderPipelineStages: async (
    _p: unknown,
    args: { pipelineId: string; stageIds: string[] },
    ctx: GqlContext
  ) => {
    requireRole(ctx.request, 'editor');
    await requireCrmModule(ctx.request);
    return pipelineService.reorderStages(toCrmContext(ctx.request), args.pipelineId, {
      stageIds: args.stageIds,
    });
  },
};
