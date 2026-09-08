'use client';

// Reports — how selling is going, read-only.
//
// Everything here is computed live from real orders by api-rest; nothing is
// mocked. Four things, in the order a shop owner asks them: how much came in,
// how that moved day by day, what sold best, and where the sales came from.
// When there are simply no orders in the chosen window, the surface says so
// plainly rather than drawing an empty chart — an honest blank beats a fake one.
//
// The day-by-day chart is drawn from layout utilities, not a charting library:
// one series, no axes, heights quantised to a finite set of Tailwind classes so
// there is no inline style. Pulling in a chart dependency to draw a row of
// rectangles would be the tail wagging the dog (see sites/traffic.tsx).

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
import { ConversionFunnelReport } from './conversion-funnel';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  RANGE_LABEL,
  channelLabel,
  formatCents,
  formatCentsRounded,
  presetRange,
  reportsErrorMessage,
  useChannelBreakdown,
  useConversionFunnel,
  useRevenueSummary,
  useRevenueTimeseries,
  useTopProducts,
  type RangePreset,
  type RevenuePoint,
} from './reports-data';

const NUMBER = new Intl.NumberFormat();

// Bar heights as literal classes rather than an inline style (see the note in
// sites/traffic.tsx): quantising to 5% steps makes the set finite, so Tailwind
// can see and emit every one.
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

function RevenueBars({ points, currency }: { points: RevenuePoint[]; currency: string }) {
  const peak = Math.max(1, ...points.map((p) => p.grossCents));
  return (
    <div className="flex h-20 items-end gap-0.5" role="img" aria-label="Sales each day">
      {points.map((point) => {
        const label = new Date(point.bucket).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        });
        const step = point.grossCents <= 0 ? 0 : Math.round((point.grossCents / peak) * 20);
        return (
          <Tooltip
            key={point.bucket}
            delay={100}
            content={`${label} · ${formatCents(point.grossCents, currency)} · ${
              point.ordersCount === 1 ? '1 order' : `${String(point.ordersCount)} orders`
            }`}
          >
            <div className={`bg-module flex-1 rounded-sm ${BAR_HEIGHT[step] ?? 'h-px'}`} />
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ReportsSurface({ ctx: _ctx }: { ctx: SurfaceContext }) {
  const [preset, setPreset] = useState<RangePreset>('30');
  const range = useMemo(() => presetRange(preset), [preset]);

  const summary = useRevenueSummary(range);
  const series = useRevenueTimeseries(range);
  const products = useTopProducts(range);
  const channels = useChannelBreakdown(range);
  const funnel = useConversionFunnel(range);

  const isFetching =
    summary.isFetching || series.isFetching || products.isFetching || channels.isFetching;

  const refetchAll = () => {
    void summary.refetch();
    void series.refetch();
    void products.refetch();
    void channels.refetch();
  };

  const data = summary.data;
  const currency = data?.currency ?? 'USD';
  const hasSales = (data?.ordersCount ?? 0) > 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Reports controls"
        controls={
          <>
            <BarChart3 className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              Reports
            </Heading>
            <div className="ml-auto w-36">
              <Select
                size="sm"
                color="module"
                aria-label="Time period"
                value={preset}
                items={[
                  { value: '7', label: RANGE_LABEL['7'] },
                  { value: '30', label: RANGE_LABEL['30'] },
                  { value: '90', label: RANGE_LABEL['90'] },
                ]}
                onValueChange={(next) => {
                  setPreset((next as RangePreset) ?? '30');
                }}
              />
            </div>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? summary.dataUpdatedAt : undefined}
            onRefresh={refetchAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {summary.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load your reports"
              description={reportsErrorMessage(
                summary.error,
                'This is a problem reaching the server. Try again in a moment.'
              )}
              actions={
                <Button size="sm" color="module" onClick={refetchAll}>
                  Try again
                </Button>
              }
            />
          ) : summary.isPending || !data ? (
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
                  Figures cover {data.rangeLabel}. Money is what customers paid, after any refunds.
                </Text>
              </div>

              {!hasSales ? (
                <EmptyState
                  icon={<LineChart className="size-6" aria-hidden />}
                  title="No sales in this period"
                  description="Once orders come in, this fills with your revenue, your best sellers, and where the sales came from. Try a longer period above, or check back after your next sale."
                />
              ) : (
                <>
                  <Stats className="w-full">
                    <Stat>
                      <StatTitle>Revenue</StatTitle>
                      <StatValue>{formatCentsRounded(data.netRevenueCents, currency)}</StatValue>
                      <StatDesc>after refunds</StatDesc>
                    </Stat>
                    <Stat>
                      <StatTitle>Orders</StatTitle>
                      <StatValue>{NUMBER.format(data.ordersCount)}</StatValue>
                      <StatDesc>placed in this period</StatDesc>
                    </Stat>
                    <Stat>
                      <StatTitle>Average order</StatTitle>
                      <StatValue>{formatCents(data.averageOrderValueCents, currency)}</StatValue>
                      <StatDesc>spent per order</StatDesc>
                    </Stat>
                  </Stats>

                  {data.refundedCents > 0 ? (
                    <Text className="text-sm">
                      {formatCents(data.refundedCents, currency)} was refunded in this period,
                      already taken off the revenue above.
                    </Text>
                  ) : null}

                  <FormSection title="Sales day by day">
                    {series.data && series.data.points.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <RevenueBars points={series.data.points} currency={currency} />
                        <Text className="text-sm">
                          One bar per day, tallest being the busiest. Hover a bar for its date and
                          takings.
                        </Text>
                      </div>
                    ) : (
                      <Text className="text-sm" role="status">
                        {series.isPending ? 'Loading…' : 'No day-by-day figures for this period.'}
                      </Text>
                    )}
                  </FormSection>

                  <FormSection
                    title="Best sellers"
                    description="Your top products by revenue in this period."
                  >
                    {products.isPending ? (
                      <Text className="text-sm" role="status">
                        Loading…
                      </Text>
                    ) : (products.data ?? []).length === 0 ? (
                      <Text className="text-sm">No products sold in this period yet.</Text>
                    ) : (
                      <div className="flex flex-col">
                        {(products.data ?? []).map((product) => (
                          <div
                            key={product.productId}
                            className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0"
                          >
                            <span className="min-w-0 flex-1 font-medium">
                              {product.productTitle}
                            </span>
                            <Text as="span" className="shrink-0 text-sm tabular-nums">
                              {product.unitsSold === 1
                                ? '1 sold'
                                : `${NUMBER.format(product.unitsSold)} sold`}
                            </Text>
                            <Text as="span" className="shrink-0 text-sm font-medium tabular-nums">
                              {formatCents(product.revenueCents, currency)}
                            </Text>
                          </div>
                        ))}
                      </div>
                    )}
                  </FormSection>

                  <FormSection
                    title="How many visits became orders"
                    description="Where people stop between arriving and buying. A step with nothing to compare against says so rather than showing 0%."
                  >
                    {funnel.isPending ? (
                      <Text className="text-sm" role="status">
                        Loading…
                      </Text>
                    ) : funnel.data ? (
                      <ConversionFunnelReport funnel={funnel.data} />
                    ) : (
                      <Text className="text-sm">
                        This could not be worked out just now. Nothing about your orders has
                        changed.
                      </Text>
                    )}
                  </FormSection>

                  <FormSection
                    title="Where sales came from"
                    description="Your revenue split by how the order was placed."
                  >
                    {channels.isPending ? (
                      <Text className="text-sm" role="status">
                        Loading…
                      </Text>
                    ) : (channels.data?.byChannel ?? []).length === 0 ? (
                      <Text className="text-sm">No sales to break down in this period.</Text>
                    ) : (
                      <div className="flex flex-col">
                        {(channels.data?.byChannel ?? []).map((row) => (
                          <div
                            key={row.channel}
                            className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0"
                          >
                            <span className="min-w-0 flex-1 font-medium">
                              {channelLabel(row.channel)}
                            </span>
                            <Badge color="neutral" variant="soft" size="sm">
                              {row.sharePct}%
                            </Badge>
                            <Text as="span" className="shrink-0 text-sm tabular-nums">
                              {row.orders === 1 ? '1 order' : `${NUMBER.format(row.orders)} orders`}
                            </Text>
                            <Text as="span" className="shrink-0 text-sm font-medium tabular-nums">
                              {formatCents(row.revenueCents, currency)}
                            </Text>
                          </div>
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
