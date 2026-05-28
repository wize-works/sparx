// CRM pipelines + their stages.
//
//   GET    /v1/crm/pipelines                          → list (with stages)
//   POST   /v1/crm/pipelines                          → create
//   GET    /v1/crm/pipelines/:id                      → fetch one (with stages)
//   PATCH  /v1/crm/pipelines/:id                      → update
//   DELETE /v1/crm/pipelines/:id                      → archive (no hard delete)
//   POST   /v1/crm/pipelines/:id/stages               → create a stage
//   POST   /v1/crm/pipelines/:id/stages/reorder       → batch-reorder stages
//   PATCH  /v1/crm/pipelines/:id/stages/:stageId      → update a stage

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pipelineService } from '@sparx/crm';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';

const PathId = z.object({ id: z.string().uuid() });
const StagePathIds = z.object({
  id: z.string().uuid(),
  stageId: z.string().uuid(),
});
const ListQuery = z.object({
  include_archived: z.coerce.boolean().optional(),
});

const pipelineRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/crm/pipelines', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const rows = await pipelineService.list(toCrmContext(request), {
      includeArchived: q.include_archived,
    });
    return ok(rows);
  });

  app.get('/v1/crm/pipelines/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const pipeline = await pipelineService.get(toCrmContext(request), id);
    return ok(pipeline);
  });

  app.post('/v1/crm/pipelines', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const pipeline = await pipelineService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(pipeline);
  });

  app.patch('/v1/crm/pipelines/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const pipeline = await pipelineService.update(toCrmContext(request), id, request.body);
    return ok(pipeline);
  });

  app.delete('/v1/crm/pipelines/:id', async (request) => {
    requireRole(request, 'admin');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const pipeline = await pipelineService.archive(toCrmContext(request), id);
    return ok(pipeline);
  });

  app.post('/v1/crm/pipelines/:id/stages', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const stage = await pipelineService.createStage(toCrmContext(request), id, request.body);
    reply.code(201);
    return ok(stage);
  });

  app.post('/v1/crm/pipelines/:id/stages/reorder', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const stages = await pipelineService.reorderStages(toCrmContext(request), id, request.body);
    return ok(stages);
  });

  app.patch('/v1/crm/pipelines/:id/stages/:stageId', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { stageId } = StagePathIds.parse(request.params);
    const stage = await pipelineService.updateStage(toCrmContext(request), stageId, request.body);
    return ok(stage);
  });
  return Promise.resolve();
};

export default pipelineRoutes;
