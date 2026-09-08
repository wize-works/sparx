'use client';

// WHAT IS OVERDUE — the orders that should have arrived and have not.
//
// A business normally finds out an order is late in one of two ways: a customer
// asks for the part, or somebody happens to scroll past it. Both are too late,
// and both are avoidable, because the platform already knows the date the goods
// were due and knows nothing has been received against them.
//
// ── Sorted by money, not by lateness ──────────────────────────────────────
//
// Eleven overdue orders is a list nobody works through. The one worth ringing
// about is the one with the most value still outstanding, so that is the sort —
// days late is a column, not the order.
//
// ── Two things this screen refuses to imply ───────────────────────────────
//
// That an empty list means a punctual supply chain: orders nobody set a date for
// cannot be late, so their count is stated at the top rather than quietly
// omitted. And that a due date means the same thing however it was arrived at —
// a date the buyer typed is a promise they can quote back, while one derived
// from a stated lead time is an assumption, so each row says which it is.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  EmptyState,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { CalendarClock, PackageSearch } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import { latenessTone, useLatePurchaseOrders } from './supplier-performance-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function LateOrdersSurface({ ctx }: { ctx: SurfaceContext }) {
  const report = useLatePurchaseOrders();

  const rows = report.data?.items ?? [];
  const undated = report.data?.undated ?? 0;
  const totalAtStake = rows.reduce((sum, row) => sum + row.valueOutstandingCents, 0);

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.purchase-orders.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (report.isError) {
      return (
        <EmptyState
          icon={<PackageSearch className="size-6" aria-hidden />}
          title="Could not check what is overdue"
          description="This is a problem reaching the server, not a finding about your orders. Try again in a moment."
        />
      );
    }
    if (report.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Checking what is overdue…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="Nothing is overdue"
          description={
            undated > 0
              ? 'Every order with a date on it is either here on time or already in. The orders with no date at all are counted above — those cannot be late, which is not the same as being on time.'
              : 'Every order you have placed is either still inside its promised date or already received.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Order</th>
            <th className="whitespace-nowrap">Overdue by</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Was due</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Still to come</th>
            <th className="text-right whitespace-nowrap">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.purchaseOrderId}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(row.purchaseOrderId, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(row.purchaseOrderId, event);
              }}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    <span className="font-mono">{row.number}</span>
                    {' · '}
                    {row.supplierName ?? 'Unnamed supplier'}
                  </span>
                  <span className="truncate text-sm">
                    {/* Which date they are being judged against, because it
                        changes what a buyer can say on the phone. */}
                    {row.dueSource === 'expected_arrival'
                      ? 'against the date on the order'
                      : 'against their usual delivery time'}
                    {row.alertedAt === null ? ' · not yet flagged' : ''}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={latenessTone(row.daysLate)} variant="soft" size="sm">
                  {plural(row.daysLate, 'day', 'days')}
                </Badge>
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                <Timestamp value={row.dueAt} format="relative" />
              </td>
              <td className="hidden text-right tabular-nums @xl:table-cell">
                {row.unitsOutstanding}
              </td>
              <td className="text-right tabular-nums">{formatCents(row.valueOutstandingCents)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Overdue order controls"
        status={
          <Text className="text-sm">
            {rows.length === 0
              ? 'Nothing overdue'
              : `${formatCents(totalAtStake)} of stock is late across ${plural(rows.length, 'order', 'orders')}`}
          </Text>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={report.isFetching}
            updatedAt={report.data ? report.dataUpdatedAt : undefined}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
      />

      {undated > 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>
              {plural(undated, 'open order has', 'open orders have')} no expected date
            </AlertTitle>
            <AlertDescription>
              They cannot appear here, because nothing says when they should have arrived — and that
              is not the same as being on time. Put a date on the order, or record a delivery time
              against the supplier, and they start being checked.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>
    </div>
  );
}
