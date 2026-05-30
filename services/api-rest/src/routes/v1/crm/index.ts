// Mounts every /v1/crm/* route group. One register call from app.ts so the
// CRM URL space lives behind a single registration point.

import type { FastifyPluginAsync } from 'fastify';
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
};

export default crmRoutes;
