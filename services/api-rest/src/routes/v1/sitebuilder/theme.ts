// Site Builder — theme catalog + per-tenant config/settings.
//
//   GET   /v1/sitebuilder/themes            → static theme catalog
//   GET   /v1/sitebuilder/config            → current draft config
//   PUT   /v1/sitebuilder/config/theme      → select a theme
//   PATCH /v1/sitebuilder/config/settings   → update settings / appearance
//
// Thin transport — themeService owns validation, audit, and events.

import type { FastifyPluginAsync } from 'fastify';
import { themeService } from '@sparx/sitebuilder';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  requireSitebuilderModule,
  toSitebuilderContext,
} from '../../../lib/sitebuilder-context.js';

const themeRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/sitebuilder/themes', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    return ok({ themes: themeService.listThemes() });
  });

  app.get('/v1/sitebuilder/config', async (request) => {
    requireRole(request, 'viewer');
    await requireSitebuilderModule(request);
    const config = await themeService.getConfig(toSitebuilderContext(request));
    return ok(config);
  });

  app.put('/v1/sitebuilder/config/theme', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const config = await themeService.selectTheme(toSitebuilderContext(request), request.body);
    return ok(config);
  });

  app.patch('/v1/sitebuilder/config/settings', async (request) => {
    requireRole(request, 'editor');
    await requireSitebuilderModule(request);
    const config = await themeService.updateSettings(toSitebuilderContext(request), request.body);
    return ok(config);
  });

  return Promise.resolve();
};

export default themeRoutes;
