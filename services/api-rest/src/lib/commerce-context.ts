// Bridge between Fastify auth context and @sparx/commerce's ServiceContext.
//
// Mirrors crm-context.ts. Every Commerce service function takes
// `(ctx: ServiceContext, args)`; routes call `requireCommerceModule(request)`
// (which also runs requireAuth) and `toCommerceContext(request)` to derive
// that ctx — keeping the routes vanishingly thin per decision #7.

import type { FastifyRequest } from 'fastify';
import type { ServiceContext } from '@sparx/commerce';
import { isModuleEnabled } from '@sparx/auth';
import { requireAuth } from '@sparx/api-core/auth';
import { moduleDisabled } from '@sparx/api-core/errors';

export function toCommerceContext(request: FastifyRequest): ServiceContext {
  const auth = requireAuth(request);
  return { tenantId: auth.tenantId, userId: auth.actorId };
}

/** Throws MODULE_DISABLED (→ 404 envelope) if the caller's tenant doesn't
 *  have Commerce active. Pair with requireAuth — call it once per Commerce
 *  handler before any service call. */
export async function requireCommerceModule(request: FastifyRequest): Promise<void> {
  const auth = requireAuth(request);
  const enabled = await isModuleEnabled(auth.tenantId, 'commerce');
  if (!enabled) throw moduleDisabled('commerce');
}
