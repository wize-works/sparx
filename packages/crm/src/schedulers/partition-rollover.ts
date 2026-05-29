// crm_activities partition rollover.
//
// crm_activities is RANGE-partitioned monthly. This function creates next
// month's partition if it doesn't already exist; safe to run daily (every
// run is a no-op once the partition is present for the current + next
// month). Old partitions are NOT dropped here — archival to cold storage
// is a separate path operators run manually.
//
// sparx_app (the app role prisma connects as) cannot CREATE TABLE in the
// public schema, so we route through ensure_crm_activities_partition() —
// a SECURITY DEFINER function defined in migration 20260603100000.

import { prisma } from '@sparx/db';

export interface PartitionRolloverResult {
  ensured: string[];
}

/** Idempotent — calling twice the same day creates partitions only the
 *  first time. Lookahead is configurable; default rolls the current month
 *  + next month forward so a missed run still has buffer. */
export async function ensureCrmActivitiesPartitions(
  lookaheadMonths = 2
): Promise<PartitionRolloverResult> {
  const ensured: string[] = [];
  const now = new Date();
  for (let i = 0; i < lookaheadMonths; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
    const fromIso = start.toISOString().slice(0, 10);
    const toIso = end.toISOString().slice(0, 10);

    const rows = await prisma.$queryRaw<{ ensure_crm_activities_partition: string }[]>`
      SELECT ensure_crm_activities_partition(${fromIso}::date, ${toIso}::date)
    `;
    const name = rows[0]?.ensure_crm_activities_partition;
    if (name) ensured.push(name);
  }
  return { ensured };
}
