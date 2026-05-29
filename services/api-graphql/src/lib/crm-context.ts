// Bridge between Fastify auth context and @sparx/crm's ServiceContext.
//
// Mirrors services/api-rest/src/lib/crm-context.ts byte-for-byte — both
// transports need the same gate + service-context shape. Promoted to
// @sparx/api-core when a fourth transport appears; until then the
// duplication is the smallest correct thing (locked decision #7 is about
// one *service* layer, not one transport helper layer).

import type { FastifyRequest } from 'fastify';
import type { ServiceContext } from '@sparx/crm';
import { isModuleEnabled } from '@sparx/auth';
import { requireAuth } from '@sparx/api-core/auth';
import { moduleDisabled } from '@sparx/api-core/errors';

export function toCrmContext(request: FastifyRequest): ServiceContext {
  const auth = requireAuth(request);
  return { tenantId: auth.tenantId, userId: auth.actorId };
}

/** Throws MODULE_DISABLED (→ 404 envelope) if the caller's tenant doesn't
 *  have CRM active. Pairs with requireAuth — call it once per CRM resolver
 *  before any service call. */
export async function requireCrmModule(request: FastifyRequest): Promise<void> {
  const auth = requireAuth(request);
  const enabled = await isModuleEnabled(auth.tenantId, 'crm');
  if (!enabled) throw moduleDisabled('crm');
}
