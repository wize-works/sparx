'use client';

// PURCHASE ORDERS — what you have ordered from suppliers, and what is still due.
//
// ── This one IS a table ───────────────────────────────────────────────────
//
// Each row carries several numbers you compare down a column — the total, how
// much is still outstanding, when it is due — and the whole job of the screen is
// scanning those. That is the case the house rule keeps for a table. Columns
// disclose with @container so a pane docked narrow still shows what matters: the
// order, who it is with, and its state.
//
// ── Every narrowing is a SERVER filter ────────────────────────────────────
//
// Search, the status filter and the supplier filter all go to the API. "What is
// outstanding from ACME" cannot be answered by sieving one loaded page — it would
// report only whichever ACME orders happen to be in hand.

import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Card,
  NativeSelect,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { ClipboardList, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents } from './data';
import { useSuppliers } from './suppliers-data';
import {
  formatDay,
  outstandingUnits,
  purchaseOrderState,
  usePurchaseOrders,
  type PurchaseOrder,
} from './purchase-orders-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The states a buyer filters by, in shop words. Values are the stored status. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any state' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Placed' },
  { value: 'partial', label: 'Partly received' },
  { value: 'received', label: 'Received' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function PurchaseOrdersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const suppliers = useSuppliers({ includeArchived: false, take: 250, skip: 0 });
  const supplierList = suppliers.data?.items ?? [];
  const supplierName = supplierList.find((supplier) => supplier.id === supplierId)?.name ?? null;
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === status)?.label ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = usePurchaseOrders({
    q: search.trim(),
    ...(status ? { status } : {}),
    ...(supplierId ? { supplierId } : {}),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || status !== '' || supplierId !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (po: PurchaseOrder, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.purchase-orders.detail', { id: po.id }, { target: targetFor(event) });
  };

  const emptyAdvice = () => {
    const parts: string[] = [];
    if (search.trim())
      parts.push('Try part of an order number, your reference, or a supplier name.');
    if (statusLabel && status)
      parts.push(`You are only seeing orders that are ${statusLabel.toLowerCase()}.`);
    if (supplierName) parts.push(`You are only seeing orders to ${supplierName}.`);
    return parts.join(' ');
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<ClipboardList className="size-6" aria-hidden />}
          title="Could not load your purchase orders"
          description="This is a problem reaching the server. Your orders are unaffected — the list just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading purchase orders…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <ClipboardList className="size-6" aria-hidden />,
            title: 'No orders match that',
            description: emptyAdvice(),
          }}
          firstRun={{
            title: 'No purchase orders yet',
            description:
              'A purchase order is what you send a supplier to buy stock. Start one, add the items and quantities, and place it when you are ready.',
            actions: (
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  ctx.open('inventory.purchase-orders.detail', { id: 'new' }, { target: 'tab' });
                }}
              >
                <Plus className="size-4" aria-hidden />
                New purchase order
              </Button>
            ),
          }}
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Order</th>
            <th className="hidden @lg:table-cell">Supplier</th>
            <th className="text-right whitespace-nowrap">Total</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Still due</th>
            <th className="hidden @2xl:table-cell">Expected</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((po) => {
            const state = purchaseOrderState(po);
            const outstanding = outstandingUnits(po);
            return (
              <tr
                key={po.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(po, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(po, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono font-medium">{po.number}</span>
                    {/* Below @lg the supplier column is gone, so it rides here —
                        an order without a supplier is not an answer. */}
                    <span className="truncate text-sm @lg:hidden">
                      {po.supplierName ?? 'No supplier'}
                    </span>
                    {po.reference ? (
                      <span className="truncate text-sm">Ref {po.reference}</span>
                    ) : null}
                  </span>
                </td>
                <td className="hidden max-w-48 truncate @lg:table-cell">
                  {po.supplierName ?? '—'}
                </td>
                <td className="text-right font-medium whitespace-nowrap tabular-nums">
                  {formatCents(po.totalCents, po.currency)}
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums @xl:table-cell">
                  {outstanding > 0 ? outstanding : '—'}
                </td>
                <td className="hidden whitespace-nowrap @2xl:table-cell">
                  {po.expectedArrivalAt ? formatDay(po.expectedArrivalAt) : '—'}
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
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Purchase order list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search purchase orders"
              placeholder="Order number, reference or supplier…"
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
            size="sm"
            color="module"
            className="ml-auto shrink-0 whitespace-nowrap"
            onClick={() => {
              ctx.open('inventory.purchase-orders.detail', { id: 'new' }, { target: 'tab' });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New order</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-36 shrink"
              aria-label="Filter by state"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                resetWindow();
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Filter by supplier"
              value={supplierId}
              onChange={(event) => {
                setSupplierId(event.target.value);
                resetWindow();
              }}
            >
              <option value="">Any supplier</option>
              {supplierList.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </NativeSelect>
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

      <Card className="min-h-0 flex-1 overflow-y-auto">{body()}</Card>

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
        {rows.length > 0 ? <RowOpenHint /> : null}
      </div>
    </div>
  );
}
