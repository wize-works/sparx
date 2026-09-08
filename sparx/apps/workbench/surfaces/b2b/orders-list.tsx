'use client';

// Wholesale orders — orders placed by the businesses you supply.
//
// These are the same orders the commerce Orders list shows, narrowed to buyers
// who belong to a trade account: bulk buys on agreed prices and terms rather
// than a card at checkout. Opening one shows the full order — the shared order
// detail — because an order is an order whichever door it came through.
//
// When opened from an account (`accountId` param) the list is pinned to that one
// business, with a chip saying so and a way back to all of them.

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
import { ShoppingCart, X } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  customerName,
  formatDate,
  formatMoney,
  paymentState,
  shippingState,
  useWholesaleOrders,
  type Order,
} from './orders-data';
import { RowOpenHint } from '../../components/row-open-hint';

const FILTERS = [
  { value: 'all', label: 'All', status: undefined, paymentStatus: undefined },
  { value: 'unpaid', label: 'Not paid', status: undefined, paymentStatus: 'unpaid' },
  { value: 'to_send', label: 'To send', status: 'placed', paymentStatus: undefined },
  { value: 'sent', label: 'On the way', status: 'fulfilled', paymentStatus: undefined },
  { value: 'delivered', label: 'Delivered', status: 'delivered', paymentStatus: undefined },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function WholesaleOrdersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const accountId = typeof ctx.params.accountId === 'string' ? ctx.params.accountId : undefined;
  const accountName =
    typeof ctx.params.accountName === 'string' ? ctx.params.accountName : undefined;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;
  const narrowed = filter !== 'all' || search.trim() !== '';

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useWholesaleOrders({
    q: search.trim(),
    status: active.status,
    paymentStatus: active.paymentStatus,
    accountId,
    sortBy: 'placedAt',
    order: 'desc',
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (order: Order, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.order.detail', { id: order.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Wholesale order controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search wholesale orders"
              placeholder="Order number or company…"
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
            <Filter
              color="module"
              value={filter}
              onValueChange={(next) => {
                setFilter((next as FilterValue | null) ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter wholesale orders"
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

      {accountId && accountName ? (
        <div className="flex items-center gap-2">
          <Badge color="module" variant="soft">
            {accountName}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            onClick={() => {
              ctx.open('b2b.orders.list', {}, { target: 'replace' });
            }}
          >
            <X className="size-4" aria-hidden />
            Show all wholesale orders
          </Button>
        </div>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<ShoppingCart className="size-6" aria-hidden />}
            title="Could not load your wholesale orders"
            description="This is a problem reaching the server. Your orders are unaffected — nothing has been lost."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading orders…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="size-6" aria-hidden />}
            title={narrowed ? 'No orders match that' : 'No wholesale orders yet'}
            description={
              narrowed
                ? 'Try a different word, or switch back to All to see every wholesale order.'
                : accountName
                  ? `${accountName} hasn't placed any orders yet. When they do, it'll show up here.`
                  : 'When a business you supply places an order, it shows up here with what they bought and what they owe.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Order</th>
                <th className="hidden @lg:table-cell">Business</th>
                <th className="hidden text-sm @2xl:table-cell">Placed</th>
                <th>Payment</th>
                <th className="hidden @xl:table-cell">Delivery</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const paid = paymentState(order);
                const shipped = shippingState(order);
                return (
                  <tr
                    key={order.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(order, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(order, event);
                    }}
                  >
                    <td className="font-mono text-sm">{order.orderNumber}</td>
                    <td className="hidden max-w-48 truncate @lg:table-cell">
                      {customerName(order.customer)}
                    </td>
                    <td className="hidden text-sm @2xl:table-cell">{formatDate(order.placedAt)}</td>
                    <td>
                      <Badge color={paid.tone} variant="soft" size="sm">
                        {paid.label}
                      </Badge>
                    </td>
                    <td className="hidden @xl:table-cell">
                      <Badge color={shipped.tone} variant="soft" size="sm">
                        {shipped.label}
                      </Badge>
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {formatMoney(order.total, order.currency)}
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
