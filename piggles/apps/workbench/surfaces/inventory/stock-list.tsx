'use client';

// STOCK — how much of each thing you have right now, everywhere you keep it.
//
// This file owns the pane: its filters, its window over the data, its toolbar.
// Which answer is on screen is stock-list-body.tsx, the table is
// stock-list-table.tsx, the several kinds of nothing are stock-list-empty.
//
// ── Every narrowing is a SERVER filter ───────────────────────────────────
//
// Search, location, which state, the sort and the paging all go to the API.
// Sorting the loaded window in the browser sorts ONE page and presents it as the
// answer, so "what is closest to running out" would return the scarcest of the
// fifty rows that happen to be in hand.
//
// This list can only see what has a level row, and a level row appears only when
// somebody counts something — so a real product typed by its real name can come
// back empty. `searchOnly` below is what lets us ask the catalog instead.

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@wizeworks/silicaui-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  useCatalogMatches,
  useStockLevels,
  useStockLocations,
  useUncountedVariants,
  type SortDirection,
  type StockLevel,
  type StockSortKey,
} from './data';
import { RowOpenHint } from '../../components/row-open-hint';
import { StockListBody } from './stock-list-body';
import { StockUncountedBand } from './stock-uncounted-band';
import {
  StockListToolbar,
  parseLevel,
  parseSort,
  titleForLevel,
  type StockLevelFilter,
} from './stock-list-toolbar';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function StockListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  // Seeded from the address so "1 item is sold out" can open this showing that
  // item. Read ONCE: after the first render the chips own it, and re-reading
  // would fight a person who has since changed it.
  const [level, setLevel] = useState<StockLevelFilter>(() =>
    parseLevel(typeof ctx.params.level === 'string' ? ctx.params.level : undefined)
  );
  // Most recently changed first: opened cold, the useful question is "what
  // moved". Switching to "To sell" answers "what is nearly gone" instead.
  const [sort, setSort] = useState<{ key: StockSortKey; dir: SortDirection }>({
    key: 'updatedAt',
    dir: 'desc',
  });

  // The half of this list's state the toolbar does not already hold. The
  // location filter rides the `filters` slot, so a saved view picks it up
  // without being told.
  // `level` is NOT here — it rides the `filters` slot, which composes it into
  // the snapshot under its own key and puts it back on apply.
  const viewParams = useMemo(
    () => ({ q: search.trim(), sort: `${sort.key}:${sort.dir}` }),
    [search, sort]
  );

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  // How wide the current window has grown. "Load more" raises this; anything
  // that changes WHICH rows match resets it.
  const [take, setTake] = useState<number>(50);

  // Follows the chips, not just the address: narrowed by hand and by link land
  // in the same state, so they read the same.
  useEffect(() => {
    ctx.setTitle(titleForLevel(level));
  }, [ctx, level]);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useStockLevels({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    lowStockOnly: level === 'low',
    outOfStockOnly: level === 'out',
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rowCount = data?.items.length ?? 0;
  // Only askable when the search is the only thing narrowing the list: with a
  // location filter on, an empty result means "not here", and the product could
  // be sitting counted at the place next door.
  const searchOnly = search.trim() !== '' && locationId === '' && level === '';
  const catalog = useCatalogMatches(
    search.trim(),
    searchOnly && !isLoading && !isError && rowCount === 0
  );

  // Asked ALONGSIDE the list, not instead of it and not only when it is empty.
  // A version nobody has counted is not a row this list can hold, so the only
  // way it gets mentioned is if something asks separately (issue 444). Held back
  // while a location is chosen: an uncounted version is at no location, so
  // "nothing counted at the Main Warehouse" would be answering a question the
  // person did not ask.
  const uncounted = useUncountedVariants(search.trim(), locationId === '' && !isError);

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || locationId !== '' || level !== '';

  /** Anything that changes which rows match returns to the first window —
   *  staying on page 5 of a result set that now has two pages shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: StockSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Quantities open smallest-first ("what is nearly gone"), timestamps
          // newest-first, names A–Z. Each is the question people actually ask.
          { key, dir: key === 'updatedAt' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const open = (row: StockLevel, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.stock.item', { variantId: row.variantId }, { target: targetFor(event) });
  };

  /** Always beside, never in place: the whole point of the explanation is to
   *  read it while still looking at the number it explains. */
  const explain = (row: StockLevel) => {
    ctx.open(
      'inventory.stock.provenance',
      { variantId: row.variantId, warehouseId: row.warehouseId },
      { target: 'beside' }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <StockListToolbar
        search={search}
        onSearch={(next) => {
          setSearch(next);
          resetWindow();
        }}
        locationId={locationId}
        onLocation={(next) => {
          setLocationId(next);
          resetWindow();
        }}
        locations={activeLocations}
        level={level}
        onLevel={(next) => {
          setLevel(next);
          resetWindow();
        }}
        viewParams={viewParams}
        onApplyView={(next) => {
          setSearch(next.q ?? '');
          // A view saved while this was a yes/no toggle stored `low: '1'`; the
          // filters slot has already put `level` back by the time this runs.
          if (next.low === '1') setLevel('low');
          const parsed = parseSort(next.sort);
          if (parsed) setSort(parsed);
          resetWindow();
        }}
        isFetching={isFetching}
        updatedAt={data ? dataUpdatedAt : undefined}
        onRefresh={() => {
          void refetch();
        }}
      />

      {/* Above the table, because it is about what the table is NOT showing. */}
      <StockUncountedBand
        ctx={ctx}
        items={uncounted.data?.items ?? []}
        total={uncounted.data?.total ?? 0}
        searching={search.trim() !== ''}
      />

      {/* Full width — matches the house list convention: the table fills the pane. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">
        <StockListBody
          ctx={ctx}
          rows={rows}
          isError={isError}
          isLoading={isLoading}
          search={search}
          locationId={locationId}
          locationName={locationName}
          level={level}
          narrowed={narrowed}
          catalogMatches={catalog.data?.items ?? []}
          checkingCatalog={catalog.isFetching}
          sort={sort}
          onSort={toggleSort}
          onOpen={open}
          onExplain={explain}
        />
      </Card>

      {/* Sits on the pane, not in the card — it describes the table rather than
          being part of it, which is what the recessed surface says. */}
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
            // A jump REPLACES the window, so growth from "load more" belongs to
            // the window you just left, not the one you land on.
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        {/* Only where there is a pointer to do them with — on the stack these
            three modifiers do not exist — and only when there is something to
            click, since advice about opening rows reads as an instruction when
            the answer to the search is that there are none. */}
        {rows.length > 0 ? <RowOpenHint /> : null}
      </div>
    </div>
  );
}
