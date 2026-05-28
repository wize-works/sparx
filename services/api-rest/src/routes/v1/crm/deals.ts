// CRM deals — list / get / create / update / move-stage / forecast.
// Attach/detach order + quote routes live in ./deal-attachments.ts to keep
// this file under the 200-line target.
//
//   GET    /v1/crm/deals                      → list
//   POST   /v1/crm/deals                      → create
//   GET    /v1/crm/deals/forecast             → weighted forecast
//   GET    /v1/crm/deals/:id                  → fetch one
//   PATCH  /v1/crm/deals/:id                  → update
//   POST   /v1/crm/deals/:id/move-stage       → move to a new stage

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dealService } from '@sparx/crm';
import { ok, paged } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { requireCrmModule, toCrmContext } from '../../../lib/crm-context.js';
import dealAttachmentRoutes from './deal-attachments.js';

const PathId = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  b2b_account_id: z.string().uuid().optional(),
  assigned_rep_id: z.string().uuid().nullable().optional(),
  state: z.enum(['open', 'closed']).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const ForecastQuery = z.object({
  pipeline_id: z.string().uuid().nullable().optional(),
  start_month: z.string().optional(),
  end_month: z.string().optional(),
});

const dealRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/crm/deals', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ListQuery.parse(request.query);
    const { items, total } = await dealService.list(toCrmContext(request), {
      pipelineId: q.pipeline_id,
      stageId: q.stage_id,
      customerId: q.customer_id,
      b2bAccountId: q.b2b_account_id,
      assignedRepId: q.assigned_rep_id ?? undefined,
      state: q.state,
      take: q.take,
      skip: q.skip,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/crm/deals/forecast', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const q = ForecastQuery.parse(request.query);
    const result = await dealService.forecast(toCrmContext(request), {
      pipelineId: q.pipeline_id ?? undefined,
      startMonth: q.start_month,
      endMonth: q.end_month,
    });
    return ok(result);
  });

  app.get('/v1/crm/deals/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const deal = await dealService.get(toCrmContext(request), id);
    return ok(deal);
  });

  app.post('/v1/crm/deals', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const deal = await dealService.create(toCrmContext(request), request.body);
    reply.code(201);
    return ok(deal);
  });

  app.patch('/v1/crm/deals/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const deal = await dealService.update(toCrmContext(request), id, request.body);
    return ok(deal);
  });

  app.post('/v1/crm/deals/:id/move-stage', async (request) => {
    requireRole(request, 'editor');
    await requireCrmModule(request);
    const { id } = PathId.parse(request.params);
    const deal = await dealService.moveStage(toCrmContext(request), id, request.body);
    return ok(deal);
  });

  await app.register(dealAttachmentRoutes);
};

export default dealRoutes;
