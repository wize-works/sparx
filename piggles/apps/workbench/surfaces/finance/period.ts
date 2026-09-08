'use client';

// The period picker's vocabulary, shared by every spend surface.
//
// Four surfaces ask "over what window?" — Spending, Profit, Job profitability
// and the accounting export — and they have to agree, because a person reads the
// profit figure for "this month" and then opens the spending list expecting the
// same month. Defining the ranges once is what makes that true; four local
// copies of "start of month" is how one of them ends up off by a day.
//
// Ranges are calendar-boundary DATES (YYYY-MM-DD), not instants. The server
// filters `incurredAt` — the day a cost belongs to — so a range that carried a
// local clock time would move the boundary for anyone east of UTC.

export type PeriodKey =
  'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'last_12' | 'all';

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_12', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export interface DateRange {
  from: string;
  to: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Local Y/M/D as a UTC-midnight Date, so `iso()` prints the day the person is
 *  actually looking at rather than yesterday for anyone west of UTC. */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function rangeFor(period: PeriodKey, now = new Date()): DateRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const today = utcDay(year, month, day);

  switch (period) {
    case 'last_month': {
      // Day 0 of this month IS the last day of the previous one, which also
      // sidesteps every month-length special case.
      return { from: iso(utcDay(year, month - 1, 1)), to: iso(utcDay(year, month, 0)) };
    }
    case 'this_quarter': {
      const quarterStart = Math.floor(month / 3) * 3;
      return { from: iso(utcDay(year, quarterStart, 1)), to: iso(today) };
    }
    case 'this_year':
      return { from: iso(utcDay(year, 0, 1)), to: iso(today) };
    case 'last_12':
      return { from: iso(utcDay(year - 1, month, 1)), to: iso(today) };
    case 'all':
      // Not an empty range: the API requires both ends on the profit route, and
      // a fixed floor keeps the query planner on an index. Nothing in this
      // platform has data before it.
      return { from: '2000-01-01', to: iso(today) };
    case 'this_month':
    default:
      return { from: iso(utcDay(year, month, 1)), to: iso(today) };
  }
}

/** What the comparison on the Profit surface is comparing AGAINST, in words. The
 *  server derives the previous span from the requested one; this only names it. */
export function previousLabel(period: PeriodKey): string {
  switch (period) {
    case 'last_month':
      return 'the month before';
    case 'this_quarter':
      return 'last quarter';
    case 'this_year':
      return 'last year';
    case 'last_12':
      return 'the 12 months before';
    case 'all':
      return 'the same span before';
    case 'this_month':
    default:
      return 'last month';
  }
}
