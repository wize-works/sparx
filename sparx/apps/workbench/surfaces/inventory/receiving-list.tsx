'use client';

// RECEIVING — every delivery you have booked in, newest first.
//
// ── This one IS a table ───────────────────────────────────────────────────
//
// A receipt is a reference, an order, a place and a count on a day — several
// facts you scan down columns to answer "did that delivery come in?". Columns
// disclose with @container so a narrow pane keeps the reference, the order and
// when it landed.
//
// ── No status filter, because a receipt has no status ─────────────────────
//
// A receipt is posted in one go and is then a permanent record — there is no
// draft, no "pending", nothing to filter by. A correction is a later stock count,
// never an edit. So the toolbar narrows by search alone, and the primary action
// books a new delivery.

import { useState } from 'react';
import { Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { PackageCheck, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatDay } from './purchase-orders-data';
import { useReceipts, type GoodsReceipt } from './receiving-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function ReceivingListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useReceipts({
    q: search.trim(),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const searching = search.trim() !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (receipt: GoodsReceipt, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.receiving.detail', { id: receipt.id }, { target: targetFor(event) });
  };

  const startReceiving = () => {
    ctx.open('inventory.receiving.detail', { id: 'new' }, { target: 'tab' });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<PackageCheck className="size-6" aria-hidden />}
          title="Could not load your deliveries"
          description="This is a problem reaching the server. Your records are unaffected — the list just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading deliveries…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<PackageCheck className="size-6" aria-hidden />}
          title={searching ? 'No delivery matches that' : 'No deliveries booked in yet'}
          description={
            searching
              ? 'Try part of a receipt number, an order number, or a packing-slip reference.'
              : 'When goods arrive against a placed order, book them in here — that is the moment your stock numbers go up.'
          }
          actions={
            searching ? undefined : (
              <Button size="sm" color="module" onClick={startReceiving}>
                <Plus className="size-4" aria-hidden />
                Receive a delivery
              </Button>
            )
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Receipt</th>
            <th className="hidden @lg:table-cell">Order</th>
            <th className="hidden @xl:table-cell">Into</th>
            <th className="text-right whitespace-nowrap">Units</th>
            <th className="hidden whitespace-nowrap @2xl:table-cell">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((receipt) => (
            <tr
              key={receipt.id}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(receipt, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(receipt, event);
              }}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono font-medium">{receipt.number}</span>
                  <span className="truncate text-sm @lg:hidden">
                    {receipt.purchaseOrderNumber
                      ? `Order ${receipt.purchaseOrderNumber}`
                      : 'No order'}
                    {receipt.reference ? ` · ${receipt.reference}` : ''}
                  </span>
                </span>
              </td>
              <td className="hidden font-mono @lg:table-cell">
                {receipt.purchaseOrderNumber ?? '—'}
              </td>
              <td className="hidden max-w-40 truncate @xl:table-cell">
                {receipt.warehouseName ?? '—'}
              </td>
              <td className="text-right font-medium tabular-nums">{receipt.quantityReceived}</td>
              <td className="hidden whitespace-nowrap @2xl:table-cell">
                {formatDay(receipt.receivedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Receiving list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search deliveries"
              placeholder="Receipt, order or packing slip…"
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
            onClick={startReceiving}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Receive a delivery</span>
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
