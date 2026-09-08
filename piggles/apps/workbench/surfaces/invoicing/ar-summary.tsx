'use client';

// The receivables band above the invoice list.
//
// An invoice list's real question is not "what invoices exist" — it's "how much
// am I owed, and how much of it is late". Answering that at the top means the
// operator gets it without reading a single row, and the list below becomes the
// drill-down rather than the whole story.
//
// It reads /v1/invoicing/aging rather than summing the rows on screen, which
// matters: the table shows one page, the aging report covers ALL open documents.
// Summing the visible page would quietly under-report the moment there are more
// than fifty invoices — a number that looks authoritative and is wrong.

import { useQuery } from '@wizeworks/query';
import {
  Card,
  Skeleton,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
} from '@wizeworks/silicaui-react';
import { api } from '../../lib/api/client';
import { formatMoneyCompact, type AgingReport } from './types';

/** Buckets past due — everything except `current`. */
function overdueTotals(report: AgingReport): { balance: number; count: number } {
  return report.buckets
    .filter((bucket) => bucket.key !== 'current')
    .reduce(
      (acc, bucket) => ({
        balance: acc.balance + bucket.balance,
        count: acc.count + bucket.count,
      }),
      { balance: 0, count: 0 }
    );
}

export function ArSummary() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoicing', 'aging'],
    queryFn: () => api.get<AgingReport>('/v1/invoicing/aging'),
    // Money owed doesn't change second to second, and this rides alongside the
    // list — refetching it on every focus would be noise.
    staleTime: 60_000,
  });

  // A failed summary must not take the list down with it. The list is the
  // load-bearing part; this band is an enhancement, so it simply disappears.
  if (error) return null;

  if (isLoading) {
    return (
      <Card className="shrink-0">
        <div className="flex gap-6 px-4 py-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </Card>
    );
  }

  if (!data || data.totalCount === 0) return null;

  const overdue = overdueTotals(data);
  const worst = [...data.buckets]
    .filter((bucket) => bucket.key !== 'current' && bucket.count > 0)
    .pop();

  return (
    // A card, not a bordered band. The receivables figures are a distinct thing
    // you read — not a strip of chrome attached to the toolbar — so they get
    // their own lifted surface on the pane rather than a hairline separating
    // them from it.
    <Card className="shrink-0">
      <Stats className="px-2 py-1">
        <Stat>
          <StatTitle>Outstanding</StatTitle>
          <StatValue className="text-2xl tabular-nums">
            {formatMoneyCompact(data.totalOutstanding)}
          </StatValue>
          <StatDesc>
            {data.totalCount === 1 ? '1 open invoice' : `${String(data.totalCount)} open invoices`}
          </StatDesc>
        </Stat>

        {overdue.count > 0 ? (
          <Stat>
            <StatTitle>Late</StatTitle>
            {/* The one figure allowed to shout. Everything else on this surface
              stays neutral so that this reads as urgent rather than decorative. */}
            <StatValue className="text-danger text-2xl tabular-nums">
              {formatMoneyCompact(overdue.balance)}
            </StatValue>
            <StatDesc>
              {overdue.count === 1 ? '1 invoice' : `${String(overdue.count)} invoices`}
              {worst ? ` · worst ${worst.label.toLowerCase()}` : ''}
            </StatDesc>
          </Stat>
        ) : (
          <Stat>
            <StatTitle>Late</StatTitle>
            <StatValue className="text-success text-2xl">None</StatValue>
            <StatDesc>Nothing has passed its deadline</StatDesc>
          </Stat>
        )}
      </Stats>
    </Card>
  );
}
