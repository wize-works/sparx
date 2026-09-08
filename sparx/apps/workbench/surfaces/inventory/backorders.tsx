'use client';

// WHO IS WAITING — the queue of customers owed stock that does not exist yet.
//
// Before this screen the information was there and unreadable: a level with more
// allocated than on hand, and nothing anywhere saying whose order that was, how
// long they had waited, or what they had been told. When the delivery landed,
// whoever was at the receiving desk decided who got it.
//
// ── Undated first, and that is the whole design ───────────────────────────
//
// The default sort puts commitments NOBODY CAN PUT A DATE ON at the top, ahead
// of overdue ones. That looks backwards until you ask what a person does with
// each: an overdue row needs chasing, and somebody is probably already on it —
// an undated row means a customer has been told nothing at all, and the fix is a
// purchase order that has not been raised. The second is both worse and easier.
//
// A screen that only counted "overdue" would show a reassuring zero while forty
// people waited on nothing, which is the failure this codebase keeps relearning:
// never let an absence render as a measurement.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarSync, Inbox, PackageSearch } from 'lucide-react';
import { useState } from 'react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import {
  backorderStatusTone,
  promiseSourceLabel,
  promiseTone,
  useBackorders,
  useRefreshPromises,
  type BackorderQuery,
} from './demand-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

type Lens = 'waiting' | 'undated' | 'overdue' | 'allocated' | 'all';

const LENS_QUERY: Record<Lens, BackorderQuery> = {
  waiting: { status: 'open' },
  undated: { undatedOnly: true },
  overdue: { overdueOnly: true },
  allocated: { status: 'allocated' },
  all: {},
};

export function BackordersSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [lens, setLens] = useState<Lens>('waiting');
  const list = useBackorders(LENS_QUERY[lens]);
  const refresh = useRefreshPromises();

  const rows = list.data?.items ?? [];
  const undatedCount = list.data?.undatedCount ?? 0;
  const overdueCount = list.data?.overdueCount ?? 0;
  const unitsOutstanding = list.data?.unitsOutstanding ?? 0;

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.backorders.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (list.isError) {
      return (
        <EmptyState
          icon={<PackageSearch className="size-6" aria-hidden />}
          title="Could not load the queue"
          description="This is a problem reaching the server, not a finding about your commitments. Try again in a moment."
        />
      );
    }
    if (list.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Reading the queue…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden />}
          title={
            lens === 'undated'
              ? 'Every commitment has a date'
              : lens === 'overdue'
                ? 'Nothing is past its promised date'
                : 'Nobody is waiting on stock'
          }
          description={
            lens === 'waiting'
              ? 'Every order you have taken was covered by stock on the shelf. A commitment appears here the moment one is not.'
              : 'Nothing matches this view. Try “Everything” to see the full history.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th className="w-12 text-right">#</th>
            <th>Item &amp; customer</th>
            <th className="text-right whitespace-nowrap">Owed</th>
            <th className="whitespace-nowrap">Told them</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Waiting since</th>
            <th className="hidden whitespace-nowrap @xl:table-cell">State</th>
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
              {/* Position in the queue, which is the single most useful thing a
                  salesperson on the phone can say. Derived server-side, so it is
                  always contiguous. */}
              <td className="text-right tabular-nums">{row.position ?? '—'}</td>
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {row.variantName ?? row.variantSku ?? 'Unnamed item'}
                    {row.variantSku && row.variantName ? (
                      <span className="ml-1.5 font-mono text-sm">{row.variantSku}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-sm">
                    {row.customerName ?? 'A guest'}
                    {row.orderNumber ? ` · ${row.orderNumber}` : ''}
                    {row.warehouseName ? ` · ${row.warehouseName}` : ''}
                  </span>
                </span>
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">
                {row.outstanding}
                {row.allocatedQuantity > 0 ? (
                  <span className="text-sm"> of {row.quantity}</span>
                ) : null}
              </td>
              <td className="whitespace-nowrap">
                {/* The date AND where it came from, together. A date derived
                    from past deliveries and one a supplier committed to are not
                    the same promise, and a buyer quoting the wrong one on the
                    phone is how a business loses a customer twice. */}
                {row.promisedAt ? (
                  <Tooltip content={promiseSourceLabel(row.promiseSource)}>
                    <Badge color={promiseTone(row.promiseSource)} variant="soft" size="sm">
                      <Timestamp value={row.promisedAt} format="absolute" />
                    </Badge>
                  </Tooltip>
                ) : (
                  <Badge color="danger" variant="soft" size="sm">
                    Nothing yet
                  </Badge>
                )}
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                <Timestamp value={row.createdAt} format="relative" />
              </td>
              <td className="hidden whitespace-nowrap @xl:table-cell">
                <Badge color={backorderStatusTone(row.status)} variant="soft" size="sm">
                  {row.isOverdue ? 'Overdue' : row.status}
                </Badge>
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
        label="Backorder controls"
        status={
          <Text className="text-sm">
            {unitsOutstanding > 0
              ? `${plural(unitsOutstanding, 'unit', 'units')} owed`
              : 'Nothing owed'}
          </Text>
        }
        primary={
          <Button
            color="module-inventory"
            variant="soft"
            size="sm"
            className="ml-auto"
            disabled={refresh.isPending}
            onClick={() => {
              refresh.mutate(undefined, {
                onSuccess: (result) => {
                  afterCommit(() => {
                    toast.add({
                      title:
                        result.newlyDated > 0 || result.redated > 0
                          ? `${result.newlyDated} newly dated, ${result.redated} moved`
                          : 'Nothing changed',
                      description:
                        result.stillUndated > 0
                          ? `${plural(result.stillUndated, 'commitment', 'commitments')} still have no date anybody can give. Those need a purchase order raised.`
                          : 'Every commitment already carries the best date available.',
                      type: result.stillUndated > 0 ? 'info' : 'success',
                    });
                  });
                },
                onError: () => {
                  afterCommit(() => {
                    toast.add({
                      title: 'Could not re-check the dates',
                      description: 'Nothing was changed. Please try again in a moment.',
                      type: 'error',
                    });
                  });
                },
              });
            }}
          >
            <CalendarSync className="size-4" aria-hidden />
            {refresh.isPending ? 'Checking…' : 'Re-check dates'}
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-48 shrink"
              aria-label="Which commitments"
              value={lens}
              onChange={(event) => {
                setLens(event.target.value as Lens);
              }}
            >
              <option value="waiting">Still waiting</option>
              <option value="undated">No date given</option>
              <option value="overdue">Past the date</option>
              <option value="allocated">Stock has landed</option>
              <option value="all">Everything</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={list.isFetching}
            updatedAt={list.data ? list.dataUpdatedAt : undefined}
            onRefresh={() => {
              void list.refetch();
            }}
          />
        }
      />

      {/* Stated whatever lens is showing, because it is the number a screen
          filtered to "overdue" would otherwise hide behind a comfortable zero. */}
      {undatedCount > 0 && lens !== 'undated' ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>
              {plural(undatedCount, 'person is', 'people are')} waiting with no date at all
            </AlertTitle>
            <AlertDescription>
              Nobody has told them anything, because nothing here knows when more is coming. Raising
              a purchase order with an expected arrival is what turns this into a date — and
              “Re-check dates” picks it up the moment you do.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {overdueCount > 0 && lens !== 'overdue' ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>
              {plural(overdueCount, 'commitment is', 'commitments are')} past the date you gave
            </AlertTitle>
            <AlertDescription>
              These customers were told a date that has now gone by. Chase the order behind them, or
              give them a new date — and tell them, which the detail pane records.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>
    </div>
  );
}
