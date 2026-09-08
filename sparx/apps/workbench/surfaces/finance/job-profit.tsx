'use client';

// BY JOB — which pieces of work actually made money.
//
// The Profit surface says whether the business made money. This says on WHAT,
// which is the only one of the two that changes behaviour: a shop that learns it
// loses on every warranty fit stops quoting them that way.
//
// WORST FIRST, BY DEFAULT. The losing jobs are the ones a decision can still be
// made about; the best month's best job is a nice fact and nothing more. Sorting
// by margin ascending puts the actionable end of the list where the eye lands.
//
// A LIST-PRICE MARGIN IS NOT A COLLECTED ONE, AND THE ROW SAYS SO. An order knows
// what it took. An appointment does not — scheduling stores no collected amount,
// so the best available figure is the service's price, which is an assumption
// about a discount that may have been given. Mixing the two silently would
// mislead exactly the person relying on the number, so every booking row is
// labelled and the summary counts them separately.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  NativeSelect,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useJobProfit, type JobProfit } from './spend-data';
import { PERIOD_OPTIONS, rangeFor, type PeriodKey } from './period';
import { formatCents, formatCentsSigned, formatDate, formatRate } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

const SORTS = [
  { value: 'margin_asc', label: 'Worst first' },
  { value: 'margin_desc', label: 'Best first' },
  { value: 'revenue_desc', label: 'Biggest' },
  { value: 'recent', label: 'Newest' },
] as const;

const TYPE_FILTERS = [
  { value: 'all', label: 'Everything' },
  { value: 'order', label: 'Orders' },
  { value: 'booking', label: 'Appointments' },
] as const;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function JobRow({
  job,
  onOpen,
}: {
  job: JobProfit;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const lost = job.marginCents < 0;
  const costCents = job.cogsCents + job.feeCents + job.allocatedCents;

  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(event);
      }}
    >
      <td className="max-w-56 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{job.label}</span>
          {job.revenueBasis === 'list_price' ? (
            <Badge color="warning" variant="soft" size="sm">
              List price
            </Badge>
          ) : null}
        </div>
        <div className="truncate text-sm">
          {[job.customerName, formatDate(job.occurredAt)].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td className="hidden text-right tabular-nums @lg:table-cell">
        {formatCents(job.revenueCents, job.currency)}
      </td>
      <td className="hidden text-right tabular-nums @2xl:table-cell">
        {formatCents(costCents, job.currency)}
      </td>
      <td className="text-right">
        <span className={`font-medium tabular-nums ${lost ? 'text-error' : 'text-success'}`}>
          {formatCentsSigned(job.marginCents, job.currency)}
        </span>
      </td>
      <td className="text-right">
        <Badge color={lost ? 'danger' : 'success'} variant="soft" size="sm">
          {formatRate(job.marginRate)}
        </Badge>
      </td>
    </tr>
  );
}

export function JobProfitSurface({ ctx }: { ctx: SurfaceContext }) {
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('margin_asc');
  const [type, setType] = useState<string>('all');

  const range = useMemo(() => rangeFor(period), [period]);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useJobProfit({
    from: range.from,
    to: range.to,
    sort,
    ...(type === 'all' ? {} : { types: [type as 'order' | 'booking'] }),
  });

  // Memoized rather than `data?.jobs ?? []`: the fallback literal is a NEW
  // array every render, which made the summary below recompute every time.
  const jobs = useMemo(() => data?.jobs ?? [], [data?.jobs]);

  const summary = useMemo(() => {
    let losing = 0;
    let losingCents = 0;
    let estimated = 0;
    for (const job of jobs) {
      if (job.marginCents < 0) {
        losing += 1;
        losingCents += job.marginCents;
      }
      if (job.revenueBasis === 'list_price') estimated += 1;
    }
    return { losing, losingCents, estimated };
  }, [jobs]);

  const open = (job: JobProfit, event: { shiftKey: boolean; altKey: boolean }) => {
    const surface = job.type === 'order' ? 'commerce.order.detail' : 'scheduling.bookings.detail';
    ctx.open(surface, { id: job.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Job profitability controls"
        controls={
          <>
            <NativeSelect
              size="sm"
              color="module"
              value={period}
              aria-label="Period"
              onChange={(event) => {
                setPeriod(event.target.value as PeriodKey);
              }}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              color="module"
              value={sort}
              aria-label="Order the list by"
              onChange={(event) => {
                setSort(event.target.value as (typeof SORTS)[number]['value']);
              }}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <Filter
              color="module"
              value={type}
              onValueChange={(next) => {
                setType(typeof next === 'string' ? next : 'all');
              }}
              showReset={false}
              aria-label="Filter by kind of work"
            >
              {TYPE_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<TrendingUp className="size-6" aria-hidden />}
            title="Could not work out what each job made"
            description="The server could not be reached. Nothing you have recorded is affected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : jobs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<TrendingUp className="size-6" aria-hidden />}
              title="No completed work in this period"
              description="Once orders are placed or appointments completed, each one appears here with what it made after the goods, the fees and any costs you charged to it. Try a wider period."
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {/* The headline is the BAD news, because that is the actionable half.
                A screen that led with "your best job made £400" would be a
                congratulation; this is a tool. */}
            <Card className="p-4">
              {summary.losing > 0 ? (
                <>
                  <Text className="text-sm">Work that cost more than it made</Text>
                  <Heading
                    level={2}
                    className="text-error mt-1 text-3xl font-semibold tabular-nums"
                  >
                    {formatCentsSigned(summary.losingCents)}
                  </Heading>
                  <Text className="mt-1 text-sm">
                    across {summary.losing === 1 ? '1 job' : `${String(summary.losing)} jobs`} in
                    this period — they are at the top of the list.
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-sm">Every job in this period made money</Text>
                  <Heading
                    level={2}
                    className="text-success mt-1 text-3xl font-semibold tabular-nums"
                  >
                    {jobs.length === 1 ? '1 job' : `${String(jobs.length)} jobs`}
                  </Heading>
                  <Text className="mt-1 text-sm">
                    Sort by Worst first to see which came closest to not.
                  </Text>
                </>
              )}
            </Card>

            {summary.estimated > 0 ? (
              <Card className="flex items-start gap-3 p-4">
                <AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1">
                  <Text className="font-medium">
                    {summary.estimated === 1
                      ? '1 row uses the list price'
                      : `${String(summary.estimated)} rows use the list price`}
                  </Text>
                  <Text className="text-sm">
                    An appointment records what the service is priced at, not what was actually
                    collected, so a discount you gave on the day is not reflected. Those rows are
                    marked. Orders show real money.
                  </Text>
                </div>
              </Card>
            ) : null}

            <Card className="overflow-hidden">
              <Table size="sm" hover>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th className="hidden text-right @lg:table-cell">Made</th>
                    <th className="hidden text-right @2xl:table-cell">Cost</th>
                    <th className="text-right">Kept</th>
                    <th className="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <JobRow
                      key={`${job.type}:${job.id}`}
                      job={job}
                      onOpen={(event) => {
                        open(job, event);
                      }}
                    />
                  ))}
                </tbody>
              </Table>
            </Card>

            <div className="flex flex-col gap-1 px-1 pb-2">
              <RowOpenHint what="a job to open it" />
              <Text className="text-sm">
                &ldquo;Cost&rdquo; is the goods consumed, what a marketplace kept, and any spending
                you charged to that job. Wages and running costs are not divided up here — they sit
                on the business as a whole until staff time is tracked against jobs.
              </Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
