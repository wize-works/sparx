'use client';

// The discounts list.
//
// The workbench table standard (the same shape as the invoicing list): a real
// <Table> with sortable headers backed by SERVER-SIDE sort, server-side paging
// via <ListPagination>, and columns that disclose progressively with @container
// so a narrow docked pane never crushes six columns into 300px.
//
// Each row still carries what actually distinguishes one discount from another,
// in the owner's words: whether it is a CODE shoppers type or an AUTOMATIC one,
// what it takes off, and — the fact people scan this list for — whether it is
// working right now, scheduled, or ended.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Percent, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { formatCents } from './products-data';
import {
  discountState,
  useDiscountsList,
  type DiscountRow,
  type DiscountSort,
  type SortDir,
} from './discounts-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** What this discount takes off, in the shopper's terms. */
function valueLabel(row: DiscountRow): string {
  switch (row.type) {
    case 'percent':
      return row.valuePercent === null ? 'Percentage off' : `${String(row.valuePercent)}% off`;
    case 'fixed':
      return row.valueCents === null
        ? 'Amount off'
        : `${formatCents(row.valueCents, row.currency ?? 'USD')} off`;
    case 'free_shipping':
      return 'Free delivery';
    case 'buy_x_get_y':
      return 'Buy one, get one';
    case 'bundle':
      return 'Bundle deal';
    default:
      return '';
  }
}

/** "Changed 3 days ago" style, plain and non-technical. */
function whenChanged(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${String(days)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function DiscountsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  // Most recently changed first — the natural "what have I been working on"
  // default for a management list.
  const [sort, setSort] = useState<{ key: DiscountSort; dir: SortDir }>({
    key: 'updatedAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useDiscountsList({
    q: search,
    status,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const anyFilter = search.trim() !== '' || status !== 'all';

  /** Anything that changes which rows match returns to the first window. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: DiscountSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Text ascends; the date column descends (newest first is the useful start).
          { key, dir: key === 'updatedAt' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: DiscountSort, label: string, extra = '') => (
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
    ctx.open('commerce.discount.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Discount list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search discounts"
              placeholder="Search by name or code…"
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
            title="Add a discount — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('commerce.discount.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add a discount</span>
          </Button>
        }
        controls={
          <>
            <div className="hidden w-40 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show which discounts"
                value={status}
                items={{
                  all: 'All discounts',
                  active: 'Switched on',
                  draft: 'Switched off',
                  archived: 'Retired',
                }}
                onValueChange={(next) => {
                  setStatus(next as string);
                  resetWindow();
                }}
              />
            </div>
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
        {error ? (
          <EmptyState
            icon={<Percent className="size-6" aria-hidden />}
            title="Could not load your discounts"
            description="Something went wrong reaching the server. It may be temporary — try again in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading discounts…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={anyFilter}
            noResults={{
              icon: <Percent className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              description: 'Try a different word, or switch the filters back to All.',
            }}
            firstRun={{
              title: 'No discounts yet',
              description:
                'A discount reduces the price at checkout — with a code shoppers type, or automatically on any order that qualifies. Add your first one to get started.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Name')}
                {header('code', 'Code')}
                {/* The "takes off" value is a mix of percentages, fixed amounts
                    and free-delivery, so there is no one column to order it by —
                    it stays a plain, unsorted cell. */}
                <th className="hidden @lg:table-cell">Takes off</th>
                {header('status', 'State')}
                {header('updatedAt', 'Changed', 'hidden @2xl:table-cell text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = discountState(row);
                return (
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
                    <td className="max-w-56 truncate font-medium">{row.name}</td>
                    <td>
                      {row.code ? (
                        <Badge color="neutral" variant="soft" size="sm" className="font-mono">
                          {row.code}
                        </Badge>
                      ) : (
                        <Badge color="info" variant="soft" size="sm">
                          Automatic
                        </Badge>
                      )}
                    </td>
                    <td className="hidden text-sm @lg:table-cell">{valueLabel(row)}</td>
                    <td>
                      <Badge color={state.tone} variant="soft" size="sm" title={state.detail}>
                        {state.label}
                      </Badge>
                    </td>
                    <td className="hidden text-right text-sm @2xl:table-cell">
                      {whenChanged(row.updatedAt)}
                    </td>
                  </tr>
                );
              })}
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
