// Site Builder — draft page section composition.
//
//   GET    /v1/sitebuilder/sections?template_id=   → list a layout's sections
//                                  (or ?scope=&key= to address by scope)
//   POST   /v1/sitebuilder/sections                → add a section ({ templateId | scope[,key] })
//   POST   /v1/sitebuilder/sections/reorder         → reorder a layout's sections
//   PATCH  /v1/sitebuilder/sections/:id             → update config/visibility
//   DELETE /v1/sitebuilder/sections/:id             → remove a section

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sectionService } from '@sparx/sitebuilder';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  requireSitebuilderModule,
  toSitebuilderContext,
} from '../../../lib/sitebuilder-context.js';

const PathId = z.object({ id: z.string().uuid() });
// Address a layout by `template_id` (preferred) or by `scope` (+ optional `key`).
const ListQuery = z.object({
  template_id: z.string().uuid().optional(),
  scope: z.string().min(1).max(31).optional(),
  key: z.string().min(1).max(255).optional(),
});

const sectionRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/sitebuilder/sections', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const q = ListQuery.parse(request.query);
    const ctx = toSitebuilderContext(request);
    const items = q.template_id
      ? await sectionService.listForTemplate(ctx, q.template_id)
      : q.scope
        ? await sectionService.listForScope(ctx, q.scope, q.key ?? 'default')
        : [];
    return ok({ sections: items });
  });

  app.post('/v1/sitebuilder/sections', async (request, reply) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const section = await sectionService.create(toSitebuilderContext(request), request.body);
    return reply.code(201).send(ok(section));
  });

  app.post('/v1/sitebuilder/sections/reorder', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const sections = await sectionService.reorder(toSitebuilderContext(request), request.body);
    return ok({ sections });
  });

  app.patch('/v1/sitebuilder/sections/:id', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const { id } = PathId.parse(request.params);
    const section = await sectionService.update(toSitebuilderContext(request), id, request.body);
    return ok(section);
  });

  app.delete('/v1/sitebuilder/sections/:id', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const { id } = PathId.parse(request.params);
    await sectionService.remove(toSitebuilderContext(request), id);
    return ok({ deleted: true });
  });

  return Promise.resolve();
};

export default sectionRoutes;
