'use client';

// Subscriptions — every repeat order across the catalog.
//
// product-subscriptions.tsx answers "who buys THIS product on repeat" and hands
// off, because a verb on a subscription belongs to the customer's whole standing
// order. This is where those standing orders live as first-class rows, and where
// opening one leads to the screen that CAN pause or stop it.
//
// The filter chips are the questions this list gets opened to answer — "which
// ones are running", "which had a payment fail" — each mapping to exactly one
// stored status, so what's on screen is always one honest server answer.

import { useState } from 'react';
import { Badge, Card, EmptyState, Filter, FilterItem, Table } from '@wizeworks/silicaui-react';
import { Repeat2 } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, formatDate, subscriptionState } from './products-data';
import { useSubscriptions, type SubscriptionSummary } from './subscriptions-data';
import { RowOpenHint } from '../../components/row-open-hint';

const FILTERS = [
  { value: 'all', label: 'All', status: undefined },
  { value: 'active', label: 'Running', status: 'active' as const },
  { value: 'paused', label: 'Paused', status: 'paused' as const },
  { value: 'past_due', label: 'Payment failed', status: 'past_due' as const },
  { value: 'cancelled', label: 'Stopped', status: 'cancelled' as const },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function SubscriptionsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useSubscriptions({
    status: active.status,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = filter !== 'all';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (sub: SubscriptionSummary, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.subscription.detail', { id: sub.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Subscriptions list controls"
        controls={
          <>
            <Repeat2 className="size-4 shrink-0" aria-hidden />
            <Filter
              color="module"
              value={filter}
              onValueChange={(next) => {
                setFilter((next as FilterValue | null) ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter subscriptions"
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
            icon={<Repeat2 className="size-6" aria-hidden />}
            title="Could not load repeat orders"
            description="This is a problem reaching the server. Nobody’s repeat order has changed — nothing has been lost."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading repeat orders…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Repeat2 className="size-6" aria-hidden />}
            title={filtered ? 'None match that' : 'No repeat orders yet'}
            description={
              filtered
                ? `No repeat orders are marked “${active.label}”. Switch back to All to see the rest — including any still on a free trial.`
                : 'When a customer sets up a product to be delivered on a schedule, their repeat order shows up here with what it’s worth each month.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th className="hidden @lg:table-cell">Next delivery</th>
                <th className="hidden @xl:table-cell">Items</th>
                <th className="text-right">Per month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sub) => {
                const state = subscriptionState(sub.status);
                return (
                  <tr
                    key={sub.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(sub, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(sub, event);
                    }}
                  >
                    <td className="max-w-48 truncate font-medium">
                      {sub.customerName ?? 'A customer'}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge color={state.tone} variant="soft" size="sm">
                          {state.label}
                        </Badge>
                        {/* An invoiced repeat order is a different KIND of thing
                            from a card one — someone has to pay a bill for it to
                            ship — so it earns its own mark rather than looking
                            identical to one that charges itself. */}
                        {sub.billingMode === 'invoice' ? (
                          <Badge color="info" variant="soft" size="sm">
                            Invoiced
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="hidden text-sm @lg:table-cell">
                      {sub.nextOccurrenceAt ? formatDate(sub.nextOccurrenceAt) : '—'}
                    </td>
                    <td className="hidden text-sm @xl:table-cell">
                      {sub.itemCount === 1 ? '1 product' : `${String(sub.itemCount)} products`}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {formatCents(sub.monthlyRecurringRevenueCents, sub.currency)}
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
