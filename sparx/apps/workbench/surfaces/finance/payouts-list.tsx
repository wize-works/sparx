'use client';

// Payouts — the money actually landing in your bank.
//
// A payment is what a customer paid; a PAYOUT is what reaches your account, which
// is a different question an owner asks at a different moment ("did the money from
// last week's sales arrive?"). Each deposit is openable — a durable thing you'd
// return to, so it's a PANE, not a modal — to see exactly which sales it settles.
//
// No search box: a payout is a processor, a date and a count — there is no
// free-text field to search, so the toolbar is the honest one for the surface —
// two facets (has it landed / which card processor) plus sortable columns, all
// server-driven so a filter or sort spans every deposit, not the loaded window.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Table,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Banknote } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { usePayouts, type Payout } from './payouts-data';
import { formatMoney, formatDate, methodLabel, payoutState } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in_transit', label: 'On its way' },
  { value: 'paid', label: 'In the bank' },
] as const;

const PROCESSOR_FILTERS = [
  { value: 'all', label: 'All sources' },
  { value: 'stripe', label: 'Card' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'square', label: 'Square' },
  { value: 'sparx_pay', label: 'sparx Pay' },
] as const;

type SortKey = 'arrivalDate' | 'amount';
type SortDir = 'asc' | 'desc';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function PayoutRow({
  payout,
  onOpen,
}: {
  payout: Payout;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = payoutState(payout.status);
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(event);
      }}
    >
      <td className="align-top font-medium whitespace-nowrap">{formatDate(payout.arrivalDate)}</td>
      <td className="hidden align-top whitespace-nowrap @lg:table-cell">
        {methodLabel(payout.processor)} sales
      </td>
      <td className="hidden align-top whitespace-nowrap @xl:table-cell">
        {/* Real Stripe (sparx Pay) payouts are account-level — the sale count lives in
            the detail, not the list — so show a dash; derived payouts show their count. */}
        {payout.salesCount === undefined
          ? '—'
          : payout.salesCount === 1
            ? '1 sale'
            : `${String(payout.salesCount)} sales`}
      </td>
      <td className="align-top">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td className="text-right align-top font-medium tabular-nums">
        {formatMoney(payout.amount, payout.currency)}
      </td>
    </tr>
  );
}

export function PayoutsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [status, setStatus] = useState('all');
  const [processor, setProcessor] = useState('all');
  // Newest arrival first — the deposit an owner is looking for is the last one.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'arrivalDate',
    dir: 'desc',
  });
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = usePayouts({
    status,
    processor,
    sort,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtering = status !== 'all' || processor !== 'all';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    );
    resetWindow();
  };

  const header = (key: SortKey, label: string, extra = '') => (
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

  const open = (payout: Payout, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('finance.payout.detail', { id: payout.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Payouts list controls"
        controls={
          <>
            <Filter
              color="module"
              value={status}
              onValueChange={(next) => {
                setStatus(next ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by whether the deposit has arrived"
            >
              {STATUS_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
            <Filter
              color="module"
              value={processor}
              onValueChange={(next) => {
                setProcessor(next ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by funding source"
            >
              {PROCESSOR_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
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
        {isError ? (
          <EmptyState
            icon={<Banknote className="size-6" aria-hidden />}
            title="Could not load payouts"
            description="Something went wrong reaching the server. Your deposits are unaffected — try again in a moment."
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
            Loading payouts…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Banknote className="size-6" aria-hidden />}
            title={filtering ? 'No payouts match those filters' : 'No payouts yet'}
            description={
              filtering
                ? 'Try a different combination, or switch both filters back to All.'
                : "When card sales settle, the deposits that land in your bank will be listed here — each one broken down by the sales it's made of. Cash, checks and account payments don't appear here: they're money you've received, not a deposit that arrives."
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('arrivalDate', 'Arrives')}
                <th className="hidden @lg:table-cell">From</th>
                <th className="hidden @xl:table-cell">Sales</th>
                <th>Status</th>
                {header('amount', 'Amount', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map((payout) => (
                <PayoutRow
                  key={payout.id}
                  payout={payout}
                  onOpen={(event) => {
                    open(payout, event);
                  }}
                />
              ))}
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
        <RowOpenHint what="a deposit to see the sales it settles" />
      </div>
    </div>
  );
}
