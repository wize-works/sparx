'use client';

// BILLS TO PAY — what the business owes, and how late each one is.
//
// The exact mirror of "Owed to you", and the pairing is the point: one screen
// for each direction of money, reading the same way, so an owner can hold both
// halves of their cash position in one habit. Same aging bands, same worst-first
// order, same shape of summary.
//
// The one deliberate difference is the action. On the receivables side you chase
// someone; here you PAY, and paying is a single click — a bill you have just
// settled should not require opening it, editing a date and saving. Marking paid
// from the row is the whole workflow of a Friday afternoon.
//
// LATENESS IS COMPUTED FROM `dueAt` AND NOTHING ELSE. A cost with no due date is
// not late, it is simply unpaid — showing "0 days late" for a receipt someone
// typed in would invent a deadline nobody set.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  Progress,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { CheckCircle2, Check, ReceiptText } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { spendErrorMessage, useExpenses, useSetExpensePaid, type Expense } from './spend-data';
import { daysPastDue, formatCents, formatDay, kindColor } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

/** The aging bands, worst first. Mirrors the receivables buckets exactly. */
type BucketKey = 'overdue_90' | 'overdue_60' | 'overdue_30' | 'overdue_1' | 'due_soon' | 'no_date';

const BUCKETS: { key: BucketKey; label: string; tone: 'error' | 'warning' | 'info' }[] = [
  { key: 'overdue_90', label: '90+ days late', tone: 'error' },
  { key: 'overdue_60', label: '61–90 days late', tone: 'error' },
  { key: 'overdue_30', label: '31–60 days late', tone: 'error' },
  { key: 'overdue_1', label: '1–30 days late', tone: 'warning' },
  { key: 'due_soon', label: 'Not yet due', tone: 'info' },
  { key: 'no_date', label: 'No due date', tone: 'info' },
];

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Late' },
  { value: 'due_soon', label: 'Coming up' },
] as const;

function bucketFor(late: number | null): BucketKey {
  if (late === null) return 'no_date';
  if (late <= 0) return 'due_soon';
  if (late <= 30) return 'overdue_1';
  if (late <= 60) return 'overdue_30';
  if (late <= 90) return 'overdue_60';
  return 'overdue_90';
}

function latenessLabel(late: number | null): { label: string; tone: 'error' | 'warning' | 'info' } {
  if (late === null) return { label: 'No due date', tone: 'info' };
  if (late > 0) {
    return {
      label: late === 1 ? '1 day late' : `${String(late)} days late`,
      tone: late > 30 ? 'error' : 'warning',
    };
  }
  if (late === 0) return { label: 'Due today', tone: 'warning' };
  return { label: `Due in ${String(-late)} days`, tone: 'info' };
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function BillRow({
  bill,
  late,
  paying,
  onOpen,
  onPay,
}: {
  bill: Expense;
  late: number | null;
  paying: boolean;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
  onPay: () => void;
}) {
  const state = latenessLabel(late);
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
      <td className="max-w-56 min-w-0">
        <div className="truncate font-medium">{bill.description}</div>
        {bill.vendor ? <div className="truncate text-sm">{bill.vendor.name}</div> : null}
      </td>
      <td>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td className="hidden @lg:table-cell">
        {bill.category ? (
          <Badge color={kindColor(bill.category.kind)} variant="soft" size="sm">
            {bill.category.name}
          </Badge>
        ) : null}
      </td>
      <td className="hidden text-sm whitespace-nowrap @2xl:table-cell">
        {bill.dueAt ? formatDay(bill.dueAt) : '—'}
      </td>
      <td className="text-right font-medium tabular-nums">
        {formatCents(bill.amountCents, bill.currency)}
      </td>
      <td className="text-right">
        {/* Stops the row's own open handler — paying is not opening. */}
        <Button
          size="sm"
          variant="outline"
          color="success"
          loading={paying}
          onClick={(event) => {
            event.stopPropagation();
            onPay();
          }}
        >
          <Check className="size-4" aria-hidden />
          <span className="hidden @2xl:inline">Paid</span>
        </Button>
      </td>
    </tr>
  );
}

export function BillsToPaySurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [band, setBand] = useState<string>('all');
  const setPaid = useSetExpensePaid();
  const [payingId, setPayingId] = useState<string | null>(null);

  // Everything unpaid, over all time — a bill from four months ago is exactly
  // the one that must not fall out of view because a period filter moved on.
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useExpenses({
    unpaidOnly: true,
    limit: 200,
  });

  // Lateness is measured as of the FETCH, not the frame. One instant for the
  // whole list, so two rows can never land on different days, and a stable one,
  // so the memo below is not invalidated every render the way a bare
  // `Date.now()` in the render body was. Zero until the first fetch lands.
  const now = useMemo(() => new Date(dataUpdatedAt || Date.now()), [dataUpdatedAt]);

  const bills = useMemo(() => {
    const items = data?.items ?? [];
    return items
      .map((bill) => ({ bill, late: daysPastDue(bill.dueAt, now) }))
      .sort((a, b) => {
        // Most overdue first; anything with no deadline sinks below everything
        // that has one, because it is the only group with no clock running.
        if (a.late === null && b.late === null) return b.bill.amountCents - a.bill.amountCents;
        if (a.late === null) return 1;
        if (b.late === null) return -1;
        return b.late - a.late;
      });
  }, [data?.items, now]);

  const totals = useMemo(() => {
    const byBucket = new Map<BucketKey, number>();
    let outstanding = 0;
    let overdue = 0;
    for (const { bill, late } of bills) {
      const key = bucketFor(late);
      byBucket.set(key, (byBucket.get(key) ?? 0) + bill.amountCents);
      outstanding += bill.amountCents;
      if (late !== null && late > 0) overdue += bill.amountCents;
    }
    return { byBucket, outstanding, overdue };
  }, [bills]);

  const rows = useMemo(() => {
    if (band === 'overdue') return bills.filter((row) => row.late !== null && row.late > 0);
    if (band === 'due_soon') return bills.filter((row) => row.late === null || row.late <= 0);
    return bills;
  }, [bills, band]);

  const pay = (bill: Expense) => {
    setPayingId(bill.id);
    setPaid.mutate(
      { id: bill.id, paidAt: new Date().toISOString() },
      {
        onSettled: () => {
          setPayingId(null);
        },
        onSuccess: () => {
          afterPaneChange(() => {
            toast.add({
              title: `${bill.description} marked as paid`,
              description: 'It moves out of this list and into your spending history.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not mark that as paid',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const allSettled = bills.length === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Bills list controls"
        controls={
          <>
            <Filter
              color="module"
              value={band}
              onValueChange={(next) => {
                setBand(typeof next === 'string' ? next : 'all');
              }}
              showReset={false}
              aria-label="Filter by how late"
            >
              {FILTERS.map((filter) => (
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<ReceiptText className="size-6" aria-hidden />}
            title="Could not load what you owe"
            description="The server could not be reached. Nothing you have recorded is affected."
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
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : allSettled ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<CheckCircle2 className="size-6" aria-hidden />}
              title="Nothing outstanding"
              description="Every cost you have recorded is marked as paid. When you record one that is not yet settled, it will appear here — sorted by how late it is."
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Card className="p-4">
              <Text className="text-sm">Total outstanding</Text>
              <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                {formatCents(totals.outstanding)}
              </Heading>
              <Text className="mt-1 text-sm">
                across {bills.length === 1 ? '1 bill' : `${String(bills.length)} bills`}
                {totals.overdue > 0 ? ` · ${formatCents(totals.overdue)} already late` : ''}
              </Text>

              <div className="mt-4 flex flex-col gap-3">
                {BUCKETS.filter((bucket) => (totals.byBucket.get(bucket.key) ?? 0) > 0).map(
                  (bucket) => {
                    const value = totals.byBucket.get(bucket.key) ?? 0;
                    return (
                      <div
                        key={bucket.key}
                        className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm"
                      >
                        <span className="truncate">{bucket.label}</span>
                        <Progress
                          color={bucket.tone}
                          value={value}
                          max={totals.outstanding}
                          aria-label={`${bucket.label}: ${formatCents(value)}`}
                        />
                        <span className="text-right font-medium tabular-nums">
                          {formatCents(value)}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            </Card>

            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<CheckCircle2 className="size-6" aria-hidden />}
                  title={band === 'overdue' ? 'Nothing is late' : 'Nothing coming up'}
                  description={
                    band === 'overdue'
                      ? 'Every bill you owe is still within its due date. Switch to All to see them.'
                      : 'Everything outstanding is already past its due date. Switch to All to see the lot.'
                  }
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>How late</th>
                      <th className="hidden @lg:table-cell">Category</th>
                      <th className="hidden @2xl:table-cell">Due</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Settle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ bill, late }) => (
                      <BillRow
                        key={bill.id}
                        bill={bill}
                        late={late}
                        paying={payingId === bill.id}
                        onOpen={(event) => {
                          ctx.open(
                            'finance.expense.detail',
                            { id: bill.id },
                            { target: targetFor(event) }
                          );
                        }}
                        onPay={() => {
                          pay(bill);
                        }}
                      />
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}

            <RowOpenHint what="a bill to open it" />
          </div>
        )}
      </div>
    </div>
  );
}
