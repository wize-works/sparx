// Bridge between Fastify auth context and @sparx/sitebuilder's ServiceContext.
//
// Every Site Builder service function takes `(ctx: ServiceContext, args)`. The
// REST transport wraps each handler with `requireSitebuilderModule(request)`
// (which also runs requireAuth) and `toSitebuilderContext(request)` to derive
// that ctx — keeping routes vanishingly thin (one service, many transports).

import type { FastifyRequest } from 'fastify';
import type { ServiceContext } from '@sparx/sitebuilder';
import { isModuleEnabled } from '@sparx/auth';
import { requireAuth } from '@sparx/api-core/auth';
import { moduleDisabled } from '@sparx/api-core/errors';

export function toSitebuilderContext(request: FastifyRequest): ServiceContext {
  const auth = requireAuth(request);
  return { tenantId: auth.tenantId, userId: auth.actorId };
}

/** Throws MODULE_DISABLED (→ 404 envelope) if the caller's tenant doesn't have
 *  the storefront module active. Pairs with requireAuth — call once per handler
 *  before any service call. */
export async function requireSitebuilderModule(request: FastifyRequest): Promise<void> {
  const auth = requireAuth(request);
  const enabled = await isModuleEnabled(auth.tenantId, 'storefront');
  if (!enabled) throw moduleDisabled('storefront');
}
