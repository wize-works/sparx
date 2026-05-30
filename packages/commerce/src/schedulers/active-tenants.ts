// Iterate Commerce-active tenants.
//
// Mirrors @sparx/crm's listCrmActiveTenants — the same module-gate rule
// applies here: disabled tenants do zero scheduled work. The reservation
// reaper (and any future inventory scheduler) calls this to enumerate
// tenants worth processing.

import { prisma } from '@sparx/db';

/** All tenants where `settings.modules.commerce.enabled = true`. Status
 *  is filtered to 'active' so suspended/cancelled tenants don't get
 *  cycles. */
export async function listCommerceActiveTenants(): Promise<{ id: string }[]> {
  return prisma.tenant.findMany({
    where: {
      status: 'active',
      settings: { path: ['modules', 'commerce', 'enabled'], equals: true },
    },
    select: { id: true },
  });
}
