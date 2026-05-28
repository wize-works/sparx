// CRM reporting service — the report queries that back the dashboard
// reports page and the MCP get_crm_metrics tool.
//
// For now these are live queries against the source tables. A nightly
// rollup into crm_metrics_daily (docs/11 Phase 6) is a follow-up — the
// query shape stays the same so swapping the data source later is a
// one-place change.

import { withTenant } from '@sparx/db';

import type { ServiceContext } from '../errors';

export interface PipelineFunnelBucket {
  stageId: string;
  stageName: string;
  stageType: string;
  count: number;
  totalValue: number;
}

export interface WinLossRow {
  repId: string | null;
  won: number;
  lost: number;
  open: number;
  winRate: number; // won / (won + lost), 0–1
  totalWonValue: number;
}

export interface RepPerformanceRow {
  repId: string;
  dealsOpened: number;
  dealsWon: number;
  revenue: number;
  tasksCompleted: number;
  quotesSent: number;
  quotesAccepted: number;
}

export interface AcquisitionPoint {
  month: string; // yyyy-mm
  newCustomers: number;
}

/** Pipeline funnel — deal counts + summed value per stage for one pipeline. */
export async function pipelineFunnel(
  ctx: ServiceContext,
  pipelineId: string
): Promise<PipelineFunnelBucket[]> {
  return withTenant(ctx, async (tx) => {
    const stages = await tx.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { sortOrder: 'asc' },
    });
    const buckets: PipelineFunnelBucket[] = [];
    for (const stage of stages) {
      const deals = await tx.deal.findMany({
        where: { pipelineId, stageId: stage.id, deletedAt: null },
        select: { value: true },
      });
      buckets.push({
        stageId: stage.id,
        stageName: stage.name,
        stageType: stage.stageType,
        count: deals.length,
        totalValue: deals.reduce((s, d) => s + Number(d.value), 0),
      });
    }
    return buckets;
  });
}

/** Win/loss aggregated by assigned rep. Open deals included so reps see
 *  pipeline alongside closed history. */
export async function winLossByRep(
  ctx: ServiceContext,
  args: { since?: Date; pipelineId?: string } = {}
): Promise<WinLossRow[]> {
  return withTenant(ctx, async (tx) => {
    const deals = await tx.deal.findMany({
      where: {
        deletedAt: null,
        ...(args.pipelineId ? { pipelineId: args.pipelineId } : {}),
        ...(args.since ? { updatedAt: { gte: args.since } } : {}),
      },
      include: { stage: true },
    });

    const byRep = new Map<string | null, WinLossRow>();
    for (const d of deals) {
      const rep = d.assignedRepId;
      const row =
        byRep.get(rep) ??
        ({
          repId: rep,
          won: 0,
          lost: 0,
          open: 0,
          winRate: 0,
          totalWonValue: 0,
        } satisfies WinLossRow);
      if (d.stage.stageType === 'won') {
        row.won += 1;
        row.totalWonValue += Number(d.value);
      } else if (d.stage.stageType === 'lost') {
        row.lost += 1;
      } else {
        row.open += 1;
      }
      byRep.set(rep, row);
    }
    return [...byRep.values()].map((r) => ({
      ...r,
      winRate: r.won + r.lost > 0 ? r.won / (r.won + r.lost) : 0,
    }));
  });
}

/** Customer acquisition by month — count of customers created in each
 *  bucket over the trailing window. */
export async function acquisitionByMonth(
  ctx: ServiceContext,
  args: { months?: number } = {}
): Promise<AcquisitionPoint[]> {
  const months = Math.min(args.months ?? 12, 36);
  const horizon = new Date();
  horizon.setUTCMonth(horizon.getUTCMonth() - months);
  horizon.setUTCDate(1);

  return withTenant(ctx, async (tx) => {
    const customers = await tx.customer.findMany({
      where: { deletedAt: null, createdAt: { gte: horizon } },
      select: { createdAt: true },
    });
    const counts = new Map<string, number>();
    for (let i = 0; i <= months; i++) {
      const d = new Date(horizon.getTime());
      d.setUTCMonth(d.getUTCMonth() + i);
      counts.set(monthKey(d), 0);
    }
    for (const c of customers) {
      const key = monthKey(c.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([month, newCustomers]) => ({ month, newCustomers }))
      .sort((a, b) => a.month.localeCompare(b.month));
  });
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

/** Overall CRM metrics snapshot for the reports landing page. */
export async function tenantSnapshot(ctx: ServiceContext): Promise<{
  customers: number;
  b2bAccounts: number;
  openDeals: number;
  pipelineValue: number;
  openTasks: number;
  overdueTasks: number;
  activeSegments: number;
}> {
  return withTenant(ctx, async (tx) => {
    const now = new Date();
    const [
      customers,
      b2bAccounts,
      openDeals,
      openDealsValue,
      openTasks,
      overdueTasks,
      activeSegments,
    ] = await Promise.all([
      tx.customer.count({ where: { deletedAt: null } }),
      tx.b2BAccount.count({ where: { deletedAt: null } }),
      tx.deal.count({ where: { deletedAt: null, closedAt: null } }),
      tx.deal.aggregate({
        where: { deletedAt: null, closedAt: null },
        _sum: { value: true },
      }),
      tx.task.count({ where: { status: 'open' } }),
      tx.task.count({ where: { status: 'open', dueAt: { not: null, lt: now } } }),
      tx.segment.count({ where: { archivedAt: null } }),
    ]);

    return {
      customers,
      b2bAccounts,
      openDeals,
      pipelineValue: Number(openDealsValue._sum.value ?? 0),
      openTasks,
      overdueTasks,
      activeSegments,
    };
  });
}
