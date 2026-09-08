'use client';

// BILLS TO PAY — supplier invoices, and whether they are right.
//
// A business that checks nothing pays whatever arrives. A business that checks by
// eye catches the £400 errors and never the £12 ones — which are the ones that
// repeat every month and, over a year, cost more.
//
// So the list leads with what is owed and when, and every row carries whether
// the invoice AGREES with the delivery. Sorted by due date, because this screen
// is worked as a payment run.
//
// ── This is not bookkeeping ───────────────────────────────────────────────
//
// There is no ledger here, no double entry, no chart of accounts, and there
// never will be (docs/148 §1). A bill exists so the three-way check can exist:
// ordered, received, billed. Paying it is either recorded here or handed to your
// accounting package.

import { useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { FileText, Receipt } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import {
  billStatusLabel,
  billStatusTone,
  useSupplierBills,
  type BillListQuery,
} from './supplier-bills-data';

type View = 'open' | 'overdue' | 'disputed' | 'paid' | 'all';

const VIEWS: Record<View, BillListQuery> = {
  open: { status: 'draft' },
  overdue: { overdueOnly: true },
  disputed: { status: 'disputed' },
  paid: { status: 'paid' },
  all: {},
};

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A due date as a color. Overdue is the only one that is an alarm. */
function dueTone(days: number | null): 'danger' | 'warning' | 'info' | 'neutral' {
  if (days === null) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 3) return 'warning';
  return 'info';
}

function dueLabel(days: number | null): string {
  if (days === null) return 'No due date';
  if (days < 0) return `${plural(Math.abs(days), 'day', 'days')} overdue`;
  if (days === 0) return 'Due today';
  return `in ${plural(days, 'day', 'days')}`;
}

export function SupplierBillsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [view, setView] = useState<View>('all');

  const report = useSupplierBills(VIEWS[view]);
  const rows = report.data?.items ?? [];
  const outstanding = report.data?.outstandingCents ?? 0;
  const outstandingCount = report.data?.outstandingCount ?? 0;

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.supplier-bills.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (report.isError) {
      return (
        <EmptyState
          icon={<Receipt className="size-6" aria-hidden />}
          title="Could not load your bills"
          description="This is a problem reaching the server, not a statement that you owe nothing. Try again in a moment."
        />
      );
    }
    if (report.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading your bills…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title={view === 'all' ? 'No supplier bills entered' : 'Nothing here'}
          description={
            view === 'all'
              ? 'When an invoice arrives, enter it against the order it belongs to. We then check it line by line against what was ordered and what actually turned up, and tell you before you pay it if the three do not agree.'
              : 'No bills are in this state.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Invoice</th>
            <th className="whitespace-nowrap">State</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Due</th>
            <th className="text-right whitespace-nowrap">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(row.id, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(row.id, event);
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
                    {row.purchaseOrderNumber
                      ? `against ${row.purchaseOrderNumber}`
                      : 'not linked to an order'}
                    {row.varianceAcceptedAt
                      ? ` · difference accepted by ${row.varianceAcceptedByName ?? 'someone'}`
                      : ''}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={billStatusTone(row.status)} variant="soft" size="sm">
                  {billStatusLabel(row.status)}
                </Badge>
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                {row.paidAt ? (
                  <Text className="text-sm">
                    Paid <Timestamp value={row.paidAt} format="relative" />
                  </Text>
                ) : (
                  <Badge color={dueTone(row.daysUntilDue)} variant="soft" size="sm">
                    {dueLabel(row.daysUntilDue)}
                  </Badge>
                )}
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">
                {formatCents(row.totalCents, row.currency)}
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
        label="Supplier bill controls"
        status={
          <Text className="text-sm">
            {outstandingCount === 0
              ? 'Nothing owed'
              : `${formatCents(outstanding)} owed across ${plural(outstandingCount, 'bill', 'bills')}`}
          </Text>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-48 shrink"
              aria-label="Show bills that are"
              value={view}
              onChange={(event) => {
                setView(event.target.value as View);
              }}
            >
              <option value="all">Everything</option>
              <option value="open">Just entered</option>
              <option value="overdue">Overdue</option>
              <option value="disputed">Queried</option>
              <option value="paid">Paid</option>
            </NativeSelect>
          </>
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

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>

      <Text className="text-sm">
        Enter a bill from the purchase order it belongs to — the lines come across already filled
        in, and the check runs straight away.
      </Text>
    </div>
  );
}
