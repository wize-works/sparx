// Bridge between Fastify auth context and @sparx/crm's ServiceContext.
//
// Every CRM service function takes `(ctx: ServiceContext, args)`. The REST
// transport wraps each handler with `requireCrmModule(request)` (which also
// runs requireAuth) and `toCrmContext(request)` to derive that ctx — keeping
// the routes vanishingly thin per decision #7 (one service, three transports).

import type { FastifyRequest } from 'fastify';
import type { ServiceContext } from '@sparx/crm';
import { isModuleEnabled } from '@sparx/auth';
import { requireAuth } from '../plugins/auth.js';
import { moduleDisabled } from '../errors.js';

export function toCrmContext(request: FastifyRequest): ServiceContext {
  const auth = requireAuth(request);
  return { tenantId: auth.tenantId, userId: auth.actorId };
}

/** Throws MODULE_DISABLED (→ 404 envelope) if the caller's tenant doesn't
 *  have CRM active. Pairs with requireAuth — call it once per CRM handler
 *  before any service call. */
export async function requireCrmModule(request: FastifyRequest): Promise<void> {
  const auth = requireAuth(request);
  const enabled = await isModuleEnabled(auth.tenantId, 'crm');
  if (!enabled) throw moduleDisabled('crm');
}
