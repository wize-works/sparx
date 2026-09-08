'use client';

// Checkout sessions — shoppers part-way through paying.
//
// A session is the storefront walking a shopper from cart to order; staff never
// start one. This is a read view for one job: seeing where a payment stalled. So
// the filter chips are the steps a shopper gets stuck on — at payment, at the
// final review — plus the two ends, finished and expired. Each maps to ONE
// server step.

import { useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { CreditCard } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatMoney, formatDateTime } from './data';
import {
  checkoutState,
  useCheckoutSessions,
  type CheckoutRow,
  type CheckoutStep,
} from './checkout-data';
import { RowOpenHint } from '../../components/row-open-hint';

// "Not finished" leads and is the default, because this list is NAMED for the
// ones that stalled and most of what it holds are the ones that did not. Opening
// on All buried six stalled checkouts under eleven completed ones that already
// have a home in Orders.
const FILTERS = [
  { value: 'unfinished', label: 'Not finished', step: undefined },
  { value: 'payment', label: 'At payment', step: 'payment' },
  { value: 'review', label: 'At review', step: 'review' },
  { value: 'shipping', label: 'At delivery', step: 'shipping' },
  { value: 'completed', label: 'Finished', step: 'completed' },
  { value: 'expired', label: 'Expired', step: 'expired' },
  { value: 'all', label: 'All', step: undefined },
] as const satisfies readonly { value: string; label: string; step: CheckoutStep | undefined }[];

type FilterValue = (typeof FILTERS)[number]['value'];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CheckoutSessionsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [filter, setFilter] = useState<FilterValue>('unfinished');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const activeFilter = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;
  const filtered = filter !== 'all';

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useCheckoutSessions({
    step: activeFilter.step,
    ...(filter === 'unfinished' ? { unfinished: true } : {}),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  // What is sitting in here, in money. It is the reason anyone opens this list,
  // and adding a column up by eye is not an answer.
  //
  // Only stated when this page holds the WHOLE set. A sum of the rows on screen
  // is not the sum of the list, and a number that quietly means something
  // narrower than its label is worse than no number — never present absence as
  // a measurement.
  const holdsEverything = total !== undefined && rows.length === total;
  const worth = holdsEverything ? rows.reduce((sum, row) => sum + row.totalCents, 0) : null;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (row: CheckoutRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.checkout-session.detail', { id: row.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Checkout sessions list controls"
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
              aria-label="Filter checkout sessions"
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
            icon={<CreditCard className="size-6" aria-hidden />}
            title="Could not load checkout sessions"
            description="This is a problem reaching the server. Your sales are unaffected — nothing has been lost."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading checkout sessions…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="size-6" aria-hidden />}
            title={
              filter === 'unfinished'
                ? 'Nothing half-finished'
                : filtered
                  ? 'Nothing at this step'
                  : 'No checkout sessions'
            }
            description={
              filter === 'unfinished'
                ? 'Every checkout either went through or timed out. Nothing is sitting half-paid.'
                : filtered
                  ? `No sessions are at “${activeFilter.label}” right now. Switch to All to see the rest.`
                  : 'When a shopper starts paying, their progress shows up here — useful for spotting where a payment got stuck.'
            }
          />
        ) : (
          <>
            {worth !== null && worth > 0 ? (
              <Text className="px-1 pb-2 text-base">
                {rows.length === 1 ? '1 checkout' : `${rows.length} checkouts`}, worth{' '}
                <span className="font-semibold tabular-nums">
                  {formatMoney(worth / 100, rows[0]?.currency ?? 'USD')}
                </span>
                .
              </Text>
            ) : null}
            <Table size="sm" hover>
              <thead>
                <tr>
                  <th>Shopper</th>
                  <th className="hidden @2xl:table-cell">Started</th>
                  <th className="hidden @xl:table-cell">Where they got to</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = checkoutState(row.step);
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
                      <td className="max-w-48">
                        {/* A person, where there is one. Every other list of
                            people in the console shows a name; this one showed
                            the address they typed at the till. */}
                        <span className="block truncate">
                          {row.customerName ?? row.customerEmail ?? 'Guest shopper'}
                        </span>
                        {/* The stage column is hidden on a narrow pane, and this
                            list is NAMED for where a checkout stalled — dropping
                            it left a phone showing who and how much but not the
                            one fact the pane exists to give. So it rides under
                            the shopper instead of disappearing. */}
                        <Badge
                          color={state.tone}
                          variant="soft"
                          size="sm"
                          className="mt-1 @xl:hidden"
                        >
                          {state.label}
                        </Badge>
                      </td>
                      <td className="hidden text-sm @2xl:table-cell">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="hidden @xl:table-cell">
                        <Badge color={state.tone} variant="soft" size="sm">
                          {state.label}
                        </Badge>
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {formatMoney(row.totalCents / 100, row.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </>
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
