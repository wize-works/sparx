// Site Builder — scoped page layouts (SiteTemplate).
//
//   GET  /v1/sitebuilder/templates?scope=       → list layouts (optionally by scope)
//   POST /v1/sitebuilder/templates              → resolve-or-create an (empty) layout
//   POST /v1/sitebuilder/templates/materialize  → "Customize": resolve-or-create + seed
//                                                  the code default into real sections
//
// The editor resolves a layout here, then does section CRUD by `templateId`
// (docs/handoffs/sitebuilder-phase3-spec.md §13).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sectionService, templateService } from '@sparx/sitebuilder';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  requireSitebuilderModule,
  toSitebuilderContext,
} from '../../../lib/sitebuilder-context.js';

// Optional scope filter; the service-layer schemas own full validation of the
// create/materialize bodies (the established route ↔ service boundary).
const ListQuery = z.object({ scope: z.string().min(1).max(31).optional() });

const templateRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/sitebuilder/templates', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const q = ListQuery.parse(request.query);
    const templates = await templateService.list(toSitebuilderContext(request), q.scope);
    return ok({ templates });
  });

  app.post('/v1/sitebuilder/templates', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const template = await templateService.getOrCreate(toSitebuilderContext(request), request.body);
    return ok(template);
  });

  app.post('/v1/sitebuilder/templates/materialize', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const ctx = toSitebuilderContext(request);
    const template = await templateService.materializeDefault(ctx, request.body);
    const sections = await sectionService.listForTemplate(ctx, template.id);
    return ok({ template, sections });
  });

  return Promise.resolve();
};

export default templateRoutes;
