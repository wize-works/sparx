'use client';

// Profitability — what you paid your suppliers against what your customers paid
// you, product by product and supplier by supplier.
//
// The whole reason to open this is one question: "am I actually making money on
// what I dropship, after the supplier takes their cut?" So the headline is the
// PROFIT and the MARGIN, the day-by-day chart is drawn as profit, and the
// per-supplier table is sorted by who makes you the most. A supplier losing you
// money is not a neutral fact, so the margin is colored.
//
// Timeliness lives here too, because a supplier that is cheap but always late
// costs you in refunds and lost customers — the SLA report answers "and do they
// actually ship it". Only settled orders (submitted/shipped/delivered) count, so
// a basket that never became a real supplier order never distorts the figures.
//
// The chart is drawn from layout utilities with heights quantised to literal
// Tailwind classes — no inline style, no charting dependency to draw a row of
// bars (see sites/traffic.tsx and commerce/reports.tsx).

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Select,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Text,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { BarChart3, LineChart, ServerCrash } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  RANGE_LABEL,
  dropshipErrorMessage,
  formatCents,
  formatCentsRounded,
  presetRange,
  useDropshipAnalytics,
  useOrdersTimeseries,
  useSupplierSla,
  type AnalyticsSupplierRow,
  type RangePreset,
  type SlaRow,
  type TimeseriesPoint,
  type Tone,
} from './dropship-data';

const NUMBER = new Intl.NumberFormat();

// Bar heights as literal classes rather than an inline style (see reports.tsx):
// quantising to 5% steps makes the set finite, so Tailwind emits every one.
const BAR_HEIGHT = [
  'h-px',
  'h-[5%]',
  'h-[10%]',
  'h-[15%]',
  'h-[20%]',
  'h-[25%]',
  'h-[30%]',
  'h-[35%]',
  'h-[40%]',
  'h-[45%]',
  'h-[50%]',
  'h-[55%]',
  'h-[60%]',
  'h-[65%]',
  'h-[70%]',
  'h-[75%]',
  'h-[80%]',
  'h-[85%]',
  'h-[90%]',
  'h-[95%]',
  'h-full',
];

/** A margin's tone in the owner's terms: losing money is danger, thin is a
 *  warning, healthy is success. */
function marginTone(marginPct: number, profitCents: number): Tone {
  if (profitCents <= 0) return 'danger';
  if (marginPct < 15) return 'warning';
  return 'success';
}

function ProfitBars({ points }: { points: TimeseriesPoint[] }) {
  const peak = Math.max(1, ...points.map((p) => Math.abs(p.profitCents)));
  return (
    <div className="flex h-20 items-end gap-0.5" role="img" aria-label="Profit each day">
      {points.map((point) => {
        const label = new Date(point.bucket).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        });
        const step =
          point.profitCents === 0 ? 0 : Math.round((Math.abs(point.profitCents) / peak) * 20);
        const losing = point.profitCents < 0;
        return (
          <Tooltip
            key={point.bucket}
            delay={100}
            content={`${label} · ${formatCents(point.profitCents)} profit · ${
              point.ordersCount === 1 ? '1 order' : `${String(point.ordersCount)} orders`
            }`}
          >
            <div
              className={`flex-1 rounded-sm ${losing ? 'bg-error' : 'bg-module'} ${BAR_HEIGHT[step] ?? 'h-px'}`}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

function SupplierProfitRow({ row }: { row: AnalyticsSupplierRow }) {
  const tone = marginTone(row.marginPct, row.profitCents);
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0">
      <span className="min-w-0 flex-1 font-medium">{row.supplierName}</span>
      <Text as="span" className="shrink-0 text-sm">
        {row.orders === 1 ? '1 order' : `${NUMBER.format(row.orders)} orders`}
      </Text>
      <Text as="span" className="shrink-0 text-sm tabular-nums">
        {formatCents(row.costCents)} cost
      </Text>
      <Text as="span" className="shrink-0 text-sm font-medium tabular-nums">
        {formatCents(row.profitCents)}
      </Text>
      <Badge color={tone} variant="soft" size="sm">
        {row.profitCents <= 0 ? 'Losing money' : `${String(row.marginPct)}% margin`}
      </Badge>
    </div>
  );
}

/** Hours as a human span — "6h", "1d 4h" — for the SLA figures. */
function hoursLabel(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${String(Math.round(hours))}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours - days * 24);
  return rem > 0 ? `${String(days)}d ${String(rem)}h` : `${String(days)}d`;
}

function SlaRowView({ row }: { row: SlaRow }) {
  const onTime = row.onTimeRate === null ? null : Math.round(row.onTimeRate * 100);
  const fulfil = Math.round(row.fulfillmentRate * 100);
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0">
      <span className="min-w-0 flex-1 font-medium">{row.supplierName}</span>
      <Text as="span" className="shrink-0 text-sm">
        {row.routedOrders === 1 ? '1 order' : `${NUMBER.format(row.routedOrders)} orders`}
      </Text>
      <Text as="span" className="shrink-0 text-sm tabular-nums">
        Ships in {hoursLabel(row.avgShipHours)}
      </Text>
      {row.failedOrders > 0 ? (
        <Badge color="danger" variant="soft" size="sm">
          {row.failedOrders} failed
        </Badge>
      ) : null}
      <Badge
        color={
          onTime === null
            ? 'neutral'
            : onTime >= 90
              ? 'success'
              : onTime >= 70
                ? 'warning'
                : 'danger'
        }
        variant="soft"
        size="sm"
      >
        {onTime === null ? `${String(fulfil)}% shipped` : `${String(onTime)}% on time`}
      </Badge>
    </div>
  );
}

export function DropshipProfitabilitySurface({ ctx: _ctx }: { ctx: SurfaceContext }) {
  const [preset, setPreset] = useState<RangePreset>('30');
  const range = useMemo(() => presetRange(preset), [preset]);

  const analytics = useDropshipAnalytics(range);
  const series = useOrdersTimeseries(range);
  const sla = useSupplierSla(range);

  const isFetching = analytics.isFetching || series.isFetching || sla.isFetching;
  const refetchAll = () => {
    void analytics.refetch();
    void series.refetch();
    void sla.refetch();
  };

  const data = analytics.data;
  const hasOrders = (data?.totalOrders ?? 0) > 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Profitability controls"
        controls={
          <>
            <BarChart3 className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              Profitability
            </Heading>
            <div className="ml-auto w-36">
              <Select
                size="sm"
                color="module"
                aria-label="Time period"
                value={preset}
                items={{
                  '7': RANGE_LABEL['7'],
                  '30': RANGE_LABEL['30'],
                  '90': RANGE_LABEL['90'],
                }}
                onValueChange={(next) => {
                  setPreset((next as RangePreset) || '30');
                }}
              />
            </div>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? analytics.dataUpdatedAt : undefined}
            onRefresh={refetchAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {analytics.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load profitability"
              description={dropshipErrorMessage(
                analytics.error,
                'This is a problem reaching the server. Try again in a moment.'
              )}
              actions={
                <Button size="sm" color="module" onClick={refetchAll}>
                  Try again
                </Button>
              }
            />
          ) : analytics.isPending || !data ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  {RANGE_LABEL[preset]}
                </Heading>
                <Text className="text-sm">
                  Cost is what your suppliers charged you; revenue is what customers paid for those
                  items. Only orders that reached a supplier are counted.
                </Text>
              </div>

              {!hasOrders ? (
                <EmptyState
                  icon={<LineChart className="size-6" aria-hidden />}
                  title="No dropship sales in this period"
                  description="Once customers buy products your suppliers ship, this fills with your profit, your margin, and how each supplier is doing. Try a longer period above, or check back after your next sale."
                />
              ) : (
                <>
                  <Stats className="w-full">
                    <Stat>
                      <StatTitle>Profit</StatTitle>
                      <StatValue>{formatCentsRounded(data.profitCents)}</StatValue>
                      <StatDesc>revenue minus supplier cost</StatDesc>
                    </Stat>
                    <Stat>
                      <StatTitle>Margin</StatTitle>
                      <StatValue>{String(data.marginPct)}%</StatValue>
                      <StatDesc>of every dollar you keep</StatDesc>
                    </Stat>
                    <Stat>
                      <StatTitle>Orders</StatTitle>
                      <StatValue>{NUMBER.format(data.totalOrders)}</StatValue>
                      <StatDesc>routed to a supplier</StatDesc>
                    </Stat>
                  </Stats>

                  <div className="grid gap-2 @md:grid-cols-2">
                    <div className="card bg-base-100 flex flex-col gap-0.5 p-4">
                      <Text className="text-sm">What customers paid</Text>
                      <Text as="span" className="text-lg font-semibold tabular-nums">
                        {formatCents(data.revenueCents)}
                      </Text>
                    </div>
                    <div className="card bg-base-100 flex flex-col gap-0.5 p-4">
                      <Text className="text-sm">What suppliers charged you</Text>
                      <Text as="span" className="text-lg font-semibold tabular-nums">
                        {formatCents(data.costCents)}
                      </Text>
                    </div>
                  </div>

                  <FormSection title="Profit day by day">
                    {series.data && series.data.points.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <ProfitBars points={series.data.points} />
                        <Text className="text-sm">
                          One bar per day, tallest being the most profit. A red bar is a day you
                          lost money. Hover a bar for its date and figures.
                        </Text>
                      </div>
                    ) : (
                      <Text className="text-sm" role="status">
                        {series.isPending ? 'Loading…' : 'No day-by-day figures for this period.'}
                      </Text>
                    )}
                  </FormSection>

                  <FormSection
                    title="By supplier"
                    description="Who makes you the most, and who is costing you money."
                  >
                    {data.bySupplier.length === 0 ? (
                      <Text className="text-sm">
                        No supplier had a settled order in this period.
                      </Text>
                    ) : (
                      <div className="flex flex-col">
                        {data.bySupplier.map((row) => (
                          <SupplierProfitRow key={row.supplierId} row={row} />
                        ))}
                      </div>
                    )}
                  </FormSection>

                  <FormSection
                    title="How quickly suppliers ship"
                    description={
                      sla.data
                        ? `On time means delivered within ${String(sla.data.onTimeDeliveryDays)} days of being sent.`
                        : 'How reliably each supplier ships and delivers what you route to them.'
                    }
                  >
                    {sla.isPending ? (
                      <Text className="text-sm" role="status">
                        Loading…
                      </Text>
                    ) : !sla.data || sla.data.bySupplier.length === 0 ? (
                      <Text className="text-sm">
                        No shipping figures yet — they appear once suppliers start shipping the
                        orders routed to them.
                      </Text>
                    ) : (
                      <div className="flex flex-col">
                        {sla.data.bySupplier.map((row) => (
                          <SlaRowView key={row.supplierId} row={row} />
                        ))}
                      </div>
                    )}
                  </FormSection>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
