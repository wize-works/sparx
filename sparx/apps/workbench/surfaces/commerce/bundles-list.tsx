'use client';

// The bundles list.
//
// A bundle is sold as one wrapper product, so that product's name is its
// identity. The two facts that tell one bundle from another are how it is priced
// and how many products are inside it — so the table leads with the name and
// carries those two.
//
// A standard workbench list: a real <Table> whose headers sort SERVER-SIDE (a
// client-side sort of one loaded page would sort that page and pass it off as
// the whole answer), server-paged via <ListPagination>, columns disclosed with
// @container so the same table reads in a 320px docked pane or a full window.

import { useState } from 'react';
import { Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Blocks, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents } from './products-data';
import { useBundles, type Bundle, type BundleSort, type SortDir } from './bundles-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function pricingLabel(bundle: Bundle): string {
  switch (bundle.pricingMode) {
    case 'fixed':
      return bundle.fixedPriceCents === null
        ? 'Flat price'
        : `Flat ${formatCents(bundle.fixedPriceCents)}`;
    case 'percent_off_sum':
      return bundle.percentOffSum === null
        ? '% off the parts'
        : `${String(bundle.percentOffSum)}% off the parts`;
    default:
      return 'Parts added up';
  }
}

export function BundlesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  // Alphabetical by name is the readable default for a catalog, and it puts the
  // sort indicator on the column people actually scan by.
  const [sort, setSort] = useState<{ key: BundleSort; dir: SortDir }>({ key: 'name', dir: 'asc' });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useBundles({
    q: search,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  /** Anything that changes which rows match returns to the first window —
   *  staying on page 5 of a set that now has two pages shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: BundleSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Text ascends; the product count descends (most-packed first is the
          // more useful default question).
          { key, dir: key === 'components' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: BundleSort, label: string, extra = '') => (
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

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.bundle.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Bundle list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search bundles"
              placeholder="Search bundles…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            title="Add a bundle — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('commerce.bundle.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add a bundle</span>
          </Button>
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            title="Could not load your bundles"
            description="Something went wrong reaching the server. It may be temporary — try again in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={Boolean(search.trim())}
            noResults={{
              icon: <Blocks className="size-6" aria-hidden />,
              title: 'Nothing matches that search',
              description: 'Try a different word, or clear the search box to see everything.',
            }}
            firstRun={{
              title: 'No bundles yet',
              description:
                'A bundle sells several products together as one item — a kit, a gift set, a package — usually for less than buying the parts separately. Add your first one to get started.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Bundle')}
                {header('pricingMode', 'Pricing', 'hidden @lg:table-cell')}
                {header('components', 'Products', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    open(row.id, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open(row.id, event);
                  }}
                >
                  <td className="max-w-64 truncate font-medium">{row.bundleProductTitle}</td>
                  <td className="hidden text-sm @lg:table-cell">{pricingLabel(row)}</td>
                  <td className="text-right tabular-nums">
                    {row.componentCount === 1
                      ? '1 product'
                      : `${String(row.componentCount)} products`}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

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
        <RowOpenHint />
      </div>
    </div>
  );
}
