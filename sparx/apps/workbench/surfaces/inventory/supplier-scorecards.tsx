'use client';

// HOW YOUR SUPPLIERS ARE DOING — the league table.
//
// Every figure on this screen was already in the database. On time, in full, at
// the agreed price, undamaged: a purchase order records what was promised, a
// receipt records what turned up, and nobody has ever added the two together. A
// buyer who can say "this supplier has shorted us on one line in six for a year"
// has a completely different conversation from one who has a feeling about it.
//
// ── The thing this screen must never do ───────────────────────────────────
//
// Grade somebody on nothing. A supplier who has never quoted a lead time cannot
// be late; one whose orders are all still open cannot have shorted you. So an
// unmeasurable component reads "Not measured", never 0%, and a supplier with
// fewer than two measurable components carries NO grade at all — the row still
// appears, because "we cannot judge these five" is part of the answer to "how
// are my suppliers doing".
//
// Worst first. A league table exists to show you the problem, and an ungraded
// supplier sorts last rather than looking perfect.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { Calculator, Truck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, stockErrorMessage } from './data';
import {
  componentsLabel,
  damageTone,
  fillRateTone,
  gradeLabel,
  gradeTone,
  onTimeTone,
  priceVarianceTone,
  rateOrUnknown,
  useRecomputeScorecards,
  useSupplierScorecards,
} from './supplier-performance-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function SupplierScorecardsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [scoredOnly, setScoredOnly] = useState(false);

  const report = useSupplierScorecards({ scoredOnly });
  const recompute = useRecomputeScorecards();
  const toast = useToast();

  const rows = report.data?.items ?? [];
  const measuredAt = report.data?.measuredAt ?? null;
  const unscored = report.data?.unscored ?? 0;

  const onRecompute = () => {
    recompute.mutate(undefined, {
      onSuccess: (result) => {
        afterCommit(() => {
          toast.add({
            title: 'Suppliers measured',
            description:
              result.suppliersScored === 0
                ? `Looked at ${plural(result.suppliersMeasured, 'supplier', 'suppliers')}. None has enough history to grade yet.`
                : `Graded ${result.suppliersScored} of ${plural(result.suppliersMeasured, 'supplier', 'suppliers')} on the last ${result.windowDays} days.`,
            type: 'success',
          });
        });
      },
      onError: (error) => {
        afterCommit(() => {
          toast.add({
            title: 'Could not measure your suppliers',
            description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
            type: 'error',
          });
        });
      },
    });
  };

  const open = (supplierId: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.suppliers.detail', { id: supplierId }, { target: targetFor(event) });
  };

  const body = () => {
    // Ahead of every empty state: a failed request is not a finding about your
    // suppliers, and both messages below would read as one.
    if (report.isError) {
      return (
        <EmptyState
          icon={<Truck className="size-6" aria-hidden />}
          title="Could not load your suppliers’ figures"
          description="This is a problem reaching the server, not a finding about anybody you buy from. Try again in a moment."
        />
      );
    }
    if (report.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading your suppliers’ figures…
        </p>
      );
    }
    if (rows.length === 0) {
      // Two empties that mean opposite things. Only the first is fixed by
      // pressing a button.
      return measuredAt === null ? (
        <EmptyState
          icon={<Calculator className="size-6" aria-hidden />}
          title="Nobody has been measured yet"
          description="This is empty because no pass has been made over your orders and deliveries — not because your suppliers are perfect. Press “Measure now” above to find out which."
          actions={
            <Button color="module" loading={recompute.isPending} onClick={onRecompute}>
              <Calculator className="size-4" aria-hidden />
              Measure now
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<Truck className="size-6" aria-hidden />}
          title={scoredOnly ? 'Nobody can be graded yet' : 'No suppliers on file'}
          description={
            scoredOnly
              ? 'Grading needs at least two of the four measures. Turn off “Graded only” to see everyone, including the ones there is not yet enough history to judge.'
              : 'Add the businesses you buy from, raise an order with them, and their record starts building itself from what actually happens.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Supplier</th>
            <th className="whitespace-nowrap">Overall</th>
            <th className="hidden text-right whitespace-nowrap @lg:table-cell">On time</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">In full</th>
            <th className="hidden text-right whitespace-nowrap @2xl:table-cell">Price</th>
            <th className="hidden text-right whitespace-nowrap @2xl:table-cell">Damaged</th>
            <th className="hidden text-right whitespace-nowrap @3xl:table-cell">Spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.supplierId}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(row.supplierId, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(row.supplierId, event);
              }}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{row.supplierName ?? 'Unnamed supplier'}</span>
                  <span className="truncate text-sm">
                    <span className="font-mono">{row.supplierCode ?? '—'}</span>
                    {' · '}
                    {row.deliveries === 0
                      ? 'no deliveries in the last year'
                      : `${plural(row.deliveries, 'delivery', 'deliveries')} in the last year`}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={gradeTone(row.grade)} variant="soft" size="sm">
                  {row.grade ? `${row.grade} · ${row.score}` : gradeLabel(null)}
                </Badge>
                {/* The letter never travels alone. A "B" standing on two of four
                    measures is a different claim from one standing on all four,
                    and the person acting on it has to be able to see which. */}
                <span className="block text-sm">{componentsLabel(row.scoredComponents)}</span>
              </td>
              <td className="hidden text-right whitespace-nowrap @lg:table-cell">
                <Badge color={onTimeTone(row.onTimeRate)} variant="soft" size="sm">
                  {rateOrUnknown(row.onTimeRate)}
                </Badge>
                {row.onTimeRate === null ? (
                  <Tooltip content="No delivery on this supplier has ever had a date to be judged against — either nobody set an expected arrival, or the supplier never stated a lead time.">
                    <span className="block text-sm">no dates set</span>
                  </Tooltip>
                ) : (
                  <span className="block text-sm">
                    {row.onTimeSample} checked
                    {row.avgDaysLate !== null ? ` · ${row.avgDaysLate}d late` : ''}
                  </span>
                )}
              </td>
              <td className="hidden text-right whitespace-nowrap @xl:table-cell">
                <Badge color={fillRateTone(row.fillRate)} variant="soft" size="sm">
                  {rateOrUnknown(row.fillRate)}
                </Badge>
                <span className="block text-sm">
                  {row.fillRate === null
                    ? 'no finished orders'
                    : `${row.shortLines} short of ${row.fillRateSample}`}
                </span>
              </td>
              <td className="hidden text-right whitespace-nowrap @2xl:table-cell">
                <Badge color={priceVarianceTone(row.priceVariancePct)} variant="soft" size="sm">
                  {row.priceVariancePct === null
                    ? 'Not measured'
                    : `${row.priceVariancePct > 0 ? '+' : ''}${row.priceVariancePct.toFixed(1)}%`}
                </Badge>
                <span className="block text-sm">
                  {row.priceVarianceCents === null || row.priceVarianceCents === 0
                    ? '—'
                    : formatCents(row.priceVarianceCents)}
                </span>
              </td>
              <td className="hidden text-right whitespace-nowrap @2xl:table-cell">
                <Badge color={damageTone(row.damageRate)} variant="soft" size="sm">
                  {rateOrUnknown(row.damageRate)}
                </Badge>
                <span className="block text-sm">
                  {row.damagedUnits === 0 ? '—' : `${row.damagedUnits} units`}
                </span>
              </td>
              <td className="hidden text-right tabular-nums @3xl:table-cell">
                {formatCents(row.spendCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Supplier performance controls"
        primary={
          <Button
            className="ml-auto"
            size="sm"
            color="module"
            loading={recompute.isPending}
            onClick={onRecompute}
          >
            <Calculator className="size-4" aria-hidden />
            Measure now
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="Show suppliers"
              value={scoredOnly ? 'graded' : 'all'}
              onChange={(event) => {
                setScoredOnly(event.target.value === 'graded');
              }}
            >
              <option value="all">Everyone</option>
              <option value="graded">Graded only</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={report.isFetching}
            updatedAt={report.data ? report.dataUpdatedAt : undefined}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
      />

      {measuredAt !== null ? (
        <Text className="text-sm">
          Measured <Timestamp value={measuredAt} format="relative" /> over the last year of orders
          and deliveries.
        </Text>
      ) : null}

      {/* A blank column of grades is honest but mute. When it is the state of a
          real number of suppliers, say WHY once here rather than leaving the
          reader to infer that half the screen is broken. */}
      {unscored > 0 && !scoredOnly ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>
              {plural(unscored, 'supplier has', 'suppliers have')} too little history to grade
            </AlertTitle>
            <AlertDescription>
              A grade needs at least two of the four measures, and each of those needs something to
              measure: a delivery with a date on it, an order that has finished, a price to compare,
              or units received. They are shown with what IS known rather than given a mark nothing
              supports.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>
    </div>
  );
}
