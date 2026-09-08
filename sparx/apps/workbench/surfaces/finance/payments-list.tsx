'use client';

// Payments — every payment a customer has made, including the ones that failed
// or were refunded.
//
// The money-in flagship: a flat, searchable, filterable feed rather than a
// per-order drill-down, because the question it answers is "what came in, and did
// any of it go wrong?" — which is a property of the ledger, not of any one order.
// Failed and refunded rows are first-class: the status filter surfaces them in one
// click, and each row says WHY (the decline reason) or HOW MUCH went back.
//
// Opening a row opens its ORDER (in Commerce, wearing Commerce's hue) — a payment
// is a fact about an order, so that is where "tell me more" leads. The feed itself
// never navigates away: in a workbench, opening the fifth payment must not close
// the list you are working.

import { useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Wallet } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { usePayments, type Payment } from './payments-data';
import { channelLabel, formatMoney, formatRelativeDay, methodLabel, paymentState } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'captured', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'pending', label: 'Pending' },
] as const;

type SortKey = 'createdAt' | 'amount';
type SortDir = 'asc' | 'desc';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function PaymentRow({
  payment,
  onOpen,
}: {
  payment: Payment;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = paymentState(payment.status);
  const clickable = Boolean(payment.orderId);
  return (
    <tr
      className={clickable ? 'cursor-pointer' : ''}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? 'button' : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onOpen(event);
            }
          : undefined
      }
    >
      <td className="hidden align-top text-sm whitespace-nowrap @lg:table-cell">
        {formatRelativeDay(payment.createdAt)}
      </td>
      <td className="align-top">
        <div className="font-medium">{payment.customerName ?? 'Guest'}</div>
        <div className="text-sm">
          {payment.orderNumber ? (
            <span className="font-mono">{payment.orderNumber}</span>
          ) : (
            'No order'
          )}
        </div>
        {/* The whole point of a failed row: say why, in the processor's own
            words, so it can be acted on rather than just noticed. */}
        {payment.status === 'failed' && payment.failureReason ? (
          <div className="text-error text-sm">{payment.failureReason}</div>
        ) : null}
      </td>
      <td className="hidden align-top whitespace-nowrap @xl:table-cell">
        {methodLabel(payment.processor)}
      </td>
      <td className="hidden align-top whitespace-nowrap @2xl:table-cell">
        {channelLabel(payment.channel, payment.source)}
      </td>
      <td className="align-top">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td className="text-right align-top tabular-nums">
        <div className={payment.status === 'failed' ? '' : 'font-medium'}>
          {formatMoney(payment.amount, payment.currency)}
        </div>
        {/* Refunds read as a real amount, not just a status word. */}
        {payment.refundedAmount > 0 ? (
          <div className="text-warning text-sm">
            −{formatMoney(payment.refundedAmount, payment.currency)} back
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function PaymentsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'createdAt',
    dir: 'desc',
  });
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = usePayments({
    q: search.trim(),
    status,
    method: 'all',
    sort,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: SortKey) => {
    // Newest / largest first by default — both useful directions here are `desc`.
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

  const open = (payment: Payment, event: { shiftKey: boolean; altKey: boolean }) => {
    if (!payment.orderId) return;
    ctx.open('commerce.order.detail', { id: payment.orderId }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Payments list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search payments"
              placeholder="Search by customer or order…"
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
              value={status}
              onValueChange={(next) => {
                setStatus(next ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((filter) => (
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
        {error ? (
          <EmptyState
            icon={<Wallet className="size-6" aria-hidden />}
            title="Could not load payments"
            description="Something went wrong reaching the server. Your payments are unaffected — try again in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading payments…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-6" aria-hidden />}
            title={
              search || status !== 'all' ? 'No payments match those filters' : 'No payments yet'
            }
            description={
              search || status !== 'all'
                ? 'Try a different search, or switch the status back to All.'
                : 'When a customer pays — on your website, a marketplace, or in person — it will show up here.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('createdAt', 'When', 'hidden @lg:table-cell')}
                <th>Customer</th>
                <th className="hidden @xl:table-cell">Method</th>
                <th className="hidden @2xl:table-cell">Where</th>
                <th>Status</th>
                {header('amount', 'Amount', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  onOpen={(event) => {
                    open(payment, event);
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
        <RowOpenHint what="a payment to open its order" />
      </div>
    </div>
  );
}
