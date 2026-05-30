// analyticsService — engagement rollups from the append-only EmailEvent log.
//
// The overview powers the Email module's landing tiles + recent activity.
// Per-broadcast stats live on broadcastService.stats; per-automation rollups
// are here for the automations surface + MCP.

import { withTenant } from '@sparx/db';
import type { ServiceContext } from '../errors';

export interface EngagementCounts {
  accepted: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
}

export interface RecentEvent {
  type: string;
  recipient: string;
  occurredAt: string;
  broadcastId: string | null;
  automationKey: string | null;
}

export interface OverviewResult {
  days: number;
  counts: EngagementCounts;
  suppressedTotal: number;
  recent: RecentEvent[];
}

function emptyCounts(): EngagementCounts {
  return {
    accepted: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
    failed: 0,
  };
}

function applyGroups(
  counts: EngagementCounts,
  rows: { type: string; _count: { _all: number } }[]
): EngagementCounts {
  for (const r of rows) {
    if (r.type in counts) counts[r.type as keyof EngagementCounts] = r._count._all;
  }
  return counts;
}

export async function overview(ctx: ServiceContext, days = 30): Promise<OverviewResult> {
  const since = new Date(Date.now() - days * 86400 * 1000);
  return withTenant(ctx, async (tx) => {
    const [groups, suppressedTotal, recentRows] = await Promise.all([
      tx.emailEvent.groupBy({
        by: ['type'],
        where: { occurredAt: { gte: since } },
        _count: { _all: true },
      }),
      tx.emailSuppression.count(),
      tx.emailEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 15,
        select: {
          type: true,
          recipient: true,
          occurredAt: true,
          broadcastId: true,
          automationKey: true,
        },
      }),
    ]);

    return {
      days,
      counts: applyGroups(emptyCounts(), groups),
      suppressedTotal,
      recent: recentRows.map((r) => ({
        type: r.type,
        recipient: r.recipient,
        occurredAt: r.occurredAt.toISOString(),
        broadcastId: r.broadcastId,
        automationKey: r.automationKey,
      })),
    };
  });
}

export async function automationStats(
  ctx: ServiceContext,
  automationKey: string,
  days = 30
): Promise<EngagementCounts> {
  const since = new Date(Date.now() - days * 86400 * 1000);
  const groups = await withTenant(ctx, (tx) =>
    tx.emailEvent.groupBy({
      by: ['type'],
      where: { automationKey, occurredAt: { gte: since } },
      _count: { _all: true },
    })
  );
  return applyGroups(emptyCounts(), groups);
}
