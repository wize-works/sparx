'use client';

// ONE COMMITMENT — who is owed what, what they were told, and when it was told.
//
// The pane a salesperson opens with a customer on the phone. Three questions get
// answered in the order they get asked: where am I in the queue, when will it
// arrive, and has anything arrived already.
//
// ── Two dates that are not the same date ──────────────────────────────────
//
// `promisedAt` is what the system currently believes. `notifiedPromisedAt` is
// what the CUSTOMER was last actually told. They come apart all the time — the
// supplier slips, the queue re-dates overnight, and nobody sends an email — and
// the gap between them is the single most useful thing on this screen. A pane
// that showed only the current date would let somebody quote it confidently to a
// customer who is holding a different one.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  Table,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarOff, MailCheck, PackageSearch, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { afterCommit } from '../../lib/defer';
import { useConfirm } from '../../lib/confirm';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage } from './data';
import {
  backorderStatusTone,
  promiseSourceLabel,
  promiseTone,
  useBackorder,
  useCancelBackorder,
  useMarkBackorderNotified,
  useUpdateBackorder,
} from './demand-data';

/** `<input type="date">` wants `YYYY-MM-DD`; the API speaks ISO instants. */
function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

export function BackorderDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading, isError } = useBackorder(id);
  const update = useUpdateBackorder(id);
  const notify = useMarkBackorderNotified(id);
  const cancel = useCancelBackorder(id);

  const [promised, setPromised] = useState('');
  const [priority, setPriority] = useState('0');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!data) return;
    setPromised(toDateInput(data.promisedAt));
    setPriority(String(data.priority));
    setNote(data.note ?? '');
    ctx.setTitle(data.variantSku ? `Owed · ${data.variantSku}` : 'Owed');
  }, [data, ctx]);

  if (isLoading) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-base" role="status">
          Loading the commitment…
        </p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className={PANE_SHELL}>
        <EmptyState
          icon={<PackageSearch className="size-6" aria-hidden />}
          title="Could not load that commitment"
          description="It may have been cancelled, or the server is unreachable. Try the queue again."
        />
      </div>
    );
  }

  const isLive = data.status === 'open' || data.status === 'partial';
  const fail = (title: string) => (error: unknown) => {
    afterCommit(() => {
      toast.add({
        title,
        description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
        type: 'error',
      });
    });
  };

  const savePromise = () => {
    update.mutate(
      {
        promisedAt: promised ? new Date(`${promised}T00:00:00Z`).toISOString() : null,
        priority: Number(priority) || 0,
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: () => {
          afterCommit(() => {
            toast.add({
              title: promised ? 'Date saved' : 'Date cleared',
              description: promised
                ? 'Recorded as entered by hand, which outranks anything the system works out. Tell the customer, then mark it told.'
                : 'Better than leaving a date everyone knows is wrong on the screen.',
              type: 'success',
            });
          });
        },
        onError: fail('Could not save that'),
      }
    );
  };

  // What the customer holds versus what we now believe. The whole reason the two
  // are stored separately.
  const told = data.notifiedAt;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Commitment controls"
        primary={
          <Button
            color="primary"
            variant="soft"
            size="sm"
            className="ml-auto"
            disabled={notify.isPending || data.promisedAt === null}
            onClick={() => {
              notify.mutate(undefined, {
                onSuccess: () => {
                  afterCommit(() => {
                    toast.add({
                      title: 'Marked as told',
                      description:
                        'If the date moves from here, this commitment will show up as worth a second call.',
                      type: 'success',
                    });
                  });
                },
                onError: fail('Could not record that'),
              });
            }}
          >
            <MailCheck className="size-4" aria-hidden />
            Mark as told
          </Button>
        }
        controls={
          <>
            <Badge color={backorderStatusTone(data.status)} variant="soft">
              {data.isOverdue ? 'Past the date' : data.status}
            </Badge>
            {data.position !== null ? (
              <Text className="text-sm">
                Number {data.position} in the queue for this item at{' '}
                {data.warehouseName ?? 'this location'}
              </Text>
            ) : null}
            {isLive ? (
              <Button
                color="danger"
                variant="soft"
                size="sm"
                disabled={cancel.isPending}
                onClick={() => {
                  void confirm({
                    title: 'Drop this commitment?',
                    description: `${plural(data.outstanding, 'unit', 'units')} owed to ${data.customerName ?? 'a guest'} will stop being tracked. The order itself is untouched — do this only when the customer no longer wants it.`,
                    confirmLabel: 'Drop it',
                    cancelLabel: 'Keep it',
                    color: 'danger',
                  }).then((confirmed) => {
                    if (!confirmed) return;
                    cancel.mutate('Dropped from the queue by hand.', {
                      onSuccess: () => {
                        afterCommit(() => {
                          toast.add({ title: 'Commitment dropped', type: 'info' });
                        });
                      },
                      onError: fail('Could not drop it'),
                    });
                  });
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Drop
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid min-h-0 flex-1 gap-3 overflow-auto @3xl:grid-cols-2">
        {/* ── Who and what ─────────────────────────────────────────────── */}
        <FormSection title="What is owed">
          <div className="flex flex-col gap-2">
            <Text>
              {plural(data.outstanding, 'unit', 'units')} of{' '}
              <strong>{data.variantName ?? data.variantSku ?? 'an unnamed item'}</strong>
              {data.variantSku && data.variantName ? (
                <span className="ml-1.5 font-mono text-sm">{data.variantSku}</span>
              ) : null}
            </Text>
            <Text className="text-sm">
              For {data.customerName ?? 'a guest'}
              {data.orderNumber ? ` on ${data.orderNumber}` : ''}, waiting since{' '}
              <Timestamp value={data.createdAt} format="relative" />.
            </Text>
            {data.allocatedQuantity > 0 ? (
              <Text className="text-sm">
                {data.allocatedQuantity} of {data.quantity} already covered by stock that has
                landed.
              </Text>
            ) : null}
          </div>
        </FormSection>

        {/* ── The promise ──────────────────────────────────────────────── */}
        <FormSection className="bg-module bg-soft" title="When they will get it">
          <div className="flex flex-col gap-3">
            {data.promisedAt === null ? (
              <Alert color="danger" variant="soft">
                <AlertContent>
                  <AlertTitle>Nobody has promised a date</AlertTitle>
                  <AlertDescription>
                    Nothing here knows when more is coming, so nothing has been said. Raising a
                    purchase order with an expected arrival gives this a real date automatically —
                    or type one below if you know something the system does not.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={promiseTone(data.promiseSource)} variant="soft">
                  <Timestamp value={data.promisedAt} format="absolute" />
                </Badge>
                <Text className="text-sm">{promiseSourceLabel(data.promiseSource)}</Text>
                {data.expectedPurchaseOrderNumber ? (
                  <Text className="font-mono text-sm">{data.expectedPurchaseOrderNumber}</Text>
                ) : null}
              </div>
            )}

            {/* The gap that matters: what they hold vs what we believe. */}
            {told === null ? (
              <Text className="text-sm">
                {data.promisedAt === null
                  ? 'Nothing has been said to the customer, because there is nothing to say yet.'
                  : 'There is a date, and the customer has not been told it. That is the next thing to do.'}
              </Text>
            ) : (
              <Text className="text-sm">
                Last told <Timestamp value={told} format="relative" />.
              </Text>
            )}

            <Field>
              <FieldLabel>Date to give them</FieldLabel>
              <Input
                type="date"
                value={promised}
                onChange={(event) => {
                  setPromised(event.target.value);
                }}
              />
            </Field>

            <Field>
              <FieldLabel>Queue priority</FieldLabel>
              <Input
                type="number"
                value={priority}
                onChange={(event) => {
                  setPriority(event.target.value);
                }}
              />
              <Text className="text-sm">
                Higher goes first. Moving somebody up moves somebody else down, so it is recorded.
              </Text>
            </Field>

            <Field>
              <FieldLabel>Note</FieldLabel>
              <Textarea
                rows={2}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                color="module-inventory"
                size="sm"
                disabled={update.isPending || !isLive}
                onClick={savePromise}
              >
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
              {data.promisedAt !== null ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={update.isPending || !isLive}
                  onClick={() => {
                    setPromised('');
                    update.mutate(
                      { promisedAt: null },
                      {
                        onSuccess: () => {
                          afterCommit(() => {
                            toast.add({
                              title: 'Date cleared',
                              description:
                                'Honest is better than stale. This commitment now shows as having no date.',
                              type: 'info',
                            });
                          });
                        },
                        onError: fail('Could not clear it'),
                      }
                    );
                  }}
                >
                  <CalendarOff className="size-4" aria-hidden />
                  Clear the date
                </Button>
              ) : null}
            </div>
          </div>
        </FormSection>

        {/* ── What has arrived ─────────────────────────────────────────── */}
        <FormSection className="@3xl:col-span-2" title="Stock that has come in for this">
          <div className="p-0">
            {data.allocations.length === 0 ? (
              <EmptyState
                icon={<PackageSearch className="size-6" aria-hidden />}
                title="Nothing has arrived yet"
                description="When a delivery or a transfer lands, whatever it covers is recorded here — in queue order, so the split is never decided at the receiving desk."
              />
            ) : (
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Came from</th>
                    <th className="text-right">Units</th>
                    <th className="whitespace-nowrap">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.sourceType === 'goods_receipt'
                          ? 'A delivery'
                          : a.sourceType === 'transfer'
                            ? 'A transfer between locations'
                            : a.sourceType === 'count'
                              ? 'A stock count'
                              : 'Recorded by hand'}
                      </td>
                      <td className="text-right tabular-nums">{a.quantity}</td>
                      <td className="whitespace-nowrap">
                        <Timestamp value={a.allocatedAt} format="relative" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </FormSection>
      </div>
    </div>
  );
}
