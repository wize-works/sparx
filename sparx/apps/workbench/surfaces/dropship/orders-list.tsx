'use client';

// Supplier orders — the orders that were passed to a supplier to ship.
//
// When a customer buys a dropshipped product, their order is routed to the
// supplier who holds it, creating a SUPPLIER ORDER: the supplier's own copy of
// what to pack, where to send it, and — once they post it — the tracking. This
// list is where you watch that happen and catch the ones that went wrong.
//
// A standard list surface like invoicing: a real <Table>, sortable headers
// backed by SERVER-SIDE sort, server-side paging via <ListPagination>. Columns
// disclose progressively with @container because the pane's width is unknown.
//
// The "Customer order" column references YOUR commerce order — another module's
// data — so it wears commerce's hue via a nested module scope, the house rule
// for surfacing a second module's functionality on a page.

import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Truck } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import {
  orderState,
  useDropshipOrders,
  useSuppliers,
  type DropshipOrder,
  type OrderSort,
  type SortDir,
} from './dropship-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function itemCount(order: DropshipOrder): number {
  return order.lineItems.reduce(
    (sum, li) => sum + (typeof li.quantity === 'number' ? li.quantity : 0),
    0
  );
}

export function DropshipOrdersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [status, setStatus] = useState('all');
  const [supplierId, setSupplierId] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: OrderSort; dir: SortDir }>({
    key: 'createdAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const suppliers = useSuppliers();
  const supplierList = useMemo(() => suppliers.data?.items ?? [], [suppliers.data]);
  const supplierName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of supplierList) map.set(s.id, s.name);
    return map;
  }, [supplierList]);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useDropshipOrders({
    status,
    supplierId: supplierId === 'all' ? undefined : supplierId,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  // The endpoint has no free-text search (a supplier order has no name), so the
  // search box filters the loaded window by supplier / reference / tracking. It
  // is a convenience over what is on screen, not the primary way through the
  // list — the supplier + status filters and sort are the server-backed ones.
  const allRows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total;
  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      needle
        ? allRows.filter((o) => {
            const name = supplierName.get(o.supplierId) ?? '';
            return (
              name.toLowerCase().includes(needle) ||
              (o.orderNumber ?? '').toLowerCase().includes(needle) ||
              (o.supplierOrderId ?? '').toLowerCase().includes(needle) ||
              (o.trackingNumber ?? '').toLowerCase().includes(needle)
            );
          })
        : allRows,
    [allRows, needle, supplierName]
  );

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: OrderSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'createdAt' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: OrderSort, label: string, extra = '') => (
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
    ctx.open('dropship.order.detail', { id }, { target: targetFor(event) });
  };

  const anyFilter = needle !== '' || status !== 'all' || supplierId !== 'all';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Supplier order controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search supplier orders"
              placeholder="Search order or tracking…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        controls={
          <>
            {supplierList.length > 1 ? (
              <div className="hidden w-44 shrink-0 @2xl:block">
                <Select
                  size="sm"
                  aria-label="Which supplier"
                  value={supplierId}
                  items={{
                    all: 'All suppliers',
                    ...Object.fromEntries(supplierList.map((s) => [s.id, s.name])),
                  }}
                  onValueChange={(next) => {
                    setSupplierId(next as string);
                    resetWindow();
                  }}
                />
              </div>
            ) : null}
            <div className="hidden w-44 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show which orders"
                value={status}
                items={{
                  all: 'All orders',
                  pending: 'Waiting to be sent',
                  submitted: 'Sent to supplier',
                  shipped: 'Shipped',
                  delivered: 'Delivered',
                  failed: 'Could not be sent',
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
            className="ml-auto"
            isFetching={isFetching || suppliers.isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
              void suppliers.refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={<Truck className="size-6" aria-hidden />}
            title="Could not load supplier orders"
            description="Something went wrong reaching the server. Try again in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading supplier orders…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Truck className="size-6" aria-hidden />}
            title={anyFilter ? 'No orders match those filters' : 'No supplier orders yet'}
            description={
              anyFilter
                ? 'Try a different word, or switch the filters back to All.'
                : 'When a customer buys a product one of your suppliers ships, the order is routed to that supplier and appears here with its tracking. Nothing has been routed yet.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Customer order</th>
                {header('supplierId', 'Supplier', 'hidden @lg:table-cell')}
                <th className="hidden @2xl:table-cell">Tracking</th>
                {header('createdAt', 'Placed', 'hidden @xl:table-cell')}
                {header('status', 'Status')}
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const state = orderState(order.status);
                const count = itemCount(order);
                return (
                  <tr
                    key={order.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(order.id, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(order.id, event);
                    }}
                  >
                    <td>
                      {/* The commerce order reference wears commerce's hue —
                          it is another module's record surfaced here. */}
                      <ModuleScope module="commerce">
                        <span className="text-module font-mono font-medium">
                          {order.orderNumber ? `#${order.orderNumber}` : 'Order'}
                        </span>
                      </ModuleScope>
                      {count > 0 ? (
                        <span className="text-sm">
                          {' '}
                          · {count === 1 ? '1 item' : `${count} items`}
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden max-w-40 truncate @lg:table-cell">
                      {supplierName.get(order.supplierId) ?? 'Unknown supplier'}
                    </td>
                    <td className="hidden @2xl:table-cell">
                      {order.trackingNumber ? (
                        <Badge color="neutral" variant="soft" size="sm" className="font-mono">
                          {order.trackingNumber}
                        </Badge>
                      ) : (
                        <span className="text-sm">—</span>
                      )}
                    </td>
                    <td className="hidden text-sm @xl:table-cell">
                      <Timestamp value={order.createdAt} format="relative" />
                    </td>
                    <td>
                      <Badge color={state.tone} variant="soft" size="sm">
                        {state.label}
                      </Badge>
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
          total={needle ? undefined : total}
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
        <RowOpenHint what="an order to see its items and tracking" />
      </div>
    </div>
  );
}
