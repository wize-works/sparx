'use client';

// REORDER — what is running low and needs buying again.
//
// ── A worklist, not a catalogue ──────────────────────────────────────────
//
// Every row here is a (product × location) already at or below the level you
// asked to be warned at. The job of the screen is to scan those rows, pick the
// ones to act on, and turn them into draft purchase orders — grouped for you by
// supplier, because that is the shape of a real order. So it IS a table: each row
// carries several numbers you compare down a column (what's left, the trigger
// level, how many to order, how many are already coming), exactly the case the
// house rule keeps tables for.
//
// ── The headline is WHEN it runs out ──────────────────────────────────────
//
// "How little is left" tells you it is low; it does not tell you how long you
// have. The row now leads with days of cover — the available stock divided by how
// fast it actually sells (straight from the ledger, not a guess) — said in plain
// words: "Out in about 6 days", "Out around 12 Aug", or "Not selling" when nothing
// is drawing it down. Soonest-to-run-out is a sort, because the shortest cover is
// the most urgent thing to buy.
//
// ── The ORDER is money, not emptiness (docs/146 Phase 7.7) ────────────────
//
// The default sort is now what running out would COST: the demand that would
// have nowhere to come from before a replacement could land, priced at the
// selling price. "Least in stock first" ranks by how empty a shelf looks, and a
// buyer with forty rows and an hour does not need the emptiest shelf — they need
// the one whose emptiness costs the most. A fast £40 line four days out beats a
// dormant £2 one down to its last unit, every time.
//
// Every row carries the sentence explaining its own figure, and the supplier's
// delivery time says whether it was MEASURED from real deliveries or is just
// what the supplier claims — which is most of the difference between a reorder
// level that works and one that is optimistic by however much the supplier is.
// Clicking through opens the full calculation.
//
// ── Every narrowing is a SERVER query ────────────────────────────────────
//
// Search, the location and supplier filters, the sort and the paging all go to
// the API. Sorting the loaded page in the browser would answer "what is most
// urgent" with "the scarcest of the fifty rows in hand" — so the endpoint sorts
// and narrows the WHOLE low set, and this only renders the window it returns.
//
// ── Three empty states, three different problems ──────────────────────────
//
// Nothing matches the search or a filter · nothing is running low, which is GOOD
// news and says so warmly · no reorder rules exist yet, so nothing can ever warn
// you. The last two both look like an empty list and mean opposite things, which
// is why the summary read exists to tell them apart.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  PackageCheck,
  PackageX,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
} from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, locationLabel, plural, stockErrorMessage, useStockLocations } from './data';
import {
  coverSignal,
  leadTimeSignal,
  purchaseOrderCount,
  supplierLabel,
  useDraftReorder,
  useReorderSummary,
  useReorderSuppliers,
  useReorderWorklist,
  velocityLabel,
  type DraftLine,
  type ReorderRow,
  type ReorderSort,
} from './reorder-data';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The stable identity of a worklist row: one product in one place. */
function rowKey(row: Pick<ReorderRow, 'variantId' | 'warehouseId'>): string {
  return `${row.variantId}:${row.warehouseId}`;
}

/**
 * What to try when nothing matched — naming ONLY the narrowings actually in
 * force. Advice to clear a filter that was never set sends people hunting for a
 * control that is already off.
 */
function emptyAdvice(search: string, locationName: string | null, supplierName: string | null) {
  const parts: string[] = [];
  if (search) parts.push('Try part of a product name or code.');
  if (locationName) parts.push(`You are only seeing ${locationName} — switch to every location.`);
  if (supplierName) parts.push(`You are only seeing ${supplierName} — switch to every supplier.`);
  return parts.join(' ');
}

export function ReorderListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [sort, setSort] = useState<ReorderSort>('risk');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  // Chosen lines, keyed by row identity. The whole ROW is stored, not just its
  // key, so a selection can span pages and still be drafted — the off-page rows'
  // supplier and quantity come along rather than being re-fetched.
  const [selected, setSelected] = useState<Map<string, ReorderRow>>(new Map());

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;

  const suppliers = useReorderSuppliers();
  const activeSuppliers = (suppliers.data?.items ?? []).filter((supplier) => supplier.isActive);
  const supplierName = activeSuppliers.find((supplier) => supplier.id === supplierId)?.name ?? null;

  const summary = useReorderSummary();

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useReorderWorklist({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    ...(supplierId ? { supplierId } : {}),
    sort,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || locationId !== '' || supplierId !== '';

  /** A change to WHICH rows match returns to the first window and drops the
   *  selection — chosen lines that no longer match would draft invisibly. */
  const onNarrow = () => {
    setPage(1);
    setTake(pageSize);
    setSelected(new Map());
  };

  /** Paging keeps the selection: it is the same result set, just a different
   *  window onto it. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toast = useToast();
  const confirm = useConfirm();
  const draft = useDraftReorder();

  const selectableRows = rows.filter((row) => row.supplierId !== null);
  const allPageSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selected.has(rowKey(row)));

  const toggleRow = (row: ReorderRow, on: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(rowKey(row), row);
      else next.delete(rowKey(row));
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((current) => {
      const next = new Map(current);
      if (allPageSelected) {
        for (const row of selectableRows) next.delete(rowKey(row));
      } else {
        for (const row of selectableRows) next.set(rowKey(row), row);
      }
      return next;
    });
  };

  const selectedLines: DraftLine[] = [...selected.values()].map((row) => ({
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    // Guarded at selection time — only rows with a supplier are ever selectable.
    supplierId: row.supplierId ?? '',
    quantity: row.suggestedQuantity,
  }));
  const orderCount = purchaseOrderCount(selectedLines);

  const onDraft = async () => {
    if (selectedLines.length === 0) return;
    const ok = await confirm({
      title: `Draft ${plural(orderCount, 'purchase order', 'purchase orders')}?`,
      description: `This turns the ${plural(
        selectedLines.length,
        'chosen item',
        'chosen items'
      )} into ${plural(
        orderCount,
        'draft order',
        'draft orders'
      )}, grouped by supplier and location. Nothing is ordered yet — a draft is yours to check, change, or discard before you send it to the supplier.`,
      confirmLabel: 'Create drafts',
      cancelLabel: 'Not yet',
      color: 'module',
    });
    if (!ok) return;
    draft.mutate(selectedLines, {
      onSuccess: (result) => {
        setSelected(new Map());
        const numbers = result.purchaseOrders.map((po) => po.number).join(', ');
        toast.add({
          title: `${plural(result.count, 'draft order', 'draft orders')} created`,
          description: numbers
            ? `${numbers} — find them under Purchase orders to review and send.`
            : 'Find them under Purchase orders to review and send.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not draft those orders',
          description: stockErrorMessage(error, 'Nothing was ordered. Please try again.'),
          type: 'error',
        });
      },
    });
  };

  // Clicking a row opens the CALCULATION, not the stock item. On this screen the
  // question is always "should I buy this, and why does it say that" — and the
  // stock item is one click further on from there.
  const open = (row: ReorderRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(
      'inventory.planning.explain',
      { variantId: row.variantId, warehouseId: row.warehouseId },
      { target: targetFor(event) }
    );
  };

  const body = () => {
    // A failed load REPLACES the table — an empty grid under live filters invites
    // the reading that nothing needs reordering, which is the opposite of unknown.
    if (isError) {
      return (
        <EmptyState
          icon={<PackageX className="size-6" aria-hidden />}
          title="Could not work out what needs reordering"
          description="This is a problem reaching the server. Your stock and orders are unaffected — the list just could not be read right now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Working out what needs reordering…
        </p>
      );
    }

    if (rows.length === 0) {
      if (narrowed) {
        return (
          <EmptyState
            icon={<Search className="size-6" aria-hidden />}
            title="Nothing matches that"
            description={emptyAdvice(search.trim(), locationName, supplierName)}
          />
        );
      }
      // No filters and still empty: two opposite meanings. No rule anywhere means
      // nothing can warn you; every rule comfortably above its trigger is the
      // whole point working.
      if (summary.data && summary.data.policyCount === 0) {
        return (
          <EmptyState
            icon={<SlidersHorizontal className="size-6" aria-hidden />}
            title="No reorder rules set up yet"
            description="Nothing can be flagged as running low until you say when to reorder it. Open a product, and on its Stock panel set a reorder level and how many to buy — this list then fills itself in as those items run down."
          />
        );
      }
      return (
        <EmptyState
          icon={<PackageCheck className="size-6" aria-hidden />}
          title="Nothing needs reordering"
          description="Every product with a reorder level is comfortably above it. As things run down they will appear here, most urgent first, ready to turn into orders."
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th className="w-0">
              <Checkbox
                color="module"
                aria-label="Choose every line here that can be ordered"
                checked={allPageSelected}
                disabled={selectableRows.length === 0}
                ref={(el) => {
                  if (el) {
                    el.indeterminate =
                      !allPageSelected && selectableRows.some((row) => selected.has(rowKey(row)));
                  }
                }}
                onChange={toggleAllOnPage}
              />
            </th>
            <th>Item</th>
            <th className="hidden @2xl:table-cell">Supplier</th>
            <th className="hidden text-right whitespace-nowrap @lg:table-cell">Available</th>
            <th className="hidden whitespace-nowrap @3xl:table-cell">Takes</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Sells</th>
            <th className="text-right whitespace-nowrap">To order</th>
            <th className="hidden text-right whitespace-nowrap @3xl:table-cell">On the way</th>
            <th className="whitespace-nowrap">Runs out</th>
            <th className="text-right whitespace-nowrap">At risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cover = coverSignal(row);
            const sells = velocityLabel(row);
            const lead = leadTimeSignal(row);
            const key = rowKey(row);
            const suppliable = row.supplierId !== null;
            return (
              <tr
                key={key}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(row, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(row, event);
                }}
              >
                {/* The checkbox is a control inside a clickable row, so its clicks
                    and its Space key must not also open the pane. */}
                <td
                  className="w-0"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Checkbox
                    color="module"
                    aria-label={
                      suppliable
                        ? `Choose ${row.title ?? row.sku ?? 'this item'} to reorder`
                        : 'Cannot order this — it has no supplier yet'
                    }
                    checked={selected.has(key)}
                    disabled={!suppliable}
                    onChange={(event) => {
                      toggleRow(row, event.target.checked);
                    }}
                  />
                </td>

                {/* `max-w-0 w-full` makes this the cell that GIVES, so the truncation
                    below actually bites and the "To order" number and state badge
                    are never the columns pushed off the right edge. */}
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{row.title ?? 'Untitled product'}</span>
                    <span className="truncate font-mono text-sm">{row.sku ?? 'No code'}</span>
                    {/* Columns that vanish on a narrow pane fold back in here — a
                        reorder line without its place, its supplier or how fast it
                        sells is half an answer. */}
                    <span className="truncate text-sm @lg:hidden">{locationLabel(row)}</span>
                    <span className="truncate text-sm @2xl:hidden">{supplierLabel(row)}</span>
                    {sells ? (
                      <span className="truncate text-sm @xl:hidden">Sells {sells}</span>
                    ) : null}
                    {/* The whole calculation in one sentence. It is the row's
                        most useful line — it is what turns "at risk £412" from
                        an assertion into something a buyer can agree with. */}
                    {row.reasoning ? (
                      <span className="truncate text-sm">{row.reasoning}</span>
                    ) : null}
                  </span>
                </td>

                <td className="hidden max-w-40 @2xl:table-cell">
                  {suppliable ? (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{supplierLabel(row)}</span>
                      <span className="truncate text-sm @3xl:hidden">{locationLabel(row)}</span>
                    </span>
                  ) : (
                    <Badge color="warning" variant="soft" size="sm">
                      No supplier yet
                    </Badge>
                  )}
                </td>

                <td className="hidden text-right tabular-nums @lg:table-cell">{row.available}</td>
                {/* Replaces "Reorder at". The trigger level is on the row's own
                    calculation page; how long the supplier ACTUALLY takes, and
                    whether that is measured or claimed, changes what to do now. */}
                <td className="hidden whitespace-nowrap @3xl:table-cell">
                  {lead ? (
                    <Badge color={lead.tone} variant="soft" size="sm" title={lead.detail}>
                      {lead.label}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums @xl:table-cell">
                  {sells ?? '—'}
                </td>
                <td className="text-right font-medium whitespace-nowrap tabular-nums">
                  {row.suggestedQuantity}
                </td>
                <td className="hidden text-right tabular-nums @3xl:table-cell">
                  {row.onOrder > 0 ? row.onOrder : '—'}
                </td>
                <td className="whitespace-nowrap">
                  <Badge color={cover.tone} variant="soft" size="sm">
                    {cover.label}
                  </Badge>
                </td>
                {/* A number, not a badge: it is the one thing on the row a buyer
                    compares straight down the column. Zero reads as a dash —
                    "£0.00" would look like a measurement of nothing, when it
                    almost always means there is no deadline at all. */}
                <td className="text-right font-medium whitespace-nowrap tabular-nums">
                  {row.revenueAtRiskCents > 0 ? formatCents(row.revenueAtRiskCents) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Reorder controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search what needs reordering"
              placeholder="Product name or code…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                onNarrow();
              }}
            />
          </div>
        }
        filters={[
          {
            label: 'Kept at',
            key: 'location',
            value: locationId,
            onValueChange: (next) => {
              setLocationId(next);
              onNarrow();
            },
            options: [
              { value: '', label: 'Every location' },
              ...activeLocations.map((location) => ({ value: location.id, label: location.name })),
            ],
            neutralValue: '',
            present: 'select',
          },
          {
            label: 'Bought from',
            key: 'supplier',
            value: supplierId,
            onValueChange: (next) => {
              setSupplierId(next);
              onNarrow();
            },
            options: [
              { value: '', label: 'Every supplier' },
              ...activeSuppliers.map((s) => ({ value: s.id, label: s.name })),
            ],
            neutralValue: '',
            present: 'select',
          },
        ]}
        controls={
          <NativeSelect
            size="sm"
            className="max-w-40 shrink"
            aria-label="Order the list by"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as ReorderSort);
              resetWindow();
            }}
          >
            <option value="risk">Costs the most to miss</option>
            <option value="cover">Runs out soonest</option>
            <option value="urgency">Least in stock first</option>
            <option value="shortfall">Furthest below target</option>
          </NativeSelect>
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

      {/* The action bar only exists while there is something chosen, so it costs
          no permanent height. It is a base-100 card lifted onto the pane, matching
          the toolbar and the table — the house floating pattern. */}
      {selected.size > 0 ? (
        <div className="bg-base-100 flex shrink-0 flex-wrap items-center gap-3 rounded-lg p-2">
          <Text className="text-base">
            {plural(selected.size, 'item', 'items')} chosen ·{' '}
            {plural(orderCount, 'order', 'orders')} to draft
          </Text>
          <Button
            className="ml-auto"
            size="sm"
            variant="ghost"
            color="neutral"
            onClick={() => {
              setSelected(new Map());
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            color="module"
            loading={draft.isPending}
            onClick={() => {
              void onDraft();
            }}
          >
            <ShoppingCart className="size-4" aria-hidden />
            Draft {plural(orderCount, 'order', 'orders')}
          </Button>
        </div>
      ) : null}

      {/* Full width — matches the house list convention: the table fills the pane. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">{body()}</Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        {rows.length > 0 ? (
          <Text className="hidden px-1 pb-1 text-sm @xl:block">
            <Truck className="mr-1 inline size-4 align-text-bottom" aria-hidden />
            Choose lines to draft orders · click a row to see how its figures were worked out ·
            shift-click alongside
          </Text>
        ) : null}
      </div>
    </div>
  );
}
