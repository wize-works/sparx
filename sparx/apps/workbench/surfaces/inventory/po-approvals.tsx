'use client';

// ORDERS WAITING FOR SIGN-OFF.
//
// A spending control's real failure mode is not a wrong decision — it is NO
// decision. An order nobody signed for three weeks is stock nobody ordered, a
// customer nobody can serve, and a buyer who quietly stops using the system. So
// this queue is sorted oldest-first and every row wears how long it has waited,
// escalating on TIME rather than on money.
//
// ── Turning one down needs a reason ───────────────────────────────────────
//
// The server requires it and so does this screen. "No" without a reason sends
// the buyer back to guess what to change, and a year later the trail records a
// refusal nobody can explain. Approving needs no note: the order itself says
// what was agreed to.

import { useState } from 'react';
import {
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
  FieldControl,
  FieldDescription,
  FieldLabel,
  NativeSelect,
  Table,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, stockErrorMessage } from './data';
import {
  approvalStatusLabel,
  approvalStatusTone,
  useDecidePoApproval,
  usePoApprovalQueue,
  waitingTone,
  type PoApproval,
} from './po-approvals-data';

type QueueStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PoApprovalsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [status, setStatus] = useState<QueueStatus>('pending');
  const [rejecting, setRejecting] = useState<PoApproval | null>(null);
  const [reason, setReason] = useState('');

  const queue = usePoApprovalQueue(status);
  const decide = useDecidePoApproval();
  const toast = useToast();

  const rows = queue.data?.items ?? [];
  const pending = queue.data?.pending ?? 0;

  const openOrder = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.purchase-orders.detail', { id }, { target: targetFor(event) });
  };

  const onApprove = (row: PoApproval) => {
    decide.mutate(
      { id: row.id, decision: 'approved' },
      {
        onSuccess: () => {
          afterCommit(() => {
            toast.add({
              title: `${row.purchaseOrderNumber ?? 'Order'} approved`,
              description: `It has gone to ${row.supplierName ?? 'the supplier'}.`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not approve that order',
              description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  const onReject = () => {
    const row = rejecting;
    if (!row || reason.trim().length === 0) return;
    decide.mutate(
      { id: row.id, decision: 'rejected', note: reason.trim() },
      {
        onSuccess: () => {
          setRejecting(null);
          setReason('');
          afterCommit(() => {
            toast.add({
              title: `${row.purchaseOrderNumber ?? 'Order'} sent back`,
              description: 'It is a draft again, so the buyer can change it and ask once more.',
              type: 'info',
            });
          });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not turn that order down',
              description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  const body = () => {
    if (queue.isError) {
      return (
        <EmptyState
          icon={<ShieldCheck className="size-6" aria-hidden />}
          title="Could not load the approvals"
          description="This is a problem reaching the server, not a statement about what is waiting. Try again in a moment."
        />
      );
    }
    if (queue.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading what is waiting…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<ShieldCheck className="size-6" aria-hidden />}
          title={status === 'pending' ? 'Nothing is waiting on you' : 'Nothing here'}
          description={
            status === 'pending'
              ? 'Every order that needed signing off has been dealt with. Orders only appear here when they clear a limit set under Spending limits.'
              : 'No requests have reached this state.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Order</th>
            <th className="text-right whitespace-nowrap">Amount</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Asked by</th>
            <th className="whitespace-nowrap">{status === 'pending' ? 'Waiting' : 'Outcome'}</th>
            {status === 'pending' ? <th className="w-0" /> : null}
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
                openOrder(row.purchaseOrderId, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openOrder(row.purchaseOrderId, event);
              }}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    <span className="font-mono">{row.purchaseOrderNumber ?? '—'}</span>
                    {' · '}
                    {row.supplierName ?? 'Unnamed supplier'}
                  </span>
                  <span className="truncate text-sm">
                    {row.ruleName ? `Held by “${row.ruleName}”` : 'Held by a rule since removed'}
                    {row.requiredApproverName ? ` · ${row.requiredApproverName} to sign` : ''}
                  </span>
                  {row.note ? <span className="truncate text-sm">{row.note}</span> : null}
                </span>
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">
                {formatCents(row.amountCents, row.currency)}
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{row.requestedByName ?? 'Someone'}</span>
                  <span className="truncate text-sm">
                    <Timestamp value={row.requestedAt} format="relative" />
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                {status === 'pending' ? (
                  <Badge color={waitingTone(row.waitingDays)} variant="soft" size="sm">
                    {row.waitingDays === null
                      ? 'just now'
                      : row.waitingDays === 0
                        ? 'today'
                        : plural(row.waitingDays, 'day', 'days')}
                  </Badge>
                ) : (
                  <span className="flex min-w-0 flex-col">
                    <Badge color={approvalStatusTone(row.status)} variant="soft" size="sm">
                      {approvalStatusLabel(row.status)}
                    </Badge>
                    {row.decidedByName ? (
                      <span className="truncate text-sm">{row.decidedByName}</span>
                    ) : null}
                  </span>
                )}
              </td>
              {status === 'pending' ? (
                <td
                  className="w-0 whitespace-nowrap"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <span className="flex gap-1">
                    {/* Approve is the point of the screen, so it is solid and
                        colored; the dismiss half of the pair is the one that
                        earns neutral (DESIGN.md RULE #4). */}
                    <Button
                      size="sm"
                      color="success"
                      loading={decide.isPending}
                      onClick={() => {
                        onApprove(row);
                      }}
                    >
                      <Check className="size-4" aria-hidden />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      color="neutral"
                      onClick={() => {
                        setRejecting(row);
                        setReason('');
                      }}
                    >
                      <X className="size-4" aria-hidden />
                      Send back
                    </Button>
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Approval queue controls"
        status={
          <Text className="text-sm">
            {pending === 0
              ? 'Nothing waiting'
              : `${plural(pending, 'order is', 'orders are')} waiting for sign-off`}
          </Text>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-48 shrink"
              aria-label="Show requests that are"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as QueueStatus);
              }}
            >
              <option value="pending">Waiting</option>
              <option value="approved">Signed off</option>
              <option value="rejected">Turned down</option>
              <option value="cancelled">Withdrawn</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={queue.isFetching}
            updatedAt={queue.data ? queue.dataUpdatedAt : undefined}
            onRefresh={() => {
              void queue.refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>

      {/* A modal, and it clears all four tests: nothing is lost if abandoned,
          there is no durable thing to come back to, the queue behind it is not
          needed while typing, and it is one sentence. */}
      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>Send {rejecting?.purchaseOrderNumber ?? 'this order'} back</DialogTitle>
          <DialogDescription>
            The order goes back to a draft so the buyer can change it and ask again. Nothing is
            deleted.
          </DialogDescription>

          <div className="py-2">
            <Field>
              <FieldLabel>What needs to change before you would approve it?</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={reason}
                    placeholder="Too much for one order — split it, or get a second quote first."
                    onChange={(event) => {
                      setReason(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Required. The buyer sees it, and it stays on the order&apos;s history.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <DialogClose>
              <Button variant="outline" color="neutral">
                Keep waiting
              </Button>
            </DialogClose>
            <Button
              color="danger"
              disabled={reason.trim().length === 0}
              loading={decide.isPending}
              onClick={onReject}
            >
              Send it back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
