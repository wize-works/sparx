'use client';

// HOW YOUR STOCK IS PERFORMING — the five figures a business is asked for and
// could not previously get out of sparx (docs/146 Phase 10.1).
//
//   How much of it sold          sell-through
//   What it earned               GMROI
//   Could you ship it            fill rate
//   How often you ran out        stock-out frequency
//   Where it all went            movement summary
//
// ── Why these five are one surface and not five ──────────────────────────
//
// They are the same question asked five ways: is the money in this stock
// working. Split across five screens nobody would ever put the answers next to
// each other, and next to each other is where they mean something — a line with
// 95% sell-through and a GMROI of 0.4 is selling briskly at a price that does
// not pay, and neither number says that alone.
//
// ── Every figure here can refuse to answer ───────────────────────────────
//
// Each report carries a count of what it could NOT measure, and this screen
// renders those counts as sentences rather than hiding them. A fill rate of
// 100% over four measured lines out of nine hundred is not a fill rate, and the
// only way to stop somebody reading it as one is to say so on the same card.
//
// ── The chart is a bar and the bar is Tailwind ───────────────────────────
//
// One series, no axes. A charting dependency to draw six rectangles would be the
// tail wagging the dog, and the widths are literal classes so the compiler can
// see them (an inline `style` is banned).

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
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { BarChart3, Download, TrendingUp } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, useStockLocations } from './data';
import { RANGE_PRESETS, rangeForDays } from './reports-data';
import {
  fillRateTone,
  fillRateVerdict,
  formatCount,
  formatDaysOut,
  formatPercent,
  formatRatio,
  gmroiTone,
  gmroiVerdict,
  movementGroupTone,
  movementReasonLabel,
  reportCsvPath,
  sellThroughTone,
  sellThroughVerdict,
  useReport,
  type FillRateReport,
  type GmroiReport,
  type MovementSummaryReport,
  type ReportFilters,
  type SellThroughReport,
  type StockoutFrequencyReport,
} from './reporting-data';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';

/** Quantised to 5% steps so every width is a LITERAL class the compiler sees. */
const BAR_WIDTH = [
  'w-px',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
];

function barWidthClass(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return BAR_WIDTH[0]!;
  return BAR_WIDTH[Math.round(Math.min(1, fraction) * 20)] ?? BAR_WIDTH[BAR_WIDTH.length - 1]!;
}

const BAR_FILL: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-base-300',
  'module-inventory': 'bg-module',
  'module-crm': 'bg-module-crm',
};

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The one download control, repeated per card. A link rather than a fetch: the
 *  browser's own download handling beats anything built here and survives a
 *  large file. */
function ExportButton({ reportKey, filters }: { reportKey: string; filters: ReportFilters }) {
  return (
    <Button
      color="neutral"
      variant="outline"
      size="sm"
      // A real anchor, so right-click → save and open-in-new-tab both work. The
      // label lives INSIDE it rather than as Button children: silica merges them
      // either way, and an empty <a /> is an accessibility failure the linter is
      // right to flag even when the runtime output is fine.
      render={
        <a href={reportCsvPath(reportKey, filters)} download>
          <Download className="size-4" aria-hidden />
          Spreadsheet
        </a>
      }
    />
  );
}

/** The "we could not measure this" band. Its own component because it appears on
 *  four of the five cards and must read identically each time — a gap described
 *  two ways is a gap somebody argues about. */
function GapNote({ children }: { children: React.ReactNode }) {
  return (
    <Alert color="warning">
      <AlertContent>
        <AlertTitle>What these figures leave out</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

/* ── Sell-through ────────────────────────────────────────────────────────── */

function SellThroughCard({
  report,
  filters,
  onOpen,
}: {
  report: SellThroughReport;
  filters: ReportFilters;
  onOpen: (variantId: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const pct = report.totals.sellThroughPct;
  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading level={2} className="text-lg font-semibold">
            How much of it sold
          </Heading>
          <Text className="text-sm">
            Of everything you had available over the period, the share that actually sold. Low means
            you bought too much; very high means you ran out and lost sales you never saw.
          </Text>
        </div>
        <ExportButton reportKey="sell_through" filters={filters} />
      </div>

      <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">{formatPercent(pct)}</Text>
          <Badge color={sellThroughTone(pct)} variant="soft" size="sm" className="mt-1 self-start">
            {sellThroughVerdict(pct)}
          </Badge>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">
            {formatCount(report.totals.unitsSold)}
          </Text>
          <Text className="text-sm">Units sold</Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">
            {formatCount(report.totals.unitsOnHandAtEnd)}
          </Text>
          <Text className="text-sm">Still on the shelf at the end</Text>
        </div>
      </div>

      {report.rows.length > 0 ? (
        <Table size="sm" hover>
          <thead>
            <tr>
              <th>Item</th>
              <th className="hidden @lg:table-cell">Where</th>
              <th className="text-right">Sold</th>
              <th className="hidden text-right @md:table-cell">Left</th>
              <th className="text-right whitespace-nowrap">Sold through</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.slice(0, 15).map((row) => (
              <tr
                key={`${row.variantId}:${row.warehouseId}`}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  onOpen(row.variantId, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onOpen(row.variantId, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{row.title}</span>
                    <span className="truncate font-mono text-sm">{row.sku}</span>
                  </span>
                </td>
                <td className="hidden max-w-32 truncate @lg:table-cell">{row.warehouseCode}</td>
                <td className="text-right tabular-nums">{formatCount(row.unitsSold)}</td>
                <td className="hidden text-right tabular-nums @md:table-cell">
                  {formatCount(row.unitsOnHandAtEnd)}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Badge color={sellThroughTone(row.sellThroughPct)} variant="soft" size="sm">
                    {formatPercent(row.sellThroughPct)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {report.inactiveLines > 0 ? (
        <Text className="text-sm">
          {plural(report.inactiveLines, 'line', 'lines')} neither sold nor held stock in this
          period, so there is no sell-through to work out for them.
        </Text>
      ) : null}
    </section>
  );
}

/* ── GMROI ───────────────────────────────────────────────────────────────── */

function GmroiCard({
  report,
  filters,
  onOpen,
}: {
  report: GmroiReport;
  filters: ReportFilters;
  onOpen: (variantId: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const value = report.totals.gmroi;
  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading level={2} className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="size-4" aria-hidden />
            What your stock earned
          </Heading>
          <Text className="text-sm">
            For every pound tied up in stock, how much profit it brought back. One means it paid for
            the money it tied up and nothing more; three is what a healthy line looks like.
          </Text>
        </div>
        <ExportButton reportKey="gmroi" filters={filters} />
      </div>

      <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">{formatRatio(value)}</Text>
          <Badge color={gmroiTone(value)} variant="soft" size="sm" className="mt-1 self-start">
            {gmroiVerdict(value)}
          </Badge>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">
            {formatCents(report.totals.grossMarginCents, report.currency)}
          </Text>
          <Text className="text-sm">
            Profit on what sold ({formatPercent(report.totals.grossMarginPct)})
          </Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">
            {formatCents(report.totals.avgInventoryCostCents, report.currency)}
          </Text>
          <Text className="text-sm">
            Average money tied up
            {report.averageFromDailyRollup ? '' : ' — today’s figure, standing in'}
          </Text>
        </div>
      </div>

      {report.rows.length > 0 ? (
        <Table size="sm" hover>
          <thead>
            <tr>
              <th>Item</th>
              <th className="hidden text-right @md:table-cell">Sold</th>
              <th className="text-right whitespace-nowrap">Profit</th>
              <th className="hidden text-right @lg:table-cell">Margin</th>
              <th className="text-right">Earned per £</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.slice(0, 15).map((row) => (
              <tr
                key={row.variantId}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  onOpen(row.variantId, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onOpen(row.variantId, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{row.title}</span>
                    <span className="truncate font-mono text-sm">{row.sku}</span>
                  </span>
                </td>
                <td className="hidden text-right tabular-nums @md:table-cell">
                  {formatCount(row.unitsSold)}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">
                  {formatCents(row.grossMarginCents, report.currency)}
                </td>
                <td className="hidden text-right tabular-nums @lg:table-cell">
                  {formatPercent(row.grossMarginPct)}
                </td>
                <td className="text-right">
                  <Badge color={gmroiTone(row.gmroi)} variant="soft" size="sm">
                    {formatRatio(row.gmroi)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {report.uncostedUnits > 0 || report.unattributedUnits > 0 ? (
        <GapNote>
          {report.uncostedUnits > 0 ? (
            <>
              {plural(report.uncostedUnits, 'unit', 'units')} sold with no cost recorded, so the
              profit above is FLATTERED by however much they cost.{' '}
            </>
          ) : null}
          {report.unattributedUnits > 0 ? (
            <>
              {plural(report.unattributedUnits, 'unit', 'units')} sold through a channel whose order
              lines sparx never saw, so their sales are missing from the figures.
            </>
          ) : null}
        </GapNote>
      ) : null}
    </section>
  );
}

/* ── Fill rate ───────────────────────────────────────────────────────────── */

function FillRateCard({
  report,
  filters,
  onOpen,
}: {
  report: FillRateReport;
  filters: ReportFilters;
  onOpen: (variantId: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading level={2} className="text-lg font-semibold">
            Could you ship it
          </Heading>
          <Text className="text-sm">
            The share of order lines you could fill from the shelf the moment the order came in. One
            short line spoils a whole delivery, which is why it is counted by line as well as by
            unit.
          </Text>
        </div>
        <ExportButton reportKey="fill_rate" filters={filters} />
      </div>

      {report.lineFillRatePct === null ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>Nothing to measure yet</AlertTitle>
            <AlertDescription>
              No order line in this period has a record of whether it could be filled. This figure
              starts working once orders run through your stock.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
          <div className="flex flex-col">
            <Text className="text-2xl font-semibold tabular-nums">
              {formatPercent(report.lineFillRatePct)}
            </Text>
            <Badge
              color={fillRateTone(report.lineFillRatePct)}
              variant="soft"
              size="sm"
              className="mt-1 self-start"
            >
              {fillRateVerdict(report.lineFillRatePct)}
            </Badge>
          </div>
          <div className="flex flex-col">
            <Text className="text-2xl font-semibold tabular-nums">
              {formatPercent(report.unitFillRatePct)}
            </Text>
            <Text className="text-sm">Of the units ordered, shipped from stock</Text>
          </div>
          <div className="flex flex-col">
            <Text className="text-danger text-2xl font-semibold tabular-nums">
              {formatCount(report.linesShort)}
            </Text>
            <Text className="text-sm">
              Lines you were short on, out of {formatCount(report.linesMeasured)}
            </Text>
          </div>
        </div>
      )}

      {report.worstVariants.length > 0 ? (
        <div className="border-base-300 flex flex-col gap-2 border-t pt-3">
          <Text className="font-medium">The lines you keep running out of</Text>
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Times short</th>
                <th className="hidden text-right @md:table-cell">Units short</th>
                <th className="text-right">Filled</th>
              </tr>
            </thead>
            <tbody>
              {report.worstVariants.slice(0, 10).map((row) => (
                <tr
                  key={row.variantId}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    onOpen(row.variantId, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onOpen(row.variantId, event);
                  }}
                >
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{row.title}</span>
                      <span className="truncate font-mono text-sm">{row.sku}</span>
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatCount(row.linesShort)}</td>
                  <td className="hidden text-right tabular-nums @md:table-cell">
                    {formatCount(row.unitsShort)}
                  </td>
                  <td className="text-right">
                    <Badge color={fillRateTone(row.lineFillRatePct)} variant="soft" size="sm">
                      {formatPercent(row.lineFillRatePct)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {report.unmeasuredLines > 0 ? (
        <GapNote>
          {plural(report.unmeasuredLines, 'order line', 'order lines')} carried no record of whether
          they could be filled, so they are left out of the figures above rather than counted as
          successes.
        </GapNote>
      ) : null}
    </section>
  );
}

/* ── Stock-outs ──────────────────────────────────────────────────────────── */

function StockoutCard({
  report,
  filters,
  onOpen,
}: {
  report: StockoutFrequencyReport;
  filters: ReportFilters;
  onOpen: (variantId: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  if (report.rows.length === 0 && report.unmeasuredLines === 0) {
    return (
      <Alert color="success" variant="soft">
        <AlertContent>
          <AlertTitle>Nothing ran out</AlertTitle>
          <AlertDescription>
            Every line stayed in stock for the whole period. That is the version of this report you
            want to see.
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  const worstDays = Math.max(1, ...report.rows.map((row) => row.daysOut));

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading level={2} className="text-lg font-semibold">
            How often you ran out
          </Heading>
          <Text className="text-sm">
            A run at zero counts once however long it lasted, so forty short gaps and one long one
            read differently — the first is a re-ordering rhythm problem, the second a buying one.
          </Text>
        </div>
        <ExportButton reportKey="stockout_frequency" filters={filters} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col">
          <Text className="text-warning text-2xl font-semibold tabular-nums">
            {formatCount(report.linesAffected)}
          </Text>
          <Text className="text-sm">Lines that ran out at least once</Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">
            {formatCount(report.totalEpisodes)}
          </Text>
          <Text className="text-sm">Times out of stock in total</Text>
        </div>
      </div>

      {report.rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {report.rows.slice(0, 12).map((row) => (
            <li key={`${row.variantId}:${row.warehouseId}`} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 truncate text-left font-medium"
                  onClick={(event) => {
                    onOpen(row.variantId, event);
                  }}
                >
                  {row.title}
                  <span className="ml-2 font-mono text-sm">{row.sku}</span>
                </button>
                <Text className="text-sm whitespace-nowrap tabular-nums">
                  {formatDaysOut(row.daysOut)} out over{' '}
                  {plural(row.episodeCount, 'spell', 'spells')}
                  {row.currentlyOut ? ' · still out' : ''}
                </Text>
              </div>
              <div className="bg-base-200 h-2 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${
                    row.currentlyOut ? BAR_FILL.danger : BAR_FILL.warning
                  } ${barWidthClass(row.daysOut / worstDays)}`}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {report.unmeasuredLines > 0 ? (
        <GapNote>
          {plural(report.unmeasuredLines, 'line', 'lines')} have no stock history to read, so
          nothing can be said about whether they ran out.
        </GapNote>
      ) : null}
    </section>
  );
}

/* ── Where it all went ───────────────────────────────────────────────────── */

function MovementSummaryCard({
  report,
  filters,
}: {
  report: MovementSummaryReport;
  filters: ReportFilters;
}) {
  const peak = Math.max(1, ...report.rows.map((row) => Math.max(row.unitsIn, row.unitsOut)));

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading level={2} className="text-lg font-semibold">
            Where it all went
          </Heading>
          <Text className="text-sm">
            Every movement in the period, grouped by why it happened. This is the one report whose
            parts add up to your stock exactly, which is what makes it the one to reconcile against.
          </Text>
        </div>
        <ExportButton reportKey="movement_summary" filters={filters} />
      </div>

      {report.rows.length === 0 ? (
        <Text className="text-sm">Nothing moved in this period.</Text>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <Text className="text-info text-2xl font-semibold tabular-nums">
                {formatCount(report.totalUnitsIn)}
              </Text>
              <Text className="text-sm">Units in</Text>
            </div>
            <div className="flex flex-col">
              <Text className="text-2xl font-semibold tabular-nums">
                {formatCount(report.totalUnitsOut)}
              </Text>
              <Text className="text-sm">Units out</Text>
            </div>
            <div className="flex flex-col">
              <Text
                className={`text-2xl font-semibold tabular-nums ${
                  report.netUnits < 0 ? 'text-warning' : 'text-success'
                }`}
              >
                {report.netUnits > 0 ? '+' : ''}
                {formatCount(report.netUnits)}
              </Text>
              <Text className="text-sm">Net change</Text>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {report.rows.map((row) => {
              const tone = movementGroupTone(row.group);
              const units = Math.max(row.unitsIn, row.unitsOut);
              return (
                <li key={row.reason} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Text className="flex items-center gap-2 font-medium">
                      <Badge color={tone} variant="soft" size="sm">
                        {movementReasonLabel(row.reason)}
                      </Badge>
                    </Text>
                    <Text className="text-sm tabular-nums">
                      {row.unitsIn > 0 ? `+${formatCount(row.unitsIn)}` : ''}
                      {row.unitsIn > 0 && row.unitsOut > 0 ? ' · ' : ''}
                      {row.unitsOut > 0 ? `−${formatCount(row.unitsOut)}` : ''}
                      {' · '}
                      {plural(row.movements, 'movement', 'movements')}
                      {row.costCents === null
                        ? ''
                        : ` · ${formatCents(Math.abs(row.costCents), report.currency)}`}
                    </Text>
                  </div>
                  <div className="bg-base-200 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full ${BAR_FILL[tone] ?? BAR_FILL.neutral} ${barWidthClass(
                        units / peak
                      )}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {report.uncostedMovements > 0 ? (
            <Text className="text-sm">
              {plural(report.uncostedMovements, 'movement', 'movements')} carry no cost, so the
              money column is blank for them rather than zero.
            </Text>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

export function PerformanceReportsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [rangeDays, setRangeDays] = useState(90);
  const [locationId, setLocationId] = useState('');

  // Memoised on the inputs alone: `rangeForDays` reads the clock, so recomputing
  // every render would mint a fresh query key each time and refetch forever.
  const range = useMemo(() => rangeForDays(rangeDays), [rangeDays]);
  const filters: ReportFilters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      ...(locationId ? { warehouseId: locationId } : {}),
    }),
    [range, locationId]
  );

  const sellThrough = useReport<SellThroughReport>('sell_through', filters);
  const gmroi = useReport<GmroiReport>('gmroi', filters);
  const fillRate = useReport<FillRateReport>('fill_rate', filters);
  const stockouts = useReport<StockoutFrequencyReport>('stockout_frequency', filters);
  const movements = useReport<MovementSummaryReport>('movement_summary', filters);

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);

  const openItem = (variantId: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.stock.item', { variantId }, { target: targetFor(event) });
  };

  const refreshAll = () => {
    void sellThrough.refetch();
    void gmroi.refetch();
    void fillRate.refetch();
    void stockouts.refetch();
    void movements.refetch();
  };

  const anyFetching =
    sellThrough.isFetching ||
    gmroi.isFetching ||
    fillRate.isFetching ||
    stockouts.isFetching ||
    movements.isFetching;

  const body = () => {
    // Sell-through is the spine: if it cannot load, the screen is a reporting
    // failure rather than a set of empty cards implying nothing sells.
    if (sellThrough.isError) {
      return (
        <EmptyState
          icon={<BarChart3 className="size-6" aria-hidden />}
          title="Could not work out your figures"
          description="This is a problem reaching the server. Your stock and its history are unaffected — the figures just could not be worked out just now."
        />
      );
    }
    if (!sellThrough.data) {
      return (
        <p className="p-4 text-sm" role="status">
          Working out your figures…
        </p>
      );
    }

    const st = sellThrough.data.data;
    const nothingHappened =
      st.totals.unitsSold === 0 && st.totals.unitsOnHandAtEnd === 0 && st.rows.length === 0;
    if (nothingHappened) {
      return (
        <EmptyState
          icon={<TrendingUp className="size-6" aria-hidden />}
          title="Nothing to measure yet"
          description="These figures appear once you have stock on a shelf and orders going through it. Book in a delivery and record a sale, and every number on this screen starts working."
        />
      );
    }

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            How your stock is performing
          </Heading>
          <Text>
            Five ways of asking the same question: is the money in this stock working. Over the last{' '}
            {plural(st.periodDays, 'day', 'days')}.
          </Text>
        </div>

        <Card className="shrink-0">
          <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @2xl:grid-cols-3">
            <Stat>
              <StatTitle>Sold through</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatPercent(st.totals.sellThroughPct)}
              </StatValue>
              <StatDesc>{sellThroughVerdict(st.totals.sellThroughPct)}</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Earned per pound of stock</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {gmroi.data ? formatRatio(gmroi.data.data.totals.gmroi) : '—'}
              </StatValue>
              <StatDesc>
                {gmroi.data ? gmroiVerdict(gmroi.data.data.totals.gmroi) : 'Working it out…'}
              </StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Orders you could fill</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {fillRate.data ? formatPercent(fillRate.data.data.lineFillRatePct) : '—'}
              </StatValue>
              <StatDesc>
                {fillRate.data
                  ? fillRateVerdict(fillRate.data.data.lineFillRatePct)
                  : 'Working it out…'}
              </StatDesc>
            </Stat>
          </Stats>
        </Card>

        <SellThroughCard report={st} filters={filters} onOpen={openItem} />

        {gmroi.data ? (
          <GmroiCard report={gmroi.data.data} filters={filters} onOpen={openItem} />
        ) : null}

        {fillRate.data ? (
          <FillRateCard report={fillRate.data.data} filters={filters} onOpen={openItem} />
        ) : null}

        {stockouts.data ? (
          <StockoutCard report={stockouts.data.data} filters={filters} onOpen={openItem} />
        ) : null}

        {movements.data ? (
          <MovementSummaryCard report={movements.data.data} filters={filters} />
        ) : null}
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Performance report controls"
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Period these figures cover"
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
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Location these figures cover"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
              }}
            >
              <option value="">Every location</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={anyFetching}
            updatedAt={sellThrough.data ? sellThrough.dataUpdatedAt : undefined}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
