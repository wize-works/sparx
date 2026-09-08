'use client';

// MOVEMENTS — the append-only ledger of every change to a stock number.
//
// ── Why this IS a table ──────────────────────────────────────────────────
//
// Same test the Stock list passes: rows that each carry several facts you scan
// DOWN a column — a signed change, the balance it left behind, when, why. The
// job of the screen is to read a running account, and a card per row would turn
// a scan into a stack of paragraphs. The columns disclose with @container so a
// pane docked narrow still shows the three that matter — what moved, by how
// much, and why — rather than six columns two characters wide.
//
// ── Read-only, and every narrowing goes to the SERVER ─────────────────────
//
// There is nothing to create here: the ledger writes itself, one row per real
// change. So there is no primary action, and the refresh button carries the
// ml-auto a primary normally would. Search, location, reason and the date range
// are all server filters — a ledger is the list where sieving the loaded page is
// most plainly wrong, because "every loss last month" asked of the fifty newest
// rows of any kind is a different question with a different answer.
//
// ── Two empty states, two different problems ──────────────────────────────
//
// Nothing matches the filters · nothing has ever moved. Telling a shop with a
// year of history to "make their first change" because they mistyped a product
// name is the worse of the two mistakes.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  NativeSelect,
  SearchInput,
  Table,
  Timestamp,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { History, Search, ShieldCheck } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { SavedViewsBar } from '../../components/saved-views';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { movementReason, useStockLocations } from './data';
import {
  MOVEMENT_REASONS,
  deltaTone,
  signedDelta,
  useMovements,
  type Movement,
} from './movements-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A calendar day, as typed, turned into the ISO instant the endpoint wants. The
 *  "to" bound reaches the END of its day so a single day picked in both boxes
 *  includes everything that happened on it, not nothing. */
function dayStart(day: string): string | undefined {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function dayEnd(day: string): string | undefined {
  if (!day) return undefined;
  const date = new Date(`${day}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function MovementsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // What this list is showing, as plain strings — the shape a saved view stores
  // and re-applies (docs/146 Phase 10.2). "Everything written off last month",
  // saved once, is the whole point of the feature on this particular list.
  const viewParams = useMemo(
    () => ({ q: search.trim(), warehouse: locationId, reason, from, to }),
    [search, locationId, reason, from, to]
  );

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useMovements({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    ...(reason ? { reason } : {}),
    ...(dayStart(from) ? { from: dayStart(from) } : {}),
    ...(dayEnd(to) ? { to: dayEnd(to) } : {}),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed =
    search.trim() !== '' || locationId !== '' || reason !== '' || from !== '' || to !== '';

  /** Anything that changes which rows match returns to the first window. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (movement: Movement, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(
      'inventory.stock.item',
      { variantId: movement.variantId },
      { target: targetFor(event) }
    );
  };

  /**
   * "…and what is that number now?"
   *
   * A ledger row identifies exactly one (item, location) pair, so the current
   * standing of that pair is one click away rather than a hunt through the stock
   * list. Always beside — the row being asked about has to stay on screen.
   */
  const explain = (movement: Movement) => {
    ctx.open(
      'inventory.stock.provenance',
      { variantId: movement.variantId, warehouseId: movement.warehouseId },
      { target: 'beside' }
    );
  };

  const body = () => {
    // A failed load REPLACES the table — an empty grid under live filters reads
    // as "nothing has ever moved", which is a far bigger claim than the truth.
    if (isError) {
      return (
        <EmptyState
          icon={<History className="size-6" aria-hidden />}
          title="Could not load the history"
          description="This is a problem reaching the server. Your records are unaffected — they just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading history…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <EmptyState
          icon={
            narrowed ? (
              <Search className="size-6" aria-hidden />
            ) : (
              <History className="size-6" aria-hidden />
            )
          }
          title={narrowed ? 'Nothing matches that' : 'Nothing has moved yet'}
          description={
            narrowed
              ? locationName
                ? `No stock changes match those filters at ${locationName}. Widen the dates, clear the reason, or switch back to every location.`
                : 'No stock changes match those filters. Try a different reason, a wider date range, or part of a product name.'
              : 'Every change to a stock number shows up here — a sale, a delivery, a count being applied, a transfer. The first one appears the moment anything moves.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th className="hidden @lg:table-cell">When</th>
            <th>Item</th>
            <th className="text-right whitespace-nowrap">Change</th>
            <th className="hidden text-right @2xl:table-cell">Left on shelf</th>
            <th>Why</th>
            <th className="hidden @xl:table-cell">Location</th>
            <th className="w-8">
              <span className="sr-only">Where this item&rsquo;s number stands now</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((movement) => (
            <tr
              key={movement.id}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(movement, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(movement, event);
              }}
            >
              <td className="hidden whitespace-nowrap @lg:table-cell">
                <Timestamp value={movement.createdAt} format="relative" />
              </td>

              {/* `max-w-0 w-full` makes this the cell that gives, so the product
                  name truncates instead of shoving the Change column off the
                  right edge. */}
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{movement.productTitle ?? 'Untitled product'}</span>
                  <span className="truncate font-mono text-sm">
                    {movement.variantSku ?? 'No code'}
                  </span>
                  {/* Facts that fold back in when their column is gone — a change
                      with no when or where is only half an entry. */}
                  <span className="truncate text-sm @lg:hidden">
                    <Timestamp value={movement.createdAt} format="relative" />
                    {movement.warehouseName === null ? '' : ` · ${movement.warehouseName}`}
                  </span>
                  {movement.warehouseName !== null ? (
                    <span className="hidden truncate text-sm @lg:inline @xl:hidden">
                      {movement.warehouseName}
                    </span>
                  ) : null}
                </span>
              </td>

              <td className="text-right whitespace-nowrap">
                <Badge color={deltaTone(movement.delta)} variant="soft" size="sm">
                  <span className="tabular-nums">{signedDelta(movement.delta)}</span>
                </Badge>
              </td>

              <td className="hidden text-right tabular-nums @2xl:table-cell">
                {movement.balanceAfter ?? '—'}
              </td>

              <td>
                <span className="flex min-w-0 flex-col">
                  <span>{movementReason(movement.reason)}</span>
                  {movement.note === null ? null : (
                    <span className="truncate text-sm">{movement.note}</span>
                  )}
                </span>
              </td>

              <td className="hidden max-w-48 truncate @xl:table-cell">
                {movement.warehouseName ?? '—'}
              </td>

              <td>
                {/* `stopPropagation` because the row is itself a button — without
                    it this opens the item AND the explanation, and whichever
                    lands second wins. */}
                <Tooltip content="Where this item's number stands now">
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    aria-label={`Where the number for ${movement.variantSku ?? 'this item'} stands now`}
                    onClick={(event) => {
                      event.stopPropagation();
                      explain(movement);
                    }}
                  >
                    <ShieldCheck className="size-4" aria-hidden />
                  </Button>
                </Tooltip>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      {/* Genuinely more filters than a bar can hold on one line — search, place,
          reason and a two-ended date range — so this is one of the rare bars that
          earns `wrap`. */}
      <PaneToolbar
        label="Movements filters"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search movements by item"
              placeholder="Product name or code…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show changes at"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                resetWindow();
              }}
            >
              <option value="">Every location</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="Show only this kind of change"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                resetWindow();
              }}
            >
              <option value="">Any reason</option>
              {MOVEMENT_REASONS.map((value) => (
                <option key={value} value={value}>
                  {movementReason(value)}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-1.5">
              <span className="text-sm whitespace-nowrap">From</span>
              <Input
                size="sm"
                type="date"
                aria-label="Changes on or after"
                className="max-w-40"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  resetWindow();
                }}
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-sm whitespace-nowrap">To</span>
              <Input
                size="sm"
                type="date"
                aria-label="Changes on or before"
                className="max-w-40"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  resetWindow();
                }}
              />
            </label>
            <SavedViewsBar
              target="/inventory/movements"
              params={viewParams}
              className="ml-auto"
              onApply={(next) => {
                setSearch(next.q ?? '');
                setLocationId(next.warehouse ?? '');
                setReason(next.reason ?? '');
                setFrom(next.from ?? '');
                setTo(next.to ?? '');
                resetWindow();
              }}
            />
            {/* ALWAYS the last child of a list toolbar — see RefreshButton. */}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

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
        {rows.length > 0 ? <RowOpenHint what="a row to open the item it changed" /> : null}
      </div>
    </div>
  );
}
