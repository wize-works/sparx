// Public storefront read surface — the published Site Builder snapshot the
// storefront renders.
//
//   GET /v1/public/storefront/site ?tenant=<slug>
//     → { themeKey, appearancePolicy, compiledTokens: {light,dark},
//         sections: [...], layout: [...] } or null when nothing is published.
//
// Tenant is resolved from ?tenant=<slug> (the storefront hostname upstream);
// the storefront module must be enabled. Read-only and unauthenticated — only
// PUBLISHED config is exposed (drafts live behind the authenticated
// /v1/sitebuilder/preview endpoint).

import type { FastifyPluginAsync } from 'fastify';
import { isModuleEnabled } from '@sparx/auth';
import { publishService } from '@sparx/sitebuilder';
import { ok } from '@sparx/api-core/envelope';
import { moduleDisabled } from '@sparx/api-core/errors';
import { resolveTenantId } from '../../../lib/public-commerce-context.js';

const publicStorefrontRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/public/storefront/site', async (request) => {
    const tenantId = await resolveTenantId(request);
    if (!(await isModuleEnabled(tenantId, 'storefront'))) throw moduleDisabled('storefront');
    const snapshot = await publishService.getPublishedSnapshot({ tenantId });
    return ok(snapshot);
  });

  return Promise.resolve();
};

export default publicStorefrontRoutes;
