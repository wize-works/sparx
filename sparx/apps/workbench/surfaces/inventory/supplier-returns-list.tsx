'use client';

// SENT BACK — stock that went back to a supplier, and the money still owed for
// it.
//
// ── Why this is a screen and not a note ───────────────────────────────────
//
// Writing off six broken pumps tells your stock figures the truth and says
// nothing at all about the £900 the supplier owes you. In most businesses that
// credit is remembered by one person, in their head, until they leave — and the
// money is simply lost. This list is the memory.
//
// So the headline is a pound figure, not a count: "you are owed £4,310 by
// suppliers right now" is the sentence that makes anybody open this screen. It
// survives filtering, because it is the state of the business rather than the
// state of the page.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { PackageX, PlusCircle, Undo2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import {
  chaseTone,
  returnReasonLabel,
  returnReasonTone,
  returnStatusLabel,
  returnStatusTone,
  useSupplierReturns,
  type ReturnListQuery,
} from './supplier-returns-data';

type View = 'awaiting' | 'draft' | 'credited' | 'all';

const VIEWS: Record<View, ReturnListQuery> = {
  awaiting: { awaitingCreditOnly: true },
  draft: { status: 'draft' },
  credited: { status: 'credited' },
  all: {},
};

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function SupplierReturnsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [view, setView] = useState<View>('awaiting');

  const report = useSupplierReturns(VIEWS[view]);
  const rows = report.data?.items ?? [];
  const owed = report.data?.awaitingCreditCents ?? 0;
  const owedCount = report.data?.awaitingCreditCount ?? 0;

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.supplier-returns.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (report.isError) {
      return (
        <EmptyState
          icon={<PackageX className="size-6" aria-hidden />}
          title="Could not load your returns"
          description="This is a problem reaching the server, not a statement that nothing is owed. Try again in a moment."
        />
      );
    }
    if (report.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading what has gone back…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<Undo2 className="size-6" aria-hidden />}
          title={view === 'awaiting' ? 'Nothing is waiting on a credit' : 'Nothing sent back'}
          description={
            view === 'awaiting'
              ? 'Every return you have sent has been credited or written off. Nothing is outstanding.'
              : 'When something arrives broken, wrong, or simply too much, record it going back here — with what you paid for it — and the credit you are owed stops being something one person remembers.'
          }
          actions={
            <Button
              color="module"
              onClick={() => {
                ctx.open('inventory.supplier-returns.detail', { id: 'new' });
              }}
            >
              <PlusCircle className="size-4" aria-hidden />
              Send something back
            </Button>
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Return</th>
            <th className="whitespace-nowrap">Why</th>
            <th className="whitespace-nowrap">State</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Waiting</th>
            <th className="text-right whitespace-nowrap">Owed</th>
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
                    {row.warehouseName ?? 'Unknown location'}
                    {row.rmaNumber ? ` · their ref ${row.rmaNumber}` : ''}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={returnReasonTone(row.reason)} variant="soft" size="sm">
                  {returnReasonLabel(row.reason)}
                </Badge>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={returnStatusTone(row.status)} variant="soft" size="sm">
                  {returnStatusLabel(row.status)}
                </Badge>
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                {row.awaitingCreditDays === null ? (
                  <Text className="text-sm">
                    {row.sentAt ? <Timestamp value={row.sentAt} format="relative" /> : 'Not sent'}
                  </Text>
                ) : (
                  <Badge color={chaseTone(row.awaitingCreditDays)} variant="soft" size="sm">
                    {row.awaitingCreditDays === 0
                      ? 'sent today'
                      : plural(row.awaitingCreditDays, 'day', 'days')}
                  </Badge>
                )}
              </td>
              <td className="text-right whitespace-nowrap">
                <span className="flex flex-col items-end">
                  <span className="tabular-nums">
                    {formatCents(row.creditExpectedCents, row.currency)}
                  </span>
                  {/* Three states, and each is a different conversation. A
                      shortfall is the one people never notice without this. */}
                  {row.creditReceivedCents === null ? null : row.creditShortfallCents === 0 ? (
                    <span className="text-sm">paid in full</span>
                  ) : (
                    <span className="text-sm">
                      {formatCents(row.creditShortfallCents ?? 0, row.currency)} short
                    </span>
                  )}
                </span>
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
        label="Supplier return controls"
        status={
          <Text className="text-sm">
            {owedCount === 0
              ? 'Nothing outstanding'
              : `${formatCents(owed)} owed across ${plural(owedCount, 'return', 'returns')}`}
          </Text>
        }
        primary={
          <Button
            className="ml-auto"
            size="sm"
            color="module"
            onClick={() => {
              ctx.open('inventory.supplier-returns.detail', { id: 'new' });
            }}
          >
            <PlusCircle className="size-4" aria-hidden />
            Send something back
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-52 shrink"
              aria-label="Show returns that are"
              value={view}
              onChange={(event) => {
                setView(event.target.value as View);
              }}
            >
              <option value="awaiting">Waiting for a credit</option>
              <option value="draft">Being put together</option>
              <option value="credited">Credited</option>
              <option value="all">Everything</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={report.isFetching}
            updatedAt={report.data ? report.dataUpdatedAt : undefined}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>
    </div>
  );
}
