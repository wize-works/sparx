'use client';

// SCAN A DELIVERY IN — point a gun at each box until the order is accounted for.
//
// ── The screen is one input and a scoreboard ──────────────────────────────
//
// Everything else on it is subordinate to two things: a field that always has
// focus, and a list showing how much of each ordered line is still outstanding.
// A receiver holding a carton has one hand free and about a second of attention
// per box, so anything that needs a click between scans does not survive contact
// with a loading dock.
//
// ── Nothing reaches the stock ledger until POST ───────────────────────────
//
// Scanning builds a session; posting turns it into a goods receipt. That split
// is what makes a mis-scan cost one undo instead of a stock correction, and it
// is why the post button is the only thing on this screen colored as the
// consequence it is.
//
// ── Over-receipt is refused by the server, not warned about here ──────────
//
// The refusal comes back as the scan result and gets read out loud by the same
// feedback line as a success. Nothing about the rule lives in this file, which
// is deliberate: the identical scan arriving through MCP or a replayed offline
// queue has to be refused the same way.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Progress,
  Table,
  Text,
  Timestamp,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { CircleCheck, PackageCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import { ScanInput, playScanFeedback } from './scan-input';
import {
  useReceivingSession,
  usePostScannedReceipt,
  useScanEvents,
  useScanQueue,
  useScanToReceive,
  useUndoReceivingScan,
  type ScanActionResult,
} from './scan-data';

export function ReceivingScanSurface({ ctx }: { ctx: SurfaceContext }) {
  const purchaseOrderId = typeof ctx.params.id === 'string' ? ctx.params.id : '';

  const [result, setResult] = useState<ScanActionResult | null>(null);
  const [damaged, setDamaged] = useState(0);
  const [reference, setReference] = useState('');

  const session = useReceivingSession(purchaseOrderId);
  const scan = useScanToReceive(purchaseOrderId);
  const undo = useUndoReceivingScan(purchaseOrderId);
  const post = usePostScannedReceipt(purchaseOrderId);
  const queue = useScanQueue();
  const events = useScanEvents({ contextType: 'receipt', contextId: purchaseOrderId, take: 25 });
  const confirm = useConfirm();

  const data = session.data;
  const lines = data?.lines ?? [];
  const scannedTotal = lines.reduce((sum, l) => sum + l.scanned, 0);
  const orderedTotal = lines.reduce((sum, l) => sum + l.ordered, 0);
  const previouslyTotal = lines.reduce((sum, l) => sum + l.receivedPreviously, 0);
  const accountedFor = previouslyTotal + scannedTotal;
  const complete = orderedTotal > 0 && accountedFor >= orderedTotal;
  const closed = data ? data.status !== 'submitted' && data.status !== 'partial' : false;

  const onScan = async (value: string) => {
    const outcome = await scan.mutateAsync({
      value,
      ...(damaged > 0 ? { damagedQuantity: damaged } : {}),
    });
    setResult(outcome);
    playScanFeedback(outcome.outcome);
    // The damaged count is per-box, not a mode. Leaving it latched is how three
    // good cartons get booked as broken.
    if (damaged > 0) setDamaged(0);
  };

  const postIt = async () => {
    const ok = await confirm({
      title: `Book ${plural(scannedTotal, 'unit', 'units')} into stock?`,
      description: complete
        ? 'This adds the stock, records what it cost, and closes the order. It cannot be undone from here — a mistake after this is a stock correction.'
        : `Only ${accountedFor} of ${orderedTotal} ordered are accounted for. The order stays open for the rest. This adds the stock and records what it cost, and cannot be undone from here.`,
      confirmLabel: 'Book it in',
      color: 'module-inventory',
    });
    if (!ok) return;
    post.mutate(
      { ...(reference.trim() ? { reference: reference.trim() } : {}) },
      {
        onSuccess: (receipt) => {
          setResult(null);
          setReference('');
          ctx.open('inventory.receiving.detail', { id: receipt.id }, { target: 'tab' });
        },
      }
    );
  };

  if (session.isLoading) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading the order…
        </p>
      </div>
    );
  }

  if (session.isError || !data) {
    return (
      <div className={PANE_SHELL}>
        <Alert color="danger" variant="soft" className="max-w-md">
          <AlertContent>
            <AlertTitle>Could not open this delivery</AlertTitle>
            <AlertDescription>
              The purchase order could not be read. Nothing has been booked in.
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Receiving controls"
        controls={
          <>
            {/* The consequence, colored as one. Everything else on this screen is
            reversible; this is the button that writes the ledger. */}
            <Button
              color="module-inventory"
              size="sm"
              disabled={scannedTotal === 0 || post.isPending || closed}
              onClick={() => {
                void postIt();
              }}
            >
              <PackageCheck className="size-4" aria-hidden />
              {post.isPending ? 'Booking in…' : 'Book it in'}
            </Button>
            <Input
              size="sm"
              className="max-w-44 shrink"
              placeholder="Packing slip ref"
              aria-label="Packing slip reference"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
              }}
            />
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={session.isFetching}
            updatedAt={session.dataUpdatedAt}
            onRefresh={() => {
              void session.refetch();
            }}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {/* Who and what, once, at the top. A receiver working two deliveries
            needs to be able to tell at a glance which one this screen is. */}
        <Card>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-lg font-semibold">{data.purchaseOrderNumber}</span>
                {data.supplierName ? <Text>{data.supplierName}</Text> : null}
                <Badge color="module-inventory" variant="soft" size="sm">
                  {data.warehouseName}
                </Badge>
              </span>
              <Badge color={complete ? 'success' : 'info'} size="lg">
                {accountedFor} of {orderedTotal}
              </Badge>
            </div>
            <Progress
              color={complete ? 'success' : 'module-inventory'}
              value={orderedTotal === 0 ? 0 : Math.min(100, (accountedFor / orderedTotal) * 100)}
              aria-label="How much of the order is accounted for"
            />
          </div>
        </Card>

        {closed ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>This order is {data.status}</AlertTitle>
              <AlertDescription>
                It can no longer be received against. Anything still outstanding needs a new order.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : (
          <Card>
            <div className="flex flex-col gap-3 p-4">
              <ScanInput
                onScan={onScan}
                placeholder="Scan a box"
                result={result}
                busy={scan.isPending}
                queued={queue.size}
                large
              />
              {/* Damaged is a per-box fact set BEFORE the scan, not a mode.
                  Anyone marking a carton damaged is holding it, looking at it,
                  and about to scan it. */}
              <div className="flex flex-wrap items-center gap-2">
                <Text className="text-sm">Broken in this box:</Text>
                {[0, 1, 2, 5].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={damaged === n ? 'solid' : 'outline'}
                    color={n === 0 ? 'neutral' : 'danger'}
                    onClick={() => {
                      setDamaged(n);
                    }}
                  >
                    {n === 0 ? 'None' : n}
                  </Button>
                ))}
                {damaged > 0 ? (
                  <Text className="text-sm">
                    The next scan books {damaged} of its units as arrived-but-broken. They are never
                    added to sellable stock.
                  </Text>
                ) : null}
              </div>
            </div>
          </Card>
        )}

        {/* The scoreboard. */}
        {lines.length === 0 ? (
          <EmptyState
            icon={<PackageCheck className="size-6" aria-hidden />}
            title="Nothing on this order"
            description="This purchase order has no lines, so there is nothing to receive against it."
          />
        ) : (
          <Table size="sm">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Ordered</th>
                <th className="hidden text-right @lg:table-cell">Already in</th>
                <th className="text-right">Scanned</th>
                <th className="text-right">Left</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.purchaseOrderLineId}>
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{line.productTitle}</span>
                      <span className="truncate font-mono text-sm">{line.sku}</span>
                      {line.primaryBarcode ? (
                        <span className="truncate font-mono text-sm">{line.primaryBarcode}</span>
                      ) : (
                        // The single most useful thing this screen can say about
                        // a line: you cannot scan this one, so do not stand there
                        // trying.
                        <Badge color="warning" variant="soft" size="sm">
                          No barcode — key it in
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{line.ordered}</td>
                  <td className="hidden text-right tabular-nums @lg:table-cell">
                    {line.receivedPreviously}
                  </td>
                  <td className="text-right tabular-nums">
                    {line.scanned > 0 ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <Badge color="module-inventory" size="sm">
                          {line.scanned}
                        </Badge>
                        {line.scannedDamaged > 0 ? (
                          <Badge color="danger" variant="soft" size="sm">
                            {line.scannedDamaged} broken
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      <Text className="text-sm">—</Text>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {line.outstanding === 0 ? (
                      <CircleCheck className="text-success inline size-4" aria-label="All in" />
                    ) : (
                      <span className="font-medium">{line.outstanding}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {/* Scans that hit nothing. Not an error toast that vanishes — a pile
            somebody has to deal with, which means it has to persist. */}
        {data.unresolved.length > 0 ? (
          <Alert color="warning">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            <AlertContent>
              <AlertTitle>
                {plural(data.unresolved.length, 'scan', 'scans')} did not match anything
              </AlertTitle>
              <AlertDescription>
                <span className="flex flex-col gap-1">
                  {data.unresolved.slice(0, 5).map((u) => (
                    <span key={`${u.value}-${u.scannedAt}`} className="font-mono text-sm">
                      {u.value}
                      {u.message ? ` — ${u.message}` : ''}
                    </span>
                  ))}
                </span>
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {/* The last few scans, each undoable. Undo is here rather than on the
            scoreboard because a mis-scan is remembered as "the last one", not as
            "line four". */}
        {(events.data?.items.length ?? 0) > 0 ? (
          <Card>
            <div className="flex flex-col gap-2 p-4">
              <Text className="font-medium">Just scanned</Text>
              <div className="flex flex-col gap-1">
                {(events.data?.items ?? [])
                  .filter((e) => e.outcome === 'applied')
                  .slice(0, 8)
                  .map((event) => (
                    <div
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                        <span className="truncate">{event.productTitle ?? event.value}</span>
                        <Badge color="module-inventory" variant="soft" size="sm">
                          +{event.quantity}
                        </Badge>
                        <Timestamp value={event.scannedAt} format="relative" />
                        {event.replayLagSeconds > 60 ? (
                          <Tooltip content="This scan waited on the device before it reached us — the time above is when the trigger was pulled.">
                            <Badge color="info" variant="soft" size="sm">
                              Synced late
                            </Badge>
                          </Tooltip>
                        ) : null}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost"
                        color="danger"
                        disabled={undo.isPending || closed}
                        onClick={() => {
                          undo.mutate(event.id);
                        }}
                      >
                        <Undo2 className="size-3.5" aria-hidden />
                        Undo
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
