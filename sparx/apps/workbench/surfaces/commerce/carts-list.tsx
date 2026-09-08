'use client';

// Carts — orders someone started but hasn't paid for, including the ones they
// walked away from.
//
// A cart is filled by a shopper, never by staff, so this is a read view. The one
// question it is opened to answer is "who nearly bought, and didn't?" — so the
// filter chips split live carts from the ones that were abandoned and the ones
// that came back. Each chip maps to ONE server filter, so what is on screen is
// always exactly one server answer.

import { useState } from 'react';
import { Badge, Card, EmptyState, Filter, FilterItem, Table } from '@wizeworks/silicaui-react';
import { ShoppingCart } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatMoney, formatDateTime } from './data';
import {
  cartShopperName,
  cartStateFrom,
  useCarts,
  type CartFilter,
  type CartRow,
} from './carts-data';
import { RowOpenHint } from '../../components/row-open-hint';

const FILTERS = [
  { value: 'active', label: 'In progress' },
  { value: 'abandoned', label: 'Walked away' },
  { value: 'recovered', label: 'Came back' },
] as const satisfies readonly { value: CartFilter; label: string }[];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CartsListSurface({ ctx }: { ctx: SurfaceContext }) {
  // Abandoned carts are the reason anyone opens this — recovering a sale is the
  // whole point — so that is where the list starts.
  const [filter, setFilter] = useState<CartFilter>('abandoned');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useCarts({
    filter,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (row: CartRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.cart.detail', { id: row.id }, { target: targetFor(event) });
  };

  const emptyBody: Record<CartFilter, string> = {
    active: 'No one is filling a cart right now. Live carts appear here as shoppers add things.',
    abandoned:
      'No abandoned carts at the moment. When a shopper fills a cart and leaves without paying, it lands here so you can follow it up.',
    recovered:
      'No recovered carts yet — these are the abandoned ones a shopper came back to finish.',
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Carts list controls"
        controls={
          <>
            <Filter
              color="module"
              value={filter}
              onValueChange={(next) => {
                setFilter((next as CartFilter | null) ?? 'abandoned');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter carts"
            >
              {FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
                </FilterItem>
              ))}
            </Filter>
          </>
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={<ShoppingCart className="size-6" aria-hidden />}
            title="Could not load your carts"
            description="This is a problem reaching the server. Your carts are unaffected — nothing has been lost."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading carts…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="size-6" aria-hidden />}
            title="Nothing here"
            description={emptyBody[filter]}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Shopper</th>
                <th className="text-right @lg:text-left">Items</th>
                <th className="hidden @2xl:table-cell">Last active</th>
                <th className="hidden @xl:table-cell">State</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = cartStateFrom(row);
                return (
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
                    <td className="max-w-48 truncate">{cartShopperName(row.customer)}</td>
                    <td className="text-right tabular-nums @lg:text-left">{row.itemCount}</td>
                    <td className="hidden text-sm @2xl:table-cell">
                      {formatDateTime(row.updatedAt)}
                    </td>
                    <td className="hidden @xl:table-cell">
                      <Badge color={state.tone} variant="soft" size="sm">
                        {state.label}
                      </Badge>
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {formatMoney(row.totalCents / 100, row.currency)}
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
