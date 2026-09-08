'use client';

// STOCK — how much of each thing you have right now, everywhere you keep it.
//
// ── Why this one IS a table ──────────────────────────────────────────────
//
// The house rule is that a short list of one-line things is cards, not a table.
// This is the other case: hundreds of rows that each carry four numbers, and the
// whole job of the screen is comparing those numbers down a column. Cards would
// turn a scan into a read. The columns disclose with @container so a pane docked
// at 320px still shows the two that matter — what it is and how many can be sold
// — rather than six columns of two characters each.
//
// ── Every narrowing is a SERVER filter ───────────────────────────────────
//
// Search, location, "running low", the sort and the paging all go to the API.
// Sorting the loaded window in the browser sorts ONE page and presents it as the
// answer, so "what is closest to running out" would return the scarcest of the
// fifty rows that happen to be in hand. "Running low" in particular is an
// expression over three columns, which is why the endpoint grew a real filter
// for it rather than the client sieving a page.
//
// ── Four empty states, because they are four different problems ──────────
//
// Nothing matches the search · nothing matches the low-stock filter (which is
// GOOD news and should say so) · nothing is counted anywhere yet · and the one
// that used to hide inside the first: the search matched a real PRODUCT that has
// simply never been counted. This list can only see what has a level row, and a
// level row appears only when somebody counts something — so a bakery typing
// "rye", the exact name of a product on her own shop page, was told to try part
// of a product name. Same outcome, different cause, and the advice for the other
// cause sends her to redo the thing she just did correctly. When the search is
// the ONLY thing narrowing the list, we ask the catalog and offer what we find.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Table,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Boxes, ShieldCheck, TrendingDown } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  levelState,
  locationLabel,
  sellable,
  useCatalogMatches,
  useUncountedVariants,
  useStockLevels,
  useStockLocations,
  type SortDirection,
  type StockLevel,
  type StockSortKey,
} from './data';
import { openProductFacet } from '../commerce/product-scope';
import { humanDuration, stockAgeTone } from './integrity-data';
import { RowOpenHint } from '../../components/row-open-hint';
import { StockUncountedBand } from './stock-uncounted-band';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/**
 * What to try when nothing matched — naming ONLY what is actually narrowing the
 * list. Telling someone to clear a filter they never set sends them hunting for
 * a control that is already off.
 */
function emptyAdvice(search: string, locationName: string | null): string {
  const parts: string[] = [];
  if (search) parts.push('Try part of a product code or a product name.');
  if (locationName) {
    parts.push(
      `You are only seeing stock kept at ${locationName} — switch to every location for the rest.`
    );
  }
  return parts.join(' ');
}

export function StockListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  // Most recently changed first: opened cold, the useful question is "what
  // moved". Switching to "To sell" answers "what is nearly gone" instead.
  const [sort, setSort] = useState<{ key: StockSortKey; dir: SortDirection }>({
    key: 'updatedAt',
    dir: 'desc',
  });

  // What this list is showing, as plain strings — the shape a saved view stores
  // and re-applies. Derived rather than held separately so a view can never
  // drift out of step with the controls above it.
  const viewParams = useMemo(
    () => ({
      q: search.trim(),
      warehouse: locationId,
      low: lowOnly ? '1' : '',
      sort: `${sort.key}:${sort.dir}`,
    }),
    [search, locationId, lowOnly, sort]
  );

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  // How wide the current window has grown. "Load more" raises this; anything
  // that changes WHICH rows match resets it.
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useStockLevels({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    lowStockOnly: lowOnly,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  // Asked ALONGSIDE the list, not instead of it and not only when it is empty.
  // A version nobody has counted is not a row this list can hold, so the only
  // way it gets mentioned is if something asks separately (issue 444). Held back
  // while a location is chosen: an uncounted version is at no location, so
  // "nothing counted at the Main Warehouse" would be answering a question the
  // person did not ask.
  const uncounted = useUncountedVariants(search.trim(), locationId === '' && !isError);

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || locationId !== '' || lowOnly;

  // Is this search a dead end because the thing was never COUNTED, rather than
  // because it does not exist? Only askable when the search is the only thing
  // narrowing the list: with a location filter on, an empty result means "not
  // here", and a product could be sitting counted at the place next door.
  const searchOnly = search.trim() !== '' && locationId === '' && !lowOnly;
  const catalog = useCatalogMatches(
    search.trim(),
    searchOnly && !isLoading && !isError && rows.length === 0
  );
  const catalogMatches = catalog.data?.items ?? [];

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

  const header = (key: StockSortKey, label: string, extra = '') => (
    <th
      className={extra}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          toggleSort(key);
        }}
      >
        {label}
        {sort.key === key ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );

  const open = (level: StockLevel, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.stock.item', { variantId: level.variantId }, { target: targetFor(event) });
  };

  /** Always beside, never in place: the whole point of the explanation is to
   *  read it while still looking at the number it explains. */
  const explain = (level: StockLevel) => {
    ctx.open(
      'inventory.stock.provenance',
      { variantId: level.variantId, warehouseId: level.warehouseId },
      { target: 'beside' }
    );
  };

  const body = () => {
    // A failed load REPLACES the table. Rendering an empty grid under live
    // filters invites someone to conclude they have no stock.
    if (isError) {
      return (
        <EmptyState
          icon={<Boxes className="size-6" aria-hidden />}
          title="Could not load your stock"
          description="This is a problem reaching the server. Your stock is unaffected — the numbers just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading stock…
        </p>
      );
    }

    if (rows.length === 0) {
      // "Nothing is running low" is good news, and an empty state that reads
      // like a failure over good news is its own kind of wrong.
      if (lowOnly && search.trim() === '') {
        return (
          <EmptyState
            icon={<TrendingDown className="size-6" aria-hidden />}
            title={
              locationName ? `Nothing is running low at ${locationName}` : 'Nothing is running low'
            }
            description="Everything with a reorder rule is above the level you asked to be warned at. Turn the filter off to see all your stock."
          />
        );
      }
      // Still asking the catalog whether this is a typo or an uncounted product.
      // Answering "Nothing matches that" first and correcting it a beat later is
      // worse than a short wait: the first answer is the wrong one.
      if (catalog.isFetching) {
        return (
          <p className="p-4 text-sm" role="status">
            Checking your catalog…
          </p>
        );
      }

      // The search matched real products that simply have no count behind them.
      // Naming them, and offering the one action that helps, is the difference
      // between a dead end and a next step.
      if (catalogMatches.length > 0) {
        return (
          <EmptyState
            icon={<Boxes className="size-6" aria-hidden />}
            title={`Nothing counted for “${search.trim()}” yet`}
            description={
              catalogMatches.length === 1
                ? 'This is in your catalog and has never been counted, so your website sells it without limit. Open it to say how many you have.'
                : 'These are in your catalog and have never been counted, so your website sells them without limit. Open one to say how many you have.'
            }
            actions={
              <div className="flex flex-wrap gap-2">
                {catalogMatches.map((match) => (
                  <Button
                    key={match.id}
                    size="sm"
                    color="module"
                    onClick={(event) => {
                      openProductFacet(ctx, 'commerce.product.stock', match.id, event);
                    }}
                  >
                    {match.title}
                  </Button>
                ))}
              </div>
            }
          />
        );
      }

      return (
        <EmptyState
          icon={<Boxes className="size-6" aria-hidden />}
          title={narrowed ? 'Nothing matches that' : 'Nothing is being counted yet'}
          description={
            narrowed
              ? emptyAdvice(search.trim(), locationName)
              : 'Stock appears here once you record how many of something you have. Open a product and use its Stock panel to count it for the first time — and until you do, your website sells it without limit.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            {header('product', 'Item')}
            <th className="hidden @lg:table-cell">Location</th>
            {header('available', 'To sell', 'text-right whitespace-nowrap')}
            <th className="hidden text-right @xl:table-cell">On the shelf</th>
            <th className="hidden text-right @3xl:table-cell">Spoken for</th>
            <th>State</th>
            {/* An icon-only column: the header is for screen readers, and a word
                here would claim width the numbers need more. */}
            <th className="w-8">
              <span className="sr-only">Where the number came from</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((level) => {
            const state = levelState(level);
            return (
              <tr
                key={`${level.variantId}:${level.warehouseId}`}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(level, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(level, event);
                }}
              >
                {/* `max-w-0 w-full` is load-bearing, not decoration. A table
                    cell sizes to its content, so at 380px the product name kept
                    pushing the row wider and shoved the state badge off the
                    right edge — the one column that must never be the one to
                    go. Zeroing the max width makes this the cell that GIVES,
                    which is what lets the truncation below actually bite. */}
                <td className="w-full max-w-0">
                  {/* Identity is two facts and they are not equals: the product
                      name is what a person recognises, the code is how the shelf
                      is labelled. Both readable, one leading. */}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{level.productTitle ?? 'Untitled product'}</span>
                    <span className="truncate font-mono text-sm">{level.sku ?? 'No code'}</span>
                    {/* Below @lg the Location column is gone, so it comes back
                        here — a stock row without a place is not an answer. */}
                    <span className="truncate text-sm @lg:hidden">{locationLabel(level)}</span>
                  </span>
                </td>
                <td className="hidden max-w-48 truncate @lg:table-cell">{locationLabel(level)}</td>
                <td className="text-right font-medium whitespace-nowrap tabular-nums">
                  {sellable(level)}
                </td>
                <td className="hidden text-right tabular-nums @xl:table-cell">{level.onHand}</td>
                <td className="hidden text-right tabular-nums @3xl:table-cell">
                  {level.allocated}
                </td>
                <td>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge color={state.tone} variant="soft" size="sm">
                      {state.label}
                    </Badge>
                    {/* Only when the number has actually gone stale. A row of
                        "2 hours" beside every healthy line is noise that trains
                        people to stop reading the column before it ever means
                        anything — an age badge is a deliberate signal, and a
                        deliberate signal shown always is a decoration. */}
                    {stockAgeTone(level.ageSeconds) !== 'success' ? (
                      <Badge color={stockAgeTone(level.ageSeconds)} variant="soft" size="sm">
                        {humanDuration(level.ageSeconds)} old
                      </Badge>
                    ) : null}
                  </span>
                </td>
                <td>
                  {/* `stopPropagation` because the row itself is a button: without
                      it this opens the item pane AND the explanation, and the one
                      that lands second wins — which is the opposite of what was
                      clicked. */}
                  <Tooltip content="Where this number came from">
                    <Button
                      size="sm"
                      variant="ghost"
                      color="neutral"
                      aria-label={`Where the number for ${level.sku ?? 'this item'} came from`}
                      onClick={(event) => {
                        event.stopPropagation();
                        explain(level);
                      }}
                    >
                      <ShieldCheck className="size-4" aria-hidden />
                    </Button>
                  </Tooltip>
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
      {/* Four controls and no primary action — stock is not something you create
          here, it arrives by counting, receiving or selling. So the refresh
          button carries the `ml-auto` that a primary action normally would.
          Nothing wraps: the location picker sheds to a narrow control and the
          search box absorbs whatever is left. */}
      <PaneToolbar
        label="Stock list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search stock"
              placeholder="Product name or code…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
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
              resetWindow();
            },
            options: [
              { value: '', label: 'Every location' },
              ...activeLocations.map((location) => ({ value: location.id, label: location.name })),
            ],
            neutralValue: '',
            present: 'select',
          },
          {
            label: 'Stock level',
            key: 'lowOnly',
            value: lowOnly ? 'low' : 'all',
            onValueChange: (next) => {
              setLowOnly(next === 'low');
              resetWindow();
            },
            options: [
              { value: 'all', label: 'All stock' },
              { value: 'low', label: 'Running low' },
            ],
            neutralValue: 'all',
          },
        ]}
        views={{
          target: '/inventory/stock',
          params: viewParams,
          onApply: (next) => {
            setSearch(next.q ?? '');
            const [key, dir] = (next.sort ?? '').split(':');
            if (key && (dir === 'asc' || dir === 'desc')) {
              setSort({ key: key as StockSortKey, dir });
            }
            resetWindow();
          },
        }}
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

      {/* Above the table, because it is about what the table is NOT showing. */}
      <StockUncountedBand
        ctx={ctx}
        items={uncounted.data?.items ?? []}
        total={uncounted.data?.total ?? 0}
        searching={search.trim() !== ''}
      />

      {/* Full width — matches the house list convention: the table fills the pane. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">{body()}</Card>

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
