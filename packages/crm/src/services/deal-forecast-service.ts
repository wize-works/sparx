// Deal forecast service.
//
// Computes weighted pipeline value by expected-close month. "Weighted" means
// each open deal contributes `value × probability` (probability is the
// per-deal override, or falls back to the stage's probability when the deal
// itself is at 0). Closed-won deals contribute full value to the month they
// closed in; closed-lost deals contribute nothing.
//
// Used by the Phase 3 forecast view AND the MCP `get_forecast` tool —
// returns the same shape so callers don't post-process per transport.

import { withTenant } from '@sparx/db';

import type { ServiceContext } from '../errors';

export interface ForecastBucket {
  month: string; // ISO yyyy-mm
  openValue: number; // sum of value × probability for open deals
  weightedValue: number; // openValue + closed-won full value
  closedWonValue: number;
  dealCount: number;
}

export interface ForecastResult {
  pipelineId: string | null;
  startMonth: string;
  endMonth: string;
  buckets: ForecastBucket[];
  totalWeighted: number;
}

export interface ForecastArgs {
  pipelineId?: string | null;
  /** Inclusive lower bound for the forecast window. Defaults to the
   *  current month. ISO date is fine. */
  startMonth?: string;
  /** Inclusive upper bound. Defaults to start + 6 months. */
  endMonth?: string;
}

export async function forecast(
  ctx: ServiceContext,
  args: ForecastArgs = {}
): Promise<ForecastResult> {
  const start = monthStart(args.startMonth ? new Date(args.startMonth) : new Date());
  const end = args.endMonth ? monthStart(new Date(args.endMonth)) : addMonths(start, 6);

  return withTenant(ctx, async (tx) => {
    // Pull every deal whose expected close OR actual close falls in the
    // window. Open deals contribute by expected close; closed-won deals
    // contribute by closed-at. Closed-lost contribute nothing.
    const winStart = start;
    const winEnd = addMonths(end, 1); // exclusive

    const deals = await tx.deal.findMany({
      where: {
        ...(args.pipelineId ? { pipelineId: args.pipelineId } : {}),
        deletedAt: null,
        OR: [
          { expectedCloseDate: { gte: winStart, lt: winEnd } },
          { closedAt: { gte: winStart, lt: winEnd } },
        ],
      },
      include: { stage: true },
    });

    const bucketByMonth = new Map<string, ForecastBucket>();
    for (let cursor = new Date(start); cursor < end; cursor = addMonths(cursor, 1)) {
      bucketByMonth.set(monthKey(cursor), {
        month: monthKey(cursor),
        openValue: 0,
        weightedValue: 0,
        closedWonValue: 0,
        dealCount: 0,
      });
    }
    // Always include the end month inclusively.
    bucketByMonth.set(monthKey(end), {
      month: monthKey(end),
      openValue: 0,
      weightedValue: 0,
      closedWonValue: 0,
      dealCount: 0,
    });

    for (const deal of deals) {
      const value = Number(deal.value);
      const dealProb = Number(deal.probability);
      const stageProb = Number(deal.stage.probability);
      const effectiveProb = dealProb > 0 ? dealProb : stageProb;
      const isClosedWon = deal.stage.stageType === 'won' && deal.closedAt;
      const isClosedLost = deal.stage.stageType === 'lost';
      if (isClosedLost) continue;

      const refDate = isClosedWon ? deal.closedAt! : deal.expectedCloseDate;
      if (!refDate) continue;
      const key = monthKey(monthStart(refDate));
      const bucket = bucketByMonth.get(key);
      if (!bucket) continue;

      bucket.dealCount += 1;
      if (isClosedWon) {
        bucket.closedWonValue += value;
        bucket.weightedValue += value;
      } else {
        const weighted = value * (effectiveProb / 100);
        bucket.openValue += weighted;
        bucket.weightedValue += weighted;
      }
    }

    const buckets = [...bucketByMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    const totalWeighted = buckets.reduce((acc, b) => acc + b.weightedValue, 0);

    return {
      pipelineId: args.pipelineId ?? null,
      startMonth: monthKey(start),
      endMonth: monthKey(end),
      buckets,
      totalWeighted: round2(totalWeighted),
    };
  });
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
