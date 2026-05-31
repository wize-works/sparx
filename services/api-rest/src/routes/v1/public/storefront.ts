// Public storefront read surface — the published Site Builder snapshot the
// storefront renders.
//
//   GET /v1/public/storefront/site ?tenant=<slug>
//     → { themeKey, appearancePolicy, compiledTokens: {light,dark},
//         sections: [...], layout: [...] } or null when nothing is published.
//
// Tenant is resolved from ?tenant=<slug> (the storefront hostname upstream);
// the storefront module must be enabled. Read-only and unauthenticated. Serves
// the PUBLISHED snapshot by default; with a valid site-preview token it serves
// the DRAFT composition so the dashboard's preview iframe shows unsaved work.

import type { FastifyPluginAsync } from 'fastify';
import { isModuleEnabled } from '@sparx/auth';
import { publishService } from '@sparx/sitebuilder';
import { ok } from '@sparx/api-core/envelope';
import { moduleDisabled } from '@sparx/api-core/errors';
import { resolveTenantId } from '../../../lib/public-commerce-context.js';
import { tryVerifySitePreview } from '../../../lib/preview.js';

const publicStorefrontRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/public/storefront/site', async (request) => {
    const tenantId = await resolveTenantId(request);
    if (!(await isModuleEnabled(tenantId, 'storefront'))) throw moduleDisabled('storefront');
    // With a valid `Authorization: Preview <site-preview jwt>` (minted by the
    // dashboard for its own tenant) serve the DRAFT composition; otherwise the
    // published snapshot. An invalid/expired token throws — it is NOT silently
    // downgraded to published (that masking was the original "doesn't apply" bug).
    const preview = tryVerifySitePreview(app, request, tenantId);
    const snapshot = preview
      ? await publishService.getDraftSnapshot({ tenantId })
      : await publishService.getPublishedSnapshot({ tenantId });
    return ok(snapshot);
  });

  return Promise.resolve();
};

export default publicStorefrontRoutes;
