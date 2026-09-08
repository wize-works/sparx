'use client';

// REPORTS — how your bookings turned out, what people book you for most, and how
// often they don't show up.
//
// ── A reporting surface, not a list ──────────────────────────────────────
//
// Nothing here is created, opened or narrowed to a row. It answers three
// questions an owner asks about the diary — did people turn up, what is in
// demand, and how much came in — each with the headline large and the detail
// underneath. So it is KPI figures over two real charts in one capped, centred
// column, never a grid of rows.
//
// ── Every figure is worked out on the SERVER, over the whole window ───────
//
// Outcome counts, the no-show rate, revenue and the service ranking are sums
// across all of a tenant's bookings in the selected period — a server concern,
// with the window the only client input. Narrowing a report in the browser
// would answer a question about the rows that happened to load and present it
// as the whole picture.
//
// ── The charts are the app's dataviz stack, not a bespoke one ─────────────
//
// The outcome ring and the demand bars are ECharts via `@wizeworks/silicaui-
// charts` — the sanctioned wrapper that auto-themes axes, grid and tooltip to
// the live `--color-*` tokens and re-inits on a light/dark flip. Series colors
// are resolved off the DOM to concrete token values (a canvas can't read a CSS
// var), so every hue is a token — no hex anywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  Heading,
  NativeSelect,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Text,
} from '@wizeworks/silicaui-react';
import { Chart, type EChartsOption } from '@wizeworks/silicaui-charts';
import { BarChart3, CalendarClock } from 'lucide-react';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useModuleColor } from '../analytics/charts';
import {
  formatCount,
  formatHour,
  formatHours,
  formatMoney,
  isModuleDisabled,
  noShowTone,
  plural,
  rangeForDays,
  RANGE_PRESETS,
  useSchedulingReport,
  WEEKDAY_LABELS,
  type HourBucket,
  type SchedulingReportTotals,
  type TopService,
  type Utilisation,
  type WeekdayBucket,
} from './reports-data';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';

const NO_SHOW_INK: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/* ── Token colors off the DOM (canvas can't read a CSS var) ─────────────── */

/**
 * Resolve a set of `--color-*` custom properties to concrete values off a live
 * element, re-reading when the theme flips.
 *
 * A local copy of the analytics module's pattern rather than an import, because
 * that helper is not exported and this surface owns a DIFFERENT palette — the
 * outcome ring needs semantic hues (green completed, red no-show), not the
 * neutral module-led sequence the shared donut walks.
 */
function useTokenColorMap(tokens: readonly string[]): {
  ref: React.RefObject<HTMLDivElement | null>;
  map: Record<string, string>;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const key = tokens.join(',');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(el);
      const next: Record<string, string> = {};
      for (const token of tokens) {
        const value = cs.getPropertyValue(token).trim();
        if (value) next[token] = value;
      }
      setMap(next);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
    // `tokens` is a stable literal per call site; `key` guards the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ref, map };
}

/* ── The outcome ring ────────────────────────────────────────────────────── */

// Each booking outcome in a stable order, with the tone that carries its
// meaning. The order is fixed so a slice keeps its color even when another
// outcome has zero and drops out — semantic color, not position, is the point.
const OUTCOME_DEFS = [
  { key: 'completed', label: 'Turned up and finished', tone: 'success' },
  { key: 'confirmed', label: 'Confirmed, still to come', tone: 'info' },
  { key: 'inProgress', label: 'Happening now', tone: 'module' },
  { key: 'requested', label: 'Waiting for you to confirm', tone: 'warning' },
  { key: 'cancelled', label: 'Cancelled', tone: 'neutral' },
  { key: 'noShow', label: 'Did not turn up', tone: 'danger' },
] as const satisfies readonly {
  key: keyof SchedulingReportTotals;
  label: string;
  tone: string;
}[];

const TONE_TOKEN: Record<string, string> = {
  success: '--color-success',
  info: '--color-info',
  module: '--color-module',
  warning: '--color-warning',
  neutral: '--color-neutral',
  danger: '--color-danger',
};

// Legend dots as silica utilities from the SAME tokens the chart resolves, so
// dot and slice always match without an inline style.
const TONE_DOT: Record<string, string> = {
  success: 'bg-success',
  info: 'bg-info',
  module: 'bg-module',
  warning: 'bg-warning',
  neutral: 'bg-neutral',
  danger: 'bg-danger',
};

const OUTCOME_TOKENS = [...new Set(OUTCOME_DEFS.map((d) => TONE_TOKEN[d.tone]!))];

function OutcomeRing({ totals }: { totals: SchedulingReportTotals }) {
  const { ref, map } = useTokenColorMap(OUTCOME_TOKENS);

  const slices = OUTCOME_DEFS.map((def) => ({ ...def, value: totals[def.key] })).filter(
    (slice) => slice.value > 0
  );

  const resolved = slices.map((slice) => map[TONE_TOKEN[slice.tone]!]);
  // All-or-nothing: a partial color array would misalign hue to slice. Until
  // the first paint resolves every token, let ECharts theme it and re-render.
  const colorsReady = resolved.length > 0 && resolved.every(Boolean);

  const option = useMemo<EChartsOption>(
    () => ({
      ...(colorsReady ? { color: resolved as string[] } : {}),
      tooltip: {
        trigger: 'item',
        valueFormatter: (value: unknown) => formatCount(Number(value)),
      },
      series: [
        {
          type: 'pie',
          radius: ['64%', '92%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          data: slices.map((slice) => ({ name: slice.label, value: slice.value })),
        },
      ],
    }),
    [slices, resolved, colorsReady]
  );

  return (
    <div className="flex flex-wrap items-center gap-6" ref={ref}>
      <div className="relative size-44 shrink-0">
        {/* `size-44!` — the important modifier beats the Chart's inline default
            height, so the ring renders in the same square the centred total is
            positioned over. Height via a class, never an inline style. */}
        <Chart option={option} className="size-44!" aria-label="How bookings turned out" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-xl leading-none font-semibold tabular-nums">
            {formatCount(totals.all)}
          </span>
          <span className="text-sm leading-none">{totals.all === 1 ? 'booking' : 'bookings'}</span>
        </div>
      </div>
      <ul className="flex min-w-44 flex-1 flex-col gap-2.5">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2.5 text-sm">
            <span
              className={`size-2.5 shrink-0 rounded-full ${TONE_DOT[slice.tone]}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="w-10 shrink-0 text-right tabular-nums">
              {Math.round((slice.value / totals.all) * 100)}%
            </span>
            <span className="shrink-0 text-right font-semibold tabular-nums">
              {formatCount(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── The demand bars ─────────────────────────────────────────────────────── */

function TopServicesChart({ services }: { services: TopService[] }) {
  const { ref, color } = useModuleColor();

  // Horizontal bars so long service names stay readable on the axis. ECharts
  // draws a category axis bottom-to-top, so reverse the server's desc ranking
  // to put the most-booked service at the TOP.
  const ordered = useMemo(() => [...services].reverse(), [services]);

  const option = useMemo<EChartsOption>(
    () => ({
      ...(color ? { color: [color] } : {}),
      grid: { left: 4, right: 18, top: 6, bottom: 2, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', splitNumber: 3, minInterval: 1 },
      yAxis: {
        type: 'category',
        data: ordered.map((service) => service.name),
        axisTick: { show: false },
        // Truncate on the axis; the full name still shows in the tooltip.
        axisLabel: { width: 120, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: ordered.map((service) => service.count),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
        },
      ],
    }),
    [ordered, color]
  );

  // A few services in a tall canvas look sparse; a taller box earns its height
  // once the ranking is long. Both are literal classes with the important
  // modifier so they beat the Chart's inline default height.
  const height = services.length > 4 ? 'h-80! w-full' : 'h-56! w-full';

  return (
    <div ref={ref} className="w-full">
      <Chart option={option} className={height} aria-label="Most-booked services" />
    </div>
  );
}

/* ── How full the diary ran ──────────────────────────────────────────────── */

// Utilisation as a headline figure, not a gauge: one honest percentage carries
// "how full were you" better than a dial, and the module hue ties it to
// scheduling. The null case (no opening hours set) is handled by the caller —
// this only renders when there is a real ratio to show.
function UtilisationFigure({ utilisation }: { utilisation: Utilisation }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-module text-5xl leading-none font-semibold tabular-nums">
          {utilisation.pct}%
        </span>
        <span className="text-lg">of your open time was booked</span>
      </div>
      <Text className="text-sm">
        {formatHours(utilisation.bookedMinutes)} booked out of{' '}
        {formatHours(utilisation.availableMinutes)} of opening time in this period.
      </Text>
    </div>
  );
}

/* ── When the diary is busiest ───────────────────────────────────────────── */

// Vertical bars in the module hue for both breakdowns. A shared axis-shadow
// tooltip reads the count in words, and the y-axis is forced to whole numbers —
// you can't have half a booking.
function BusiestWeekdayChart({ buckets }: { buckets: WeekdayBucket[] }) {
  const { ref, color } = useModuleColor();

  const option = useMemo<EChartsOption>(
    () => ({
      ...(color ? { color: [color] } : {}),
      grid: { left: 4, right: 10, top: 8, bottom: 2, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: unknown) => formatCount(Number(value)),
      },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => WEEKDAY_LABELS[bucket.weekday]),
        axisTick: { show: false },
      },
      yAxis: { type: 'value', splitNumber: 3, minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: buckets.map((bucket) => bucket.count),
          barMaxWidth: 34,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [buckets, color]
  );

  return (
    <div ref={ref} className="w-full">
      <Chart option={option} className="h-56! w-full" aria-label="Bookings by day of the week" />
    </div>
  );
}

function BusiestHourChart({ buckets }: { buckets: HourBucket[] }) {
  const { ref, color } = useModuleColor();

  const option = useMemo<EChartsOption>(
    () => ({
      ...(color ? { color: [color] } : {}),
      grid: { left: 4, right: 10, top: 8, bottom: 2, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (value: unknown) => formatCount(Number(value)),
      },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => formatHour(bucket.hour)),
        axisTick: { show: false },
        // 24 labels won't fit — show roughly every third hour; the tooltip still
        // names the exact hour on hover.
        axisLabel: { interval: 2 },
      },
      yAxis: { type: 'value', splitNumber: 3, minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: buckets.map((bucket) => bucket.count),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [buckets, color]
  );

  return (
    <div ref={ref} className="w-full">
      <Chart option={option} className="h-56! w-full" aria-label="Bookings by time of day" />
    </div>
  );
}

/* ── Panels + KPIs ───────────────────────────────────────────────────────── */

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-base-300 bg-base-100 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-0.5">
        <Heading level={2} className="text-lg font-semibold">
          {title}
        </Heading>
        {description ? <Text className="text-sm">{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  totals,
  noShowRatePct,
  revenueCents,
  upcomingCount,
}: {
  totals: SchedulingReportTotals;
  noShowRatePct: number;
  revenueCents: number;
  upcomingCount: number;
}) {
  return (
    <section className="border-base-300 bg-base-100 rounded-lg border p-2">
      {/* Stacks to one column in a narrow docked pane, four across when the pane
          has room — @container, because the pane's width is its own. */}
      <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @md:grid-cols-2 @2xl:grid-cols-4">
        <Stat>
          <StatTitle>Bookings in this period</StatTitle>
          <StatValue className="text-2xl tabular-nums">{formatCount(totals.all)}</StatValue>
          <StatDesc>appointments that started in the window</StatDesc>
        </Stat>

        <Stat>
          <StatTitle>Didn&rsquo;t turn up</StatTitle>
          <StatValue className={`text-2xl tabular-nums ${NO_SHOW_INK[noShowTone(noShowRatePct)]}`}>
            {noShowRatePct}%
          </StatValue>
          <StatDesc>
            {totals.completed + totals.noShow === 0
              ? 'no finished bookings to measure yet'
              : `of ${plural(totals.completed + totals.noShow, 'finished booking', 'finished bookings')}`}
          </StatDesc>
        </Stat>

        <Stat>
          <StatTitle>Taken from completed</StatTitle>
          <StatValue className="text-2xl tabular-nums">{formatMoney(revenueCents)}</StatValue>
          <StatDesc>from bookings marked done in the window</StatDesc>
        </Stat>

        <Stat>
          <StatTitle>Still to come</StatTitle>
          <StatValue className="text-2xl tabular-nums">{formatCount(upcomingCount)}</StatValue>
          <StatDesc>on the books from now on, whenever booked</StatDesc>
        </Stat>
      </Stats>
    </section>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

export function SchedulingReportsSurface({ ctx: _ctx }: { ctx: SurfaceContext }) {
  const [rangeDays, setRangeDays] = useState(30);

  // Memoised on the preset alone: rangeForDays reads the clock, so recomputing
  // it every render would mint a fresh window each time and refetch forever.
  const range = useMemo(() => rangeForDays(rangeDays), [rangeDays]);
  const report = useSchedulingReport(range);

  const periodLabel =
    RANGE_PRESETS.find((preset) => preset.days === rangeDays)?.label.toLowerCase() ??
    'the selected period';

  const body = () => {
    // The scheduling module owns these figures, so an account without it has
    // nothing to show. Saying which module lights this up beats an empty error.
    if (isModuleDisabled(report.error)) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="Bookings aren&rsquo;t switched on"
          description="These reports appear once the scheduling module is enabled for this account. Turn it on to start taking appointments and see how the diary is doing."
        />
      );
    }

    if (report.isError) {
      return (
        <EmptyState
          icon={<BarChart3 className="size-6" aria-hidden />}
          title="Could not load your reports"
          description="This is a problem reaching the server. Your bookings are unaffected — the figures just could not be worked out just now."
          actions={
            <Button
              size="sm"
              color="module"
              onClick={() => {
                void report.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      );
    }

    if (report.isPending || !report.data) {
      return (
        <p className="p-4 text-sm" role="status">
          Working out your figures…
        </p>
      );
    }

    const {
      totals,
      noShowRatePct,
      revenueCents,
      upcomingCount,
      utilisation,
      byWeekday,
      byHour,
      topServices,
    } = report.data;
    const nothingEver = totals.all === 0 && upcomingCount === 0;
    // The histograms always carry all 7 / 24 buckets; an all-zero set means
    // nothing fell in the window, which reads as a message, not an empty chart.
    const hasBusiest = byWeekday.some((bucket) => bucket.count > 0);

    if (nothingEver) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="Nothing booked yet"
          description="These figures build from your bookings. As soon as appointments start coming in — from your site, over the phone, or added here — this fills in with how full the diary runs, what people book most, and how often they turn up."
        />
      );
    }

    const noneInWindow = totals.all === 0;

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            Booking reports
          </Heading>
          <Text>
            How your bookings turned out over {periodLabel}, what people book you for most, and how
            often they don&rsquo;t turn up.
          </Text>
        </div>

        {noneInWindow ? (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>No bookings fell in this period</AlertTitle>
              <AlertDescription>
                You have {plural(upcomingCount, 'appointment', 'appointments')} still to come. Widen
                the period at the top to take in earlier bookings.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <KpiCard
          totals={totals}
          noShowRatePct={noShowRatePct}
          revenueCents={revenueCents}
          upcomingCount={upcomingCount}
        />

        <div className="grid gap-4 @3xl:grid-cols-2">
          <Panel
            title="How full your diary ran"
            description="The share of your open time that bookings took up over the window — how busy the diary actually was."
          >
            {utilisation === null ? (
              <div className="flex flex-col gap-1">
                <Text className="text-base">
                  Set your opening hours to see how full your diary runs.
                </Text>
                <Text className="text-sm">
                  Once you tell us when you&rsquo;re open for bookings, this shows how much of that
                  time gets taken up — there&rsquo;s nothing to measure against until then.
                </Text>
              </div>
            ) : (
              <UtilisationFigure utilisation={utilisation} />
            )}
          </Panel>

          <Panel
            title="How bookings turned out"
            description="Every booking in the window, split by where it ended up — done, still to come, cancelled, or a no-show."
          >
            {totals.all === 0 ? (
              <Text className="text-sm">No bookings in this period to break down.</Text>
            ) : (
              <OutcomeRing totals={totals} />
            )}
          </Panel>
        </div>

        <div className="grid gap-4 @3xl:grid-cols-2">
          <Panel
            title="Your busiest days"
            description="Which days of the week fill up most — where your bookings land across the week."
          >
            {hasBusiest ? (
              <BusiestWeekdayChart buckets={byWeekday} />
            ) : (
              <Text className="text-sm">No bookings in this period to chart.</Text>
            )}
          </Panel>

          <Panel
            title="Your busiest times"
            description="Which times of day fill up most — hover a bar for the exact hour."
          >
            {hasBusiest ? (
              <BusiestHourChart buckets={byHour} />
            ) : (
              <Text className="text-sm">No bookings in this period to chart.</Text>
            )}
          </Panel>
        </div>

        <Panel
          title="What people book you for most"
          description="The services with the most bookings in the window — what your time is going on."
        >
          {topServices.length === 0 ? (
            <Text className="text-sm">No bookings in this period to rank.</Text>
          ) : (
            <TopServicesChart services={topServices} />
          )}
        </Panel>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Report controls"
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="Reporting period"
              value={String(rangeDays)}
              onChange={(event) => {
                setRangeDays(Number(event.target.value));
              }}
            >
              {RANGE_PRESETS.map((preset) => (
                <option key={preset.days} value={preset.days}>
                  {preset.label}
                </option>
              ))}
            </NativeSelect>
            {/* ALWAYS the last child of a toolbar. No primary action here, so it
            carries the ml-auto that pushes the right-hand group over. */}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={report.isFetching}
            updatedAt={report.data ? report.dataUpdatedAt : undefined}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
