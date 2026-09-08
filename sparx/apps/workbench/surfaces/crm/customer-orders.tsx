'use client';

// Customer orders — the same orders as Selling, seen from the customer's side.
//
// This is Commerce data inside the CRM module, so it does two things carefully:
// it does NOT re-model an order (it reuses the commerce order data layer whole,
// and opens the real order detail on click), and it wears the COMMERCE hue via a
// nested ModuleScope so the rows read as Selling even though the CRM chrome
// stays. There is no "new order" here — orders are placed at checkout, never
// typed up in the CRM.

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
import { Receipt } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import {
  customerName,
  formatDate,
  formatMoney,
  shippingState,
  useOrders,
  type Order,
} from '../commerce/data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const STATUS_ITEMS: Record<string, string> = {
  all: 'All orders',
  placed: 'Placed',
  fulfilled: 'Fulfilled',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function CustomerOrdersSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useOrders({
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(status === 'all' ? {} : { status }),
    sortBy: 'placedAt',
    order: 'desc',
    take: 100,
    skip: 0,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || status !== 'all';

  const open = (order: Order, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.order.detail', { id: order.id }, { target: targetFor(event) });
  };

  return (
    // The whole surface wears the Commerce hue: this is Selling's data, and the
    // one signal that says so is the module color on its controls.
    <ModuleScope module="commerce" className="h-full">
      <div className={PANE_SHELL}>
        <PaneToolbar
          label="Customer order list controls"
          search={
            <div className="max-w-xs min-w-0 flex-1">
              <SearchInput
                color="module"
                size="sm"
                aria-label="Search orders"
                placeholder="Search by order number…"
                value={search}
                onValueChange={setSearch}
              />
            </div>
          }
          controls={
            <>
              <div className="hidden w-40 shrink-0 @lg:block">
                <Select
                  color="module"
                  size="sm"
                  aria-label="Which orders to show"
                  value={status}
                  items={STATUS_ITEMS}
                  onValueChange={(next) => {
                    setStatus(next as string);
                  }}
                />
              </div>
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
          {isError ? (
            <EmptyState
              icon={<Receipt className="size-6" aria-hidden />}
              title="Could not load orders"
              description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : isPending ? (
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-6" aria-hidden />}
              title={filtered ? 'No orders match those filters' : 'No orders yet'}
              description={
                filtered
                  ? 'Try a different order number, or clear the filters to see them all.'
                  : 'Orders your customers place appear here. They are the same orders as in Selling, seen from the customer’s side.'
              }
            />
          ) : (
            <Table size="sm" hover>
              <thead>
                <tr>
                  <th>Order</th>
                  <th className="hidden @md:table-cell">Customer</th>
                  <th className="hidden @lg:table-cell">Placed</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = shippingState(row);
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
                      <td className="font-mono text-sm">{row.orderNumber}</td>
                      <td className="hidden @md:table-cell">{customerName(row.customer)}</td>
                      <td className="hidden text-sm @lg:table-cell">{formatDate(row.placedAt)}</td>
                      <td>
                        <Badge color={state.tone} variant="soft" size="sm">
                          {state.label}
                        </Badge>
                      </td>
                      <td className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(row.total, row.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="flex shrink-0 items-center justify-between px-1">
          <RowOpenHint />
          {typeof total === 'number' && !isPending ? (
            <p className="text-xs">
              {filtered
                ? `${rows.length.toLocaleString()} shown`
                : `${total.toLocaleString()} in total`}
            </p>
          ) : null}
        </div>
      </div>
    </ModuleScope>
  );
}
