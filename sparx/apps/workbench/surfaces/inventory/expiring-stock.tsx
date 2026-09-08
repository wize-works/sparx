'use client';

// WHAT IS GOING OFF — the money the calendar is about to take.
//
// A business that carries dated goods loses more to time than to theft, and
// almost all of it is avoidable. The horizons exist because they map onto what a
// person can actually DO about them, and a single "expiring soon" flag collapses
// three different responses into one shrug:
//
//   90 days   a purchasing decision — stop buying it
//   60 days   a promotion
//   30 days   a markdown
//   past it   a write-off that has already happened whether or not it is recorded
//
// ── The bucket that is not a horizon ──────────────────────────────────────
//
// "No date recorded" sits beside the others rather than being folded into the
// safe end. A batch with no expiry is not one that expires late; it is one
// nobody keyed, and for a business that needs to track expiry that is a finding,
// not a green row.
//
// ── Why a value can be blank ──────────────────────────────────────────────
//
// A lot nothing has ever costed shows no money, not zero. Zero would sort a real
// exposure to the bottom of a list ordered by value, which is precisely the
// place it would never be looked at.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Table,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarX2, Percent, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, stockErrorMessage } from './data';
import {
  bucketLabel,
  bucketTone,
  useExpiringStock,
  useMarkdownLot,
  useWriteOffLot,
  type ExpiringLot,
} from './demand-data';

const HORIZONS = [
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
  { value: '365', label: 'Next year' },
] as const;

export function ExpiringStockSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [horizon, setHorizon] = useState('90');
  const report = useExpiringStock({ withinDays: Number(horizon) });
  const markdown = useMarkdownLot();
  const writeOff = useWriteOffLot();

  const [acting, setActing] = useState<{ lot: ExpiringLot; kind: 'markdown' | 'writeOff' } | null>(
    null
  );
  const [percent, setPercent] = useState('25');
  const [reason, setReason] = useState('');

  const items = report.data?.items ?? [];
  const buckets = report.data?.buckets ?? [];
  const expired = buckets.find((b) => b.bucket === 'expired');
  const undatedLots = report.data?.undatedLots ?? 0;

  const fail = (title: string) => (error: unknown) => {
    afterCommit(() => {
      toast.add({
        title,
        description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
        type: 'error',
      });
    });
  };

  const closeDialog = () => {
    setActing(null);
    setPercent('25');
    setReason('');
  };

  const body = () => {
    if (report.isError) {
      return (
        <EmptyState
          icon={<CalendarX2 className="size-6" aria-hidden />}
          title="Could not check what is expiring"
          description="This is a problem reaching the server, not a finding about your stock. Try again in a moment."
        />
      );
    }
    if (report.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Checking what is going off…
        </p>
      );
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon={<CalendarX2 className="size-6" aria-hidden />}
          title="Nothing is close to expiring"
          description="No batch in this window is running out of time. Batches with no date at all would be listed here too, so this really is clear."
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Batch</th>
            <th className="whitespace-nowrap">When</th>
            <th className="text-right whitespace-nowrap">Units</th>
            <th className="hidden text-right whitespace-nowrap @lg:table-cell">Value</th>
            <th className="text-right">Do something</th>
          </tr>
        </thead>
        <tbody>
          {items.map((lot) => (
            <tr key={lot.lotId}>
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {lot.variantName ?? lot.variantSku ?? 'Unnamed item'}
                    <span className="ml-1.5 font-mono text-sm">{lot.lotNumber}</span>
                  </span>
                  <span className="truncate text-sm">
                    {lot.warehouseName ?? 'Unknown location'}
                    {lot.recallStatus ? ` · recall ${lot.recallStatus}` : ''}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={bucketTone(lot.bucket)} variant="soft" size="sm">
                  {lot.expiresAt ? (
                    lot.daysRemaining !== null && lot.daysRemaining < 0 ? (
                      `${plural(Math.abs(lot.daysRemaining), 'day', 'days')} ago`
                    ) : (
                      <Timestamp value={lot.expiresAt} format="absolute" />
                    )
                  ) : (
                    'No date'
                  )}
                </Badge>
              </td>
              <td className="text-right tabular-nums">{lot.quantity}</td>
              <td className="hidden text-right tabular-nums @lg:table-cell">
                {/* Blank, never zero — see the file header. */}
                {lot.valueCents === null ? (
                  <Text className="text-sm">not costed</Text>
                ) : (
                  formatCents(lot.valueCents)
                )}
              </td>
              <td className="text-right whitespace-nowrap">
                <span className="inline-flex gap-1.5">
                  <Button
                    size="xs"
                    color="warning"
                    variant="soft"
                    onClick={() => {
                      setActing({ lot, kind: 'markdown' });
                    }}
                  >
                    <Percent className="size-3.5" aria-hidden />
                    Mark down
                  </Button>
                  <Button
                    size="xs"
                    color="danger"
                    variant="soft"
                    onClick={() => {
                      setActing({ lot, kind: 'writeOff' });
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Write off
                  </Button>
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
        label="Expiring stock controls"
        status={
          <span className="flex flex-wrap items-center gap-1.5">
            {buckets.map((b) => (
              <Badge key={b.bucket} color={bucketTone(b.bucket)} variant="soft" size="sm">
                {bucketLabel(b.bucket)}: {b.lots}
                {b.valueCents !== null ? ` · ${formatCents(b.valueCents)}` : ''}
              </Badge>
            ))}
          </span>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="How far ahead"
              value={horizon}
              onChange={(event) => {
                setHorizon(event.target.value);
              }}
            >
              {HORIZONS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </NativeSelect>
            {/* The buckets as the headline, because the shape of the problem is the
            answer: forty lots at 90 days is a purchasing conversation, four at
            30 days is a markdown this afternoon. */}
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

      {expired && expired.lots > 0 ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>
              {plural(expired.lots, 'batch is', 'batches are')} already past their date
            </AlertTitle>
            <AlertDescription>
              These are excluded from picking automatically, so nothing will ship them — but they
              are still counted as stock you own until somebody writes them off.
              {expired.valueCents !== null
                ? ` That is ${formatCents(expired.valueCents)} on the books that is not really there.`
                : ''}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {undatedLots > 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>
              {plural(undatedLots, 'batch has', 'batches have')} no expiry date recorded
            </AlertTitle>
            <AlertDescription>
              They are listed below rather than left out. Nothing can warn you about a date nobody
              entered, and for stock that goes off, that is a gap worth closing at the receiving
              door.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>

      {/* ── Marking down ─────────────────────────────────────────────────── */}
      <Dialog
        open={acting?.kind === 'markdown'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogTitle>Mark down {acting?.lot.variantName ?? acting?.lot.lotNumber}</DialogTitle>
          <DialogDescription>
            The price change applies to the ITEM, not just this batch — a price is a property of
            what you sell, and per-batch pricing would have to reach the product page and the till
            as well. The original price is kept as the struck-through one.
          </DialogDescription>
          <div className="flex flex-col gap-3 py-2">
            <Field>
              <FieldLabel>Percent off</FieldLabel>
              <Input
                type="number"
                min={1}
                max={90}
                value={percent}
                onChange={(event) => {
                  setPercent(event.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Note</FieldLabel>
              <Input
                value={reason}
                placeholder="Short-dated clearance"
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" color="neutral">
                Cancel
              </Button>
            </DialogClose>
            <Button
              color="warning"
              disabled={markdown.isPending}
              onClick={() => {
                if (!acting) return;
                markdown.mutate(
                  {
                    lotId: acting.lot.lotId,
                    discountPercent: Number(percent) || 25,
                    ...(reason.trim() ? { note: reason.trim() } : {}),
                  },
                  {
                    onSuccess: (result) => {
                      closeDialog();
                      afterCommit(() => {
                        toast.add({
                          title: 'Price reduced',
                          description: `${formatCents(result.priceCentsBefore)} → ${formatCents(result.priceCentsAfter)}.`,
                          type: 'success',
                        });
                      });
                    },
                    onError: fail('Could not mark that down'),
                  }
                );
              }}
            >
              {markdown.isPending ? 'Saving…' : 'Reduce the price'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Writing off ──────────────────────────────────────────────────── */}
      <Dialog
        open={acting?.kind === 'writeOff'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogTitle>Write off {acting?.lot.lotNumber}</DialogTitle>
          <DialogDescription>
            {acting
              ? `${plural(acting.lot.quantity, 'unit', 'units')} comes off the shelf as a LOSS, not as damage — expired goods are a buying problem, and filing them as damage sends somebody looking for a thief who does not exist.`
              : ''}
          </DialogDescription>
          <div className="flex flex-col gap-3 py-2">
            <Field>
              <FieldLabel>Why</FieldLabel>
              <Textarea
                rows={2}
                value={reason}
                placeholder="Past its use-by date"
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" color="neutral">
                Cancel
              </Button>
            </DialogClose>
            <Button
              color="danger"
              disabled={writeOff.isPending || reason.trim().length === 0}
              onClick={() => {
                if (!acting) return;
                writeOff.mutate(
                  { lotId: acting.lot.lotId, reason: reason.trim() },
                  {
                    onSuccess: (result) => {
                      closeDialog();
                      afterCommit(() => {
                        toast.add({
                          title: `${plural(result.unitsWrittenOff, 'unit', 'units')} written off`,
                          description:
                            result.valueCents === null
                              ? 'Nothing had costed this batch, so no value was recorded against the loss.'
                              : `${formatCents(result.valueCents)} of stock, recorded as a loss.`,
                          type: 'info',
                        });
                      });
                    },
                    onError: fail('Could not write that off'),
                  }
                );
              }}
            >
              {writeOff.isPending ? 'Writing off…' : 'Write it off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
