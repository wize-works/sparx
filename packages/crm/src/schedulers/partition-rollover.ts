// crm_activities partition rollover.
//
// crm_activities is RANGE-partitioned monthly. This function creates next
// month's partition if it doesn't already exist; safe to run daily (every
// run is a no-op once the partition is present for the current + next
// month). Old partitions are NOT dropped here — archival to cold storage
// is a separate path operators run manually.
//
// Uses raw SQL because Prisma doesn't model PostgreSQL partitions
// directly. The function is system-level (no tenant context) — partitions
// belong to the cluster, not to any one tenant.

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
    const tableName = `crm_activities_${start.getUTCFullYear()}_${(start.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
    const fromIso = start.toISOString().slice(0, 10);
    const toIso = end.toISOString().slice(0, 10);

    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${tableName} PARTITION OF crm_activities FOR VALUES FROM ('${fromIso}') TO ('${toIso}')`
    );
    ensured.push(tableName);
  }
  return { ensured };
}
