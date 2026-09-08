'use client';

// Orders — every sale, and what still needs doing about it.
//
// Two things shape this beyond a plain table.
//
// FIRST: an order carries TWO states, not one. Has it been paid for, and has it
// been sent — stored as independent columns because they genuinely are. So the
// table shows both, and the filter chips are phrased as the work rather than as
// the enum: "Not paid" and "To send" are the two questions this list gets opened
// to answer, and neither is a single status value.
//
// SECOND: it lives in a pane of unknown width — 320px beside an order, or the
// whole window. Columns disclose with @container, never a viewport query: pane
// width and screen width are unrelated here, and a viewport breakpoint leaves a
// narrow pane on a wide monitor rendering six columns into 300px.

import { useState } from 'react';
import { Badge, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, ShoppingBag } from 'lucide-react';
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
  useOrders,
  type Order,
  type OrderSortKey,
  type SortDirection,
} from './data';
import { RowOpenHint } from '../../components/row-open-hint';

/**
 * The chips are work states, not status values.
 *
 * Each maps to ONE server filter, so what is on screen is always exactly one
 * server answer — no chip means "these two statuses, sort of". "Refunded" is
 * deliberately absent as a chip: it is rare, it is visible on any row it applies
 * to, and a sixth chip costs every operator a wider bar forever to save a few
 * people one search.
 */
const FILTERS = [
  { value: 'all', label: 'All', status: undefined, paymentStatus: undefined },
  { value: 'unpaid', label: 'Not paid', status: undefined, paymentStatus: 'unpaid' },
  { value: 'to_send', label: 'To send', status: 'placed', paymentStatus: undefined },
  { value: 'sent', label: 'On the way', status: 'fulfilled', paymentStatus: undefined },
  { value: 'delivered', label: 'Delivered', status: 'delivered', paymentStatus: undefined },
  { value: 'cancelled', label: 'Cancelled', status: 'cancelled', paymentStatus: undefined },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

/**
 * What to try when nothing matched — naming ONLY what is actually narrowing the
 * list. Telling someone to clear a filter they never set sends them looking for
 * a control that is already off, and a search box they did not type in.
 */
function emptyAdvice(search: string, filterLabel: string | null): string {
  const parts: string[] = [];
  if (search) {
    parts.push('Try part of an order number, or the customer’s name, company or email.');
  }
  if (filterLabel) {
    parts.push(
      `You are only seeing orders marked “${filterLabel}” — switch back to All for the rest.`
    );
  }
  return parts.join(' ');
}

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function OrdersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  // Newest first: an orders list is read from the top, and the top is today.
  const [sort, setSort] = useState<{ key: OrderSortKey; dir: SortDirection }>({
    key: 'placedAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  // How many rows the current window has grown to. "Load more" raises this;
  // anything that changes WHICH rows match resets it.
  const [take, setTake] = useState<number>(50);

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;
  const filtered = filter !== 'all' || search.trim() !== '';

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useOrders({
    q: search.trim(),
    status: active.status,
    paymentStatus: active.paymentStatus,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  /** Anything that changes which rows match returns to the first window —
   *  staying on page 5 of a result set that now has two pages shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: OrderSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Both default to descending, because both useful questions are
          // "the most" — the newest orders and the biggest ones.
          { key, dir: 'desc' }
    );
    resetWindow();
  };

  const header = (key: OrderSortKey, label: string, extra = '') => (
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

  const open = (order: Order, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.order.detail', { id: order.id }, { target: targetFor(event) });
  };

  return (
    // Surfaces, not one slab: the pane is base-200, the toolbar and table are
    // base-100 cards lifted onto it. The gutter shrinks to nothing under 30rem —
    // in a pane docked beside an order, 12px a side is real column width.
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Order list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search orders"
              placeholder="Order number or customer…"
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
            label: 'Show',
            key: 'status',
            value: filter,
            onValueChange: (next) => {
              setFilter((next as FilterValue | null) ?? 'all');
              resetWindow();
            },
            options: FILTERS.map((entry) => ({ value: entry.value, label: entry.label })),
            neutralValue: 'all',
          },
        ]}
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
            icon={<ShoppingBag className="size-6" aria-hidden />}
            title="Could not load your orders"
            description="This is a problem reaching the server. Your orders are unaffected — nothing has been lost."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading orders…
          </p>
        ) : rows.length === 0 ? (
          // "Nothing matches" and "you have none" are different facts, and
          // telling someone to wait for their first sale when they have four
          // hundred and mistyped a name is the worse of the two mistakes.
          <EmptyState
            icon={<ShoppingBag className="size-6" aria-hidden />}
            title={filtered ? 'No orders match that' : 'No orders yet'}
            description={
              filtered
                ? emptyAdvice(search.trim(), filter === 'all' ? null : active.label)
                : 'When someone buys from you, the order shows up here with what they bought and what they owe.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Order</th>
                <th className="hidden @lg:table-cell">Customer</th>
                {/* @3xl, not @2xl. Six columns need ~719px and @2xl let the sixth
                    in at 672, so a docked pane rendered all of them and pushed the
                    TOTAL off the right edge. Placed was already the last column to
                    appear, so it is the one that waits a step longer. */}
                {header('placedAt', 'Placed', 'hidden @3xl:table-cell')}
                <th>Payment</th>
                <th className="hidden @xl:table-cell">Delivery</th>
                {header('total', 'Total', 'text-right')}
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
                    {/* An order number is one token and must never be broken
                        across lines. Auto table layout hands this column what is
                        left after the others take theirs, and in a docked pane
                        that was 83px — enough to render "O-000016" as "O-" over
                        "000016". The identifier is what a row is read by, so it
                        claims its width; the wrapper scrolls if the table ever
                        genuinely outgrows the pane. */}
                    <td className="font-mono text-sm whitespace-nowrap">{order.orderNumber}</td>
                    <td className="hidden max-w-48 truncate @lg:table-cell">
                      {customerName(order.customer)}
                    </td>
                    <td className="hidden text-sm @3xl:table-cell">{formatDate(order.placedAt)}</td>
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
            three modifiers do not exist. */}
        <RowOpenHint />
      </div>
    </div>
  );
}
