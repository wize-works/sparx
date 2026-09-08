'use client';

// DID WE MAKE MONEY — the headline surface of the module.
//
// It answers one question, so the answer is the biggest thing on the screen and
// everything else explains it. The order is the order an owner reads a P&L in:
// what came in, what the work itself cost, what was left (gross), what running
// the business cost, what you actually kept (net).
//
// A NEGATIVE MONTH HAS TO READ AS NEGATIVE. Not "smaller number, minus sign
// somewhere" — the figure itself goes red and says "you lost". This is the one
// screen where the reader may be about to find out something bad, and burying it
// in a monochrome table is the failure mode DESIGN.md RULE #4 exists to stop.
//
// EVERY LINE SAYS WHERE IT CAME FROM. Cost of goods and channel fees are read
// live from the commerce and inventory ledgers; wages and running costs come from
// the spend ledger here. Nothing on this screen is a number someone typed twice,
// and the labels say so, because "why doesn't this match my orders page" is the
// question that destroys trust in a report.
//
// THE COMPARISON IS AGAINST THE SAME SPAN BEFORE, derived server-side from the
// requested range — so comparing a fortnight compares it against the previous
// fortnight, not against "last month" in any case.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  NativeSelect,
  Progress,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { ArrowDownRight, ArrowUpRight, RefreshCw, TrendingUp } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { spendErrorMessage, useProfit, useRecomputeProfit, type ProfitFigures } from './spend-data';
import { PERIOD_OPTIONS, previousLabel, rangeFor, type PeriodKey } from './period';
import { ProfitChart } from './profit-chart';
import {
  changeRate,
  formatCents,
  formatCentsSigned,
  formatRate,
  kindColor,
  kindLabel,
} from './format';

/** Which way a movement points, and whether that is good news.
 *
 *  Direction and SENTIMENT are separate: revenue rising is good, costs rising is
 *  not, and a single "up is green" rule would congratulate someone on their fuel
 *  bill doubling. */
function movement(
  current: number,
  previous: number,
  risingIsGood: boolean
): { label: string; tone: 'success' | 'error' | 'neutral'; up: boolean } | null {
  const rate = changeRate(current, previous);
  if (rate === null || Math.abs(rate) < 0.005) return null;
  const up = rate > 0;
  return {
    label: `${up ? '+' : '−'}${Math.abs(rate * 100).toFixed(0)}%`,
    tone: up === risingIsGood ? 'success' : 'error',
    up,
  };
}

function Movement({
  current,
  previous,
  risingIsGood,
  period,
}: {
  current: number;
  previous: number;
  risingIsGood: boolean;
  period: PeriodKey;
}) {
  const change = movement(current, previous, risingIsGood);
  if (!change) {
    return <Text className="text-sm">About the same as {previousLabel(period)}</Text>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge color={change.tone} variant="soft" size="sm">
        {change.up ? (
          <ArrowUpRight className="size-3" aria-hidden />
        ) : (
          <ArrowDownRight className="size-3" aria-hidden />
        )}
        {change.label}
      </Badge>
      <Text as="span" className="text-sm">
        vs {previousLabel(period)}
      </Text>
    </span>
  );
}

/** One line of the P&L: what it is, where it came from, and how much. */
function Line({
  label,
  detail,
  cents,
  currency,
  share,
  color,
  emphasis,
}: {
  label: string;
  detail: string;
  cents: number;
  currency: string;
  /** Share of revenue, for the bar. Null when there is no revenue to divide by. */
  share: number | null;
  color: 'info' | 'warning' | 'module-chat' | 'neutral';
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text className={emphasis ? 'font-semibold' : 'font-medium'}>{label}</Text>
        <Text className={`tabular-nums ${emphasis ? 'text-lg font-semibold' : 'font-medium'}`}>
          {formatCents(cents, currency)}
        </Text>
      </div>
      <Progress
        color={color}
        value={share === null ? 0 : Math.min(Math.abs(share), 1) * 100}
        max={100}
        aria-label={`${label}: ${formatCents(cents, currency)}`}
      />
      <Text className="text-sm">{detail}</Text>
    </div>
  );
}

function shareOf(part: number, revenue: number): number | null {
  return revenue > 0 ? part / revenue : null;
}

/** True when the module has literally nothing to report — every input is zero.
 *  Distinct from "we made no profit": one is an empty ledger, the other is a
 *  measurement, and they must never share a screen. */
function isUntouched(figures: ProfitFigures): boolean {
  return (
    figures.revenueCents === 0 &&
    figures.cogsCents === 0 &&
    figures.feeCents === 0 &&
    figures.costOfSaleCents === 0 &&
    figures.laborCents === 0 &&
    figures.operatingCents === 0
  );
}

export function ProfitSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const range = useMemo(() => rangeFor(period), [period]);
  const recompute = useRecomputeProfit();

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useProfit({
    from: range.from,
    to: range.to,
    series: true,
  });

  const currency = 'USD';

  const rebuild = () => {
    recompute.mutate(range, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({
            title: 'Figures rebuilt',
            description: 'Every number here has been recalculated from your orders and costs.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not rebuild the figures',
          description: spendErrorMessage(error, 'The numbers shown are unchanged.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Profit controls"
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
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={recompute.isPending}
              onClick={rebuild}
            >
              <RefreshCw className="size-4" aria-hidden />
              Rebuild figures
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              onClick={() => {
                ctx.open('finance.jobs', {}, { target: 'tab' });
              }}
            >
              <TrendingUp className="size-4" aria-hidden />
              By job
            </Button>
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
            title="Could not work out your profit"
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
        ) : isUntouched(data.current) ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<TrendingUp className="size-6" aria-hidden />}
              title="Nothing to measure in this period"
              description="No money came in and no costs were recorded, so there is no profit figure to give you — which is not the same as breaking even. Record some spending, or pick a wider period."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    ctx.open('finance.spending', {}, { target: 'tab' });
                  }}
                >
                  Go to Spending
                </Button>
              }
            />
          </div>
        ) : (
          <ProfitBody
            current={data.current}
            previous={data.previous}
            series={data.series}
            period={period}
            currency={currency}
          />
        )}
      </div>
    </div>
  );
}

function ProfitBody({
  current,
  previous,
  series,
  period,
  currency,
}: {
  current: ProfitFigures;
  previous: ProfitFigures;
  series: { bucket: string; revenueCents: number; netProfitCents: number }[] | null;
  period: PeriodKey;
  currency: string;
}) {
  const revenue = current.revenueCents;
  const lost = current.netProfitCents < 0;
  const margin = revenue > 0 ? current.netProfitCents / revenue : null;

  // The direct cost of delivering the work: goods consumed, what a marketplace
  // kept, and the ledger's cost-of-sale categories. One number in the summary
  // because that is the gross-profit subtrahend, broken out in the lines below.
  const directCents = current.cogsCents + current.feeCents + current.costOfSaleCents;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {/* The answer. Color first, number second, explanation third. */}
      <Card className="p-5">
        <Text className="text-sm">{lost ? 'You lost' : 'You kept'}</Text>
        <Heading
          level={2}
          className={`mt-1 text-4xl font-semibold tabular-nums ${lost ? 'text-error' : 'text-success'}`}
        >
          {formatCentsSigned(current.netProfitCents, currency)}
        </Heading>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Movement
            current={current.netProfitCents}
            previous={previous.netProfitCents}
            risingIsGood
            period={period}
          />
          {margin !== null ? (
            <Badge color={lost ? 'danger' : 'success'} variant="soft" size="sm">
              {formatRate(margin)} of everything that came in
            </Badge>
          ) : null}
        </div>

        {lost ? (
          <Alert color="warning" className="mt-4">
            <AlertContent>
              <AlertTitle>This period cost more than it brought in</AlertTitle>
              <AlertDescription>
                The lines below show where it went. If the work itself was profitable, the answer is
                usually in running costs; if it was not, look at what each job actually made.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
      </Card>

      {series && series.length > 1 ? (
        <Card className="p-4">
          <ProfitChart points={series} currency={currency} />
        </Card>
      ) : null}

      {/* The working, in reading order. */}
      <Card className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="font-semibold">Money in</Text>
            <Text className="text-lg font-semibold tabular-nums">
              {formatCents(revenue, currency)}
            </Text>
          </div>
          <Progress color="success" value={100} max={100} aria-label="Money in" />
          <div className="flex flex-wrap items-center gap-3">
            <Text className="text-sm">
              Read straight from your orders and paid invoices — never typed in twice.
            </Text>
            <Movement
              current={revenue}
              previous={previous.revenueCents}
              risingIsGood
              period={period}
            />
          </div>
        </div>

        <div className="border-base-300 flex flex-col gap-5 border-t pt-5">
          <Line
            label="Cost of the goods"
            detail="What the stock you sold actually cost you, from your inventory records."
            cents={current.cogsCents}
            currency={currency}
            share={shareOf(current.cogsCents, revenue)}
            color="warning"
          />
          <Line
            label="Selling fees"
            detail="What a marketplace kept out of each sale. Card processing fees are not included — the platform does not capture them yet."
            cents={current.feeCents}
            currency={currency}
            share={shareOf(current.feeCents, revenue)}
            color="warning"
          />
          <Line
            label={kindLabel('cost_of_sale')}
            detail="Costs you recorded that only happened because you did the job — parts, materials, a subcontractor."
            cents={current.costOfSaleCents}
            currency={currency}
            share={shareOf(current.costOfSaleCents, revenue)}
            color={kindColor('cost_of_sale')}
          />
        </div>

        <div className="border-base-300 flex flex-col gap-1.5 border-t pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="font-semibold">What the work made</Text>
            <Text
              className={`text-lg font-semibold tabular-nums ${
                current.grossProfitCents < 0 ? 'text-error' : ''
              }`}
            >
              {formatCentsSigned(current.grossProfitCents, currency)}
            </Text>
          </div>
          <Text className="text-sm">
            Money in, less the {formatCents(directCents, currency)} it took to deliver it. Before
            wages and the cost of being open.
          </Text>
        </div>

        <div className="border-base-300 flex flex-col gap-5 border-t pt-5">
          <Line
            label={kindLabel('labor')}
            detail="What you paid people over this period. Once staff time is tracked against jobs, the part spent on a job will move above the line."
            cents={current.laborCents}
            currency={currency}
            share={shareOf(current.laborCents, revenue)}
            color={kindColor('labor')}
          />
          <Line
            label={kindLabel('operating')}
            detail="Rent, insurance, software, fuel, marketing — what it costs to be open whether or not you sell anything."
            cents={current.operatingCents}
            currency={currency}
            share={shareOf(current.operatingCents, revenue)}
            color={kindColor('operating')}
          />
        </div>

        <div className="border-base-300 flex flex-col gap-1.5 border-t pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="font-semibold">{lost ? 'What you lost' : 'What you kept'}</Text>
            <Text
              className={`text-xl font-semibold tabular-nums ${lost ? 'text-error' : 'text-success'}`}
            >
              {formatCentsSigned(current.netProfitCents, currency)}
            </Text>
          </div>
        </div>
      </Card>

      {current.unallocatedCents > 0 ? (
        <Card className="p-4">
          <Text className="font-medium">
            {formatCents(current.unallocatedCents, currency)} was not charged to any job
          </Text>
          <Text className="mt-1 text-sm">
            That is normal — rent and insurance belong to the business, not to one repair. But if a
            job&apos;s parts are sitting in here, that job will look more profitable than it was.
            Charging costs to jobs as you record them is what makes the job figures trustworthy.
          </Text>
        </Card>
      ) : null}

      <Text className="px-1 pb-2 text-sm">
        Figures are rebuilt nightly and whenever you press Rebuild. sparx is not accounting software
        — this is your operating picture, and your accountant&apos;s books stay the record.
      </Text>
    </div>
  );
}
