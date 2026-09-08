'use client';

// WHAT YOU PLANNED AGAINST WHAT YOU PAID.
//
// ── The question this answers ────────────────────────────────────────────
//
// "The part I budgeted at £4.00 has been landing at £4.62 all quarter." Nobody
// discovers that from an average cost, because an average is designed to absorb
// it — the whole point of the number is to smooth the drift out. So the drift
// gets absorbed, the margin on that line quietly halves, and the first anyone
// knows is when the year's profit is short and nobody can say which line did it.
//
// ── Against the LANDED cost, deliberately ────────────────────────────────
//
// A supplier who holds their price and moves the shipping onto you has not held
// their price. Comparing the plan to the invoice line would agree with them.
// This compares it to what the goods actually cost to get onto the shelf, which
// is the number the business lives with.
//
// ── A report, not a list ─────────────────────────────────────────────────
//
// Headline figures over one table, in a capped centred column. The period and
// the location are server parameters: this is a question about every delivery in
// a window, so narrowing it in the browser would answer it about the rows that
// happened to load and present that as the whole picture.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
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
import { Scale } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, useStockLocations } from './data';
import { RANGE_PRESETS, rangeForDays } from './reports-data';
import {
  usePriceVariance,
  varianceLabel,
  varianceTone,
  type PriceVarianceRow,
} from './costing-data';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';
const NUMBER = new Intl.NumberFormat();

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A variance said as a direction and a size, never as a bare signed number —
 *  "+£412" makes a reader work out whether up is good. */
function varianceText(row: PriceVarianceRow, currency: string): string {
  if (row.standardUnitCostCents === null) return 'No planned cost set';
  const size = formatCents(Math.abs(row.varianceCents), currency);
  if (row.varianceCents === 0) return 'Exactly as planned';
  return `${size} ${row.varianceCents > 0 ? 'more' : 'less'} than planned`;
}

export function CostVarianceSurface({ ctx }: { ctx: SurfaceContext }) {
  const [rangeDays, setRangeDays] = useState(90);
  const [locationId, setLocationId] = useState('');

  // Memoised on the preset alone: rangeForDays reads the clock, so recomputing
  // it every render would mint a fresh query key each time and refetch forever.
  const range = useMemo(() => rangeForDays(rangeDays), [rangeDays]);
  const report = usePriceVariance(range, locationId || undefined);

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);

  const openItem = (row: PriceVarianceRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.stock.item', { variantId: row.variantId }, { target: targetFor(event) });
  };

  const body = () => {
    if (report.isError) {
      return (
        <EmptyState
          icon={<Scale className="size-6" aria-hidden />}
          title="Could not work out your costs against plan"
          description="This is a problem reaching the server. Your deliveries and their costs are unaffected — the comparison just could not be worked out."
        />
      );
    }
    if (report.isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Comparing what you planned with what you paid…
        </p>
      );
    }

    const data = report.data;
    if (!data) return null;

    if (data.totalUnits === 0) {
      return (
        <EmptyState
          icon={<Scale className="size-6" aria-hidden />}
          title="Nothing arrived in this period"
          description="This compares what you planned to pay with what you actually paid, delivery by delivery. Book a delivery in against a purchase order and the comparison appears here."
        />
      );
    }

    const currency = data.currency;
    const over = data.totalVarianceCents > 0;
    const pct =
      data.totalStandardCents > 0
        ? Math.round((data.totalVarianceCents / data.totalStandardCents) * 1000) / 10
        : null;

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            What you planned against what you paid
          </Heading>
          <Text>
            Everything that arrived in the period, compared with the cost you had planned for it —
            including what it cost to get here, because a supplier who holds their price and moves
            the shipping onto you has not held their price.
          </Text>
        </div>

        <Card className="shrink-0">
          <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @2xl:grid-cols-3">
            <Stat>
              <StatTitle>What you planned to pay</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatCents(data.totalStandardCents, currency)}
              </StatValue>
              <StatDesc>Across {plural(data.totalUnits, 'unit', 'units')} received</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>What it actually cost</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatCents(data.totalActualCents, currency)}
              </StatValue>
              <StatDesc>Goods plus everything it took to get them here</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>The difference</StatTitle>
              <StatValue
                className={
                  over
                    ? 'text-danger text-2xl tabular-nums'
                    : data.totalVarianceCents < 0
                      ? 'text-success text-2xl tabular-nums'
                      : 'text-2xl tabular-nums'
                }
              >
                {formatCents(Math.abs(data.totalVarianceCents), currency)}
              </StatValue>
              <StatDesc>
                {data.totalVarianceCents === 0
                  ? 'Exactly what you planned for'
                  : `${over ? 'More' : 'Less'} than planned${pct === null ? '' : ` — ${String(Math.abs(pct))}%`}`}
              </StatDesc>
            </Stat>
          </Stats>
        </Card>

        {/* A gap in the data, said out loud. A variance report that silently
            skipped half the deliveries would read as "nothing to worry about". */}
        {data.unitsWithoutStandard > 0 ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>
                {plural(data.unitsWithoutStandard, 'unit has', 'units have')} nothing to compare
                against
              </AlertTitle>
              <AlertDescription>
                Those items have no planned cost set, so they are left out of the figures above. Set
                a cost on the product, or on its stock at a location, and they join the comparison.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <section className="card bg-base-100 flex flex-col gap-3 p-4">
          <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
            <Heading level={2} className="text-lg font-semibold">
              Where the difference is
            </Heading>
            <Text className="text-sm">
              Biggest gaps first. These are the lines worth a conversation with the supplier — or a
              look at whether the price you charge has kept up.
            </Text>
          </div>
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Item</th>
                <th className="hidden @xl:table-cell">Supplier</th>
                <th className="hidden text-right whitespace-nowrap @lg:table-cell">Planned each</th>
                <th className="text-right whitespace-nowrap">Actually cost, each</th>
                <th className="text-right whitespace-nowrap">Difference</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={`${row.variantId}:${row.supplierId ?? 'none'}`}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    openItem(row, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openItem(row, event);
                  }}
                >
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{row.title ?? 'Untitled product'}</span>
                      <span className="truncate font-mono text-sm">
                        {row.sku ?? 'No code'} · {NUMBER.format(row.unitsReceived)} received
                      </span>
                    </span>
                  </td>
                  <td className="hidden max-w-40 truncate @xl:table-cell">
                    {row.supplierName ?? 'No supplier'}
                  </td>
                  <td className="hidden text-right tabular-nums @lg:table-cell">
                    {row.standardUnitCostCents === null
                      ? '—'
                      : formatCents(row.standardUnitCostCents, currency)}
                  </td>
                  <td className="text-right font-medium tabular-nums">
                    {formatCents(row.actualUnitCostCents, currency)}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {row.standardUnitCostCents === null ? (
                      <Badge color="neutral" variant="soft" size="sm">
                        No plan set
                      </Badge>
                    ) : (
                      <span className="flex flex-col items-end gap-0.5">
                        <Badge color={varianceTone(row.variancePercent)} variant="soft" size="sm">
                          {row.variancePercent === null
                            ? varianceLabel(row.varianceCents)
                            : `${row.variancePercent > 0 ? '+' : ''}${String(row.variancePercent)}%`}
                        </Badge>
                        <span className="text-sm tabular-nums">{varianceText(row, currency)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Cost comparison controls"
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Period to compare"
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
              aria-label="Location"
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
            isFetching={report.isFetching}
            updatedAt={report.dataUpdatedAt}
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
