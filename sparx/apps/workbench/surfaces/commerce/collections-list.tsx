'use client';

// The collections list.
//
// A collection is a themed group of products you show together — a sale, a gift
// guide, new arrivals. Two facts distinguish one from another, and this table is
// built around them: whether it fills itself from rules (AUTOMATIC) or is a list
// you HAND-PICK, and how many products are in it. A featured collection carries a
// state badge; recency rides its own column so the list can be sorted by it.
//
// It is a real <Table> like the invoicing list, not a <ul> of buttons: the same
// sortable headers backed by SERVER-SIDE sort, the same server-paged window via
// <ListPagination>, and the same progressive column disclosure by @container — a
// collection pane is 320px beside an editor or the whole window, and only pane
// width can decide how many columns fit.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Layers, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  useCollectionsPage,
  type CollectionSort,
  type CollectionSummary,
  type CollectionType,
  type SortDir,
} from './collections-data';
import { RowOpenHint } from '../../components/row-open-hint';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'rules', label: 'Automatic' },
  { value: 'manual', label: 'Hand-picked' },
] as const;

/** A short, human "when" for the recency column — "Jul 20", or with the year for
 *  anything from a past year, so an old collection reads unambiguously. */
function formatUpdated(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CollectionsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('all');
  // Most recently changed first — the default a curation list wants, and the
  // reason the endpoint needed a real `sort_by`/`order` rather than a hardcoded
  // orderBy.
  const [sort, setSort] = useState<{ key: CollectionSort; dir: SortDir }>({
    key: 'updatedAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useCollectionsPage({
    q: search,
    type: type === 'all' ? undefined : (type as CollectionType),
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const anyFilter = search.trim() !== '' || type !== 'all';

  /** Anything that changes WHICH rows match returns to the first window — staying
   *  on page 5 of a result set that now has two pages shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: CollectionSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Count and recency read best largest/newest first; text ascends.
          { key, dir: key === 'productCount' || key === 'updatedAt' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: CollectionSort, label: string, extra = '') => (
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

  const open = (row: CollectionSummary, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.collection.detail', { id: row.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Collection list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search collections"
              placeholder="Search collections…"
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
            title="Add a collection — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('commerce.collection.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add a collection</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={type}
              onValueChange={(next) => {
                setType(next ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by how the collection fills"
            >
              {TYPE_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            title="Could not load your collections"
            description="Something went wrong reaching the server. It may be temporary — try again in a moment."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={anyFilter}
            noResults={{
              icon: <Layers className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              description: 'Try a different word, or switch the filter back to All.',
            }}
            firstRun={{
              title: 'No collections yet',
              description:
                'A collection is a themed group of products you show together — a sale, a gift guide, new arrivals. Add your first one to get started.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Name')}
                {header('type', 'How it fills', 'hidden @lg:table-cell')}
                <th>State</th>
                {header('productCount', 'Products', 'text-right')}
                {header('updatedAt', 'Updated', 'hidden text-right @2xl:table-cell')}
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
                    open(row, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open(row, event);
                  }}
                >
                  <td className="max-w-64 truncate font-medium">{row.name}</td>
                  <td className="hidden @lg:table-cell">
                    {row.type === 'rules' ? 'Automatic' : 'Hand-picked'}
                  </td>
                  <td>
                    {row.featured ? (
                      <Badge color="warning" variant="soft" size="sm">
                        Featured
                      </Badge>
                    ) : (
                      <Badge color="neutral" variant="soft" size="sm">
                        Standard
                      </Badge>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{String(row.productCount)}</td>
                  <td className="hidden text-right text-sm tabular-nums @2xl:table-cell">
                    {formatUpdated(row.updatedAt)}
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
