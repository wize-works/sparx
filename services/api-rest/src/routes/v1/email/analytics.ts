// Email analytics — engagement rollups from the EmailEvent log.
//
//   GET /v1/email/analytics/overview?days=30   → counts + suppressions + recent

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { analyticsService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireEmailModule, toEmailContext } from '../../../lib/email-context.js';

const OverviewQuery = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });

const emailAnalyticsRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/email/analytics/overview', async (request) => {
    requireRole(request, 'viewer');
    await requireEmailModule(request);
    const q = OverviewQuery.parse(request.query);
    return ok(await analyticsService.overview(toEmailContext(request), q.days ?? 30));
  });

  return Promise.resolve();
};

export default emailAnalyticsRoutes;
