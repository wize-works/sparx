// Site Builder — header / footer / announcement layout slots.
//
//   GET /v1/sitebuilder/layout         → all slots
//   PUT /v1/sitebuilder/layout/:slot   → upsert a slot (config + nav menu ref)

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { layoutService } from '@sparx/sitebuilder';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  requireSitebuilderModule,
  toSitebuilderContext,
} from '../../../lib/sitebuilder-context.js';

const PathSlot = z.object({ slot: z.enum(['header', 'footer', 'announcement']) });

const layoutRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/sitebuilder/layout', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const blocks = await layoutService.list(toSitebuilderContext(request));
    return ok({ blocks });
  });

  app.put('/v1/sitebuilder/layout/:slot', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const { slot } = PathSlot.parse(request.params);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const block = await layoutService.upsert(toSitebuilderContext(request), { ...body, slot });
    return ok(block);
  });

  return Promise.resolve();
};

export default layoutRoutes;
