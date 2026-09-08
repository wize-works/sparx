'use client';

// TRANSFERS — stock on its way from one of your locations to another.
//
// ── Why this is a table ──────────────────────────────────────────────────
//
// A transfer is a document with a reference, a route, a count and a state, and
// this list is the register of them — the same shape as a list of invoices or
// orders. You scan down the status column for what needs sending or receiving,
// and down the route column for a location. Cards would turn that scan into a
// read of one card at a time. The columns disclose with @container so a pane
// docked narrow still shows the two that matter — which transfer, and where it
// is in its life.
//
// ── Every narrowing is a SERVER param ────────────────────────────────────
//
// Search, the status filter, the location filter and the paging all go to the
// API. Filtering the loaded page in the browser would answer "what is in
// transit" with "the in-transit ones among the fifty rows in hand".
//
// ── Different empty states are different problems ─────────────────────────
//
// Nothing matches the search or filters · nothing has ever been transferred.
// Telling someone to make their first transfer when they have forty and picked
// the wrong status is the worse mistake.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { ArrowLeftRight, ArrowRight, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { useStockLocations } from './data';
import {
  plural,
  transferState,
  useTransfers,
  warehouseLabel,
  type TransferRow,
  type TransferStatus,
} from './transfers-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { RowOpenHint } from '../../components/row-open-hint';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const STATUS_OPTIONS: { value: TransferStatus; label: string }[] = [
  { value: 'draft', label: 'Draft — not sent yet' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** What to try when nothing matched — naming only what is actually narrowing. */
function emptyAdvice(
  search: string,
  statusLabel: string | null,
  locationName: string | null
): string {
  const parts: string[] = [];
  if (search) parts.push('Try part of a transfer reference or a location name.');
  if (statusLabel) parts.push(`You are only seeing ${statusLabel.toLowerCase()} transfers.`);
  if (locationName) parts.push(`You are only seeing transfers touching ${locationName}.`);
  return parts.join(' ');
}

export function TransfersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TransferStatus | ''>('');
  const [locationId, setLocationId] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === status)?.label ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useTransfers({
    q: search.trim(),
    ...(status ? { status } : {}),
    ...(locationId ? { warehouseId: locationId } : {}),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || status !== '' || locationId !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openNew = () => {
    ctx.open('inventory.transfers.detail', { id: 'new' }, { target: 'tab' });
  };

  const open = (transfer: TransferRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.transfers.detail', { id: transfer.id }, { target: targetFor(event) });
  };

  const body = () => {
    // A failed load REPLACES the table — never an empty grid under live filters,
    // which reads as "you have no transfers".
    if (isError) {
      return (
        <EmptyState
          icon={<ArrowLeftRight className="size-6" aria-hidden />}
          title="Could not load your transfers"
          description="This is a problem reaching the server. Your transfers are unaffected — they just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading transfers…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <ArrowLeftRight className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: emptyAdvice(search.trim(), statusLabel, locationName),
          }}
          firstRun={{
            title: 'No stock has been moved between locations yet',
            description:
              'A transfer moves stock from one of your locations to another and keeps a record of it in motion. Start one when you need to send stock somewhere else.',
            actions: (
              <Button size="sm" color="module" onClick={openNew}>
                <Plus className="size-4" aria-hidden />
                New transfer
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
            <th>Reference</th>
            <th className="hidden @lg:table-cell">Route</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Items</th>
            <th className="hidden whitespace-nowrap @2xl:table-cell">Started</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((transfer) => {
            const state = transferState(transfer.status);
            const from = warehouseLabel(transfer.fromWarehouseName, transfer.fromWarehouseCode);
            const to = warehouseLabel(transfer.toWarehouseName, transfer.toWarehouseCode);
            return (
              <tr
                key={transfer.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(transfer, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(transfer, event);
                }}
              >
                {/* `max-w-0 w-full` makes this the cell that GIVES, so the state
                    badge on the right is never the column pushed off a narrow
                    pane. */}
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono font-medium">{transfer.number}</span>
                    {/* Below @lg the Route column is gone, so the route comes
                        back here — a transfer without its two ends is not an
                        answer. */}
                    <span className="flex min-w-0 items-center gap-1 truncate text-sm @lg:hidden">
                      {from}
                      <ArrowRight className="size-3 shrink-0" aria-hidden />
                      {to}
                    </span>
                  </span>
                </td>
                <td className="hidden max-w-64 @lg:table-cell">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <span className="truncate">{from}</span>
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{to}</span>
                  </span>
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums @xl:table-cell">
                  {transfer.lineCount === 0
                    ? 'None yet'
                    : `${plural(transfer.lineCount, 'item', 'items')} · ${String(
                        transfer.totalQuantity
                      )}`}
                </td>
                <td className="hidden whitespace-nowrap @2xl:table-cell">
                  <Text className="text-sm">
                    <Timestamp value={transfer.createdAt} format="relative" />
                  </Text>
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
        label="Transfer list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search transfers"
              placeholder="Reference or location…"
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
            onClick={openNew}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New transfer</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="Show transfers in state"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as TransferStatus | '');
                resetWindow();
              }}
            >
              <option value="">Any state</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show transfers touching"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                resetWindow();
              }}
            >
              <option value="">Any location</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
            {/* ALWAYS the last child of a list toolbar — see RefreshButton. */}
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

      {/* Full width — matches the house list convention: the table fills the pane. */}
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
