// Iterate CRM-active tenants.
//
// Locked decision #6 says disabled tenants get zero scheduled work. Every
// daily scheduler (automation triggers, overdue-task reminders, segment
// recompute) calls this to enumerate the tenants worth processing.
//
// Reads tenant.settings.modules.crm.enabled directly — the same source
// of truth requireModule() consults. tenants is RLS-free (it's the
// dispatch table) so we read with the default prisma client, no
// withTenant wrapper.

import { prisma } from '@sparx/db';

/** All tenants where `settings.modules.crm.enabled = true`. Status is
 *  filtered to 'active' so suspended/cancelled tenants don't get cycles. */
export async function listCrmActiveTenants(): Promise<{ id: string }[]> {
  return prisma.tenant.findMany({
    where: {
      status: 'active',
      settings: { path: ['modules', 'crm', 'enabled'], equals: true },
    },
    select: { id: true },
  });
}
