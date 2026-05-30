// Mounts every /v1/crm/* route group. One register call from app.ts so the
// CRM URL space lives behind a single registration point.

import type { FastifyPluginAsync } from 'fastify';
import { pipelineService, segmentService } from '@sparx/crm';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';

import customerRoutes from './customers.js';
import b2bAccountRoutes from './b2b-accounts.js';
import pipelineRoutes from './pipelines.js';
import dealRoutes from './deals.js';
import activityRoutes from './activities.js';
import taskRoutes from './tasks.js';
import segmentRoutes from './segments.js';
import reportRoutes from './reports.js';
import orderRoutes from './orders.js';
import quoteRoutes from './quotes.js';
import { toCrmContext } from '../../../lib/crm-context.js';

const crmRoutes: FastifyPluginAsync = async (app) => {
  await app.register(customerRoutes);
  await app.register(b2bAccountRoutes);
  await app.register(pipelineRoutes);
  await app.register(dealRoutes);
  await app.register(activityRoutes);
  await app.register(taskRoutes);
  await app.register(segmentRoutes);
  await app.register(reportRoutes);
  await app.register(orderRoutes);
  await app.register(quoteRoutes);

  // Idempotent seed for tenants that just enabled CRM. Same functions also
  // run on the `module.activated` Pub/Sub consumer; both paths are no-ops on
  // re-run. The dashboard calls this inline so freshly-activated tenants see
  // the default pipeline + built-in segments without waiting on the bus.
  // No CRM-module gate — by definition this fires the moment activation
  // lands and before any other CRM route is allowed.
  app.post('/v1/crm/bootstrap', async (request) => {
    requireRole(request, 'admin');
    const ctx = toCrmContext(request);
    await pipelineService.bootstrapDefaultPipeline(ctx);
    await segmentService.bootstrapBuiltInSegments(ctx);
    return ok({ bootstrapped: true });
  });
};

export default crmRoutes;
