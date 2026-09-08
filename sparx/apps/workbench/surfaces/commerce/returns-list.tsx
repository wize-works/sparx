'use client';

// Returns — everything a customer has asked to send back, and what it still
// needs from you.
//
// The list is opened to answer one question above all: what needs a decision
// right now? So the filter chips are phrased as the work — "Needs a decision",
// "Coming back", "To settle" — not as the nine raw statuses the server stores.
// Each chip maps to ONE server status so what is on screen is always exactly one
// server answer, never a client-side guess across a paged window.
//
// There is no search box: the returns endpoint has nothing to search on (a
// return keys on its order, which the row already shows), and a box that filters
// only the loaded page would lie on a list that pages.

import { useState } from 'react';
import { Badge, Card, EmptyState, Filter, FilterItem, Table } from '@wizeworks/silicaui-react';
import { Undo2 } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatDate } from './data';
import {
  outcomeLabel,
  returnState,
  useReturns,
  type ReturnStatus,
  type ReturnSummary,
} from './returns-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** The chips are stages of the work, each pinned to ONE server status. "All"
 *  drops the filter entirely. */
const FILTERS = [
  { value: 'all', label: 'All', status: undefined },
  { value: 'requested', label: 'Needs a decision', status: 'requested' },
  { value: 'approved', label: 'Approved', status: 'approved' },
  { value: 'received', label: 'Back with you', status: 'received' },
  { value: 'inspected', label: 'Ready to settle', status: 'inspected' },
  { value: 'refunded', label: 'Settled', status: 'refunded' },
  { value: 'denied', label: 'Turned down', status: 'denied' },
] as const satisfies readonly { value: string; label: string; status: ReturnStatus | undefined }[];

type FilterValue = (typeof FILTERS)[number]['value'];

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function ReturnsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;
  const filtered = filter !== 'all';

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useReturns({
    status: active.status,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (row: ReturnSummary, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.return.detail', { id: row.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Returns list controls"
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
              aria-label="Filter returns"
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
            icon={<Undo2 className="size-6" aria-hidden />}
            title="Could not load your returns"
            description="This is a problem reaching the server. Your returns are unaffected — nothing has been lost."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading returns…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Undo2 className="size-6" aria-hidden />}
            title={filtered ? 'Nothing at this stage' : 'No returns yet'}
            description={
              filtered
                ? `No returns are marked “${active.label}” right now. Switch back to All to see the rest.`
                : 'When a customer asks to send something back, it shows up here for you to approve and settle.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Order</th>
                <th className="hidden @lg:table-cell">Customer</th>
                <th className="hidden @2xl:table-cell">Asked</th>
                <th className="hidden @xl:table-cell">Wants</th>
                <th className="text-right @lg:text-left">Items</th>
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = returnState(row.status);
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
                    <td className="font-mono text-sm">{row.orderNumber ?? '—'}</td>
                    <td className="hidden max-w-48 truncate @lg:table-cell">
                      {row.customerName ?? 'Unknown customer'}
                    </td>
                    <td className="hidden text-sm @2xl:table-cell">
                      {formatDate(row.requestedAt)}
                    </td>
                    <td className="hidden @xl:table-cell">{outcomeLabel(row.preferredOutcome)}</td>
                    <td className="text-right tabular-nums @lg:text-left">{row.itemCount}</td>
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
