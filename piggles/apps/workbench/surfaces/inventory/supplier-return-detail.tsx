'use client';

// ONE RETURN — put it together, send it, then chase the credit.
//
// Create and edit are the same surface, so `{id:'new'}` renders the same pane
// that `{id}` does.
//
// ── Nothing leaves the shelf until you say it has ─────────────────────────
//
// A draft is a list being assembled while the pallet is still in the building.
// Stock only moves on "It has gone back", which is a button of its own rather
// than a status dropdown — taking units off a shelf must not be reachable by
// editing a form.
//
// ── The credit is the point ───────────────────────────────────────────────
//
// Every line carries what you PAID for those units, because that is what you are
// owed. A return with no cost on it records the stock movement and quietly
// writes the money off, which is the exact failure this screen exists to stop —
// so the server refuses a line it cannot cost, and asks.

import { useEffect, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Table } from '../../components/table';
import {
  faBan,
  faBoxOpen,
  faCirclePlus,
  faMoneyBill,
  faPaperPlane,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import { PANE_SHELL } from '../../components/pane-toolbar';
import { useConfirm } from '../../lib/confirm';
import { afterCommit } from '../../lib/defer';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, stockErrorMessage, useStockLocations } from './data';
import { useSuppliers, useVariantLookup } from './suppliers-data';
import {
  RETURN_REASONS,
  chaseTone,
  returnReasonLabel,
  returnReasonTone,
  returnStatusLabel,
  returnStatusTone,
  useCancelSupplierReturn,
  useCloseSupplierReturn,
  useCreateSupplierReturn,
  useRecordSupplierCredit,
  useSendSupplierReturn,
  useSupplierReturn,
  useUpdateSupplierReturn,
} from './supplier-returns-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

interface DraftLine {
  variantId: string;
  sku: string;
  productTitle: string | null;
  quantity: number;
  /** Whole currency units as typed; blank means "work it out from what we
   *  paid", which the server does — and refuses if it cannot. */
  unitCost: string;
}

export function SupplierReturnDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = ctx.params.id ?? 'new';
  const isNew = id === 'new';

  const existing = useSupplierReturn(id);
  const data = existing.data;

  if (isNew) return <NewReturn ctx={ctx} />;

  if (existing.isError) {
    return (
      <div className={PANE_SHELL}>
        <EmptyState
          icon={<Icon glyph={faBoxOpen} className="size-6" aria-hidden />}
          title="Could not load that return"
          description="This is a problem reaching the server, not a statement that the return is gone. Try again in a moment."
        />
      </div>
    );
  }
  if (existing.isLoading || !data) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting label="Loading the return…" />
      </div>
    );
  }

  return <ExistingReturn ctx={ctx} id={id} />;
}

/* ── Putting one together ───────────────────────────────────────────────── */

function NewReturn({ ctx }: { ctx: SurfaceContext }) {
  const suppliers = useSuppliers({ includeArchived: false, take: 250, skip: 0 });
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);

  const create = useCreateSupplierReturn();
  const lookup = useVariantLookup();
  const toast = useToast();

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState<string>('damaged');
  const [rmaNumber, setRmaNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [skuInput, setSkuInput] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (warehouseId === '' && activeLocations.length > 0) {
      setWarehouseId(activeLocations[0]?.id ?? '');
    }
  }, [activeLocations, warehouseId]);

  useDirtySource(dirty, 'This return has not been saved. Close it anyway?');

  const addLine = () => {
    const sku = skuInput.trim();
    if (sku === '') return;
    lookup.mutate(sku, {
      onSuccess: (found) => {
        setSkuInput('');
        setDirty(true);
        setLines((current) => [
          ...current,
          {
            variantId: found.variantId,
            sku: found.sku,
            productTitle: found.productTitle,
            quantity: 1,
            unitCost: '',
          },
        ]);
      },
      onError: () => {
        afterCommit(() => {
          toast.add({
            title: 'No item with that code',
            description: `Nothing in your catalog is coded “${sku}”. Check the code and try again.`,
            type: 'error',
          });
        });
      },
    });
  };

  const canSave =
    supplierId !== '' &&
    warehouseId !== '' &&
    lines.length > 0 &&
    lines.every((l) => l.quantity > 0);

  const onSave = () => {
    create.mutate(
      {
        supplierId,
        warehouseId,
        reason,
        ...(rmaNumber.trim() ? { rmaNumber: rmaNumber.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          ...(line.unitCost.trim() !== '' && Number.isFinite(Number(line.unitCost))
            ? { unitCostCents: Math.round(Number(line.unitCost) * 100) }
            : {}),
        })),
      },
      {
        onSuccess: (saved) => {
          setDirty(false);
          afterCommit(() => {
            toast.add({
              title: `${saved.number} put together`,
              description: `${formatCents(saved.creditExpectedCents, saved.currency)} to claim back. Nothing has left the shelf yet.`,
              type: 'success',
            });
          });
          ctx.open('inventory.supplier-returns.detail', { id: saved.id });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not save that return',
              description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  return (
    <div className={`${PANE_SHELL} overflow-y-auto`}>
      <div className={COLUMN}>
        <Heading level={2} className="text-lg">
          Send something back to a supplier
        </Heading>

        <FormSection
          title="Who and where"
          description="Which supplier it goes back to, and which of your locations it is leaving."
        >
          <Field>
            <FieldLabel>Supplier</FieldLabel>
            <FieldControl
              render={
                <NativeSelect
                  color="module"
                  value={supplierId}
                  onChange={(event) => {
                    setSupplierId(event.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="">Choose a supplier…</option>
                  {(suppliers.data?.items ?? []).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </NativeSelect>
              }
            />
          </Field>
          <Field>
            <FieldLabel>Leaving from</FieldLabel>
            <FieldControl
              render={
                <NativeSelect
                  color="module"
                  value={warehouseId}
                  onChange={(event) => {
                    setWarehouseId(event.target.value);
                    setDirty(true);
                  }}
                >
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>
              }
            />
          </Field>
        </FormSection>

        <FormSection
          title="Why it is going back"
          description="This is what you will be quoting at them, and it is what their record is scored on."
        >
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <FieldControl
              render={
                <NativeSelect
                  color="module"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setDirty(true);
                  }}
                >
                  {RETURN_REASONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              }
            />
          </Field>
          <Field>
            <FieldLabel>Their return number</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={rmaNumber}
                  placeholder="RMA-4471"
                  onChange={(event) => {
                    setRmaNumber(event.target.value);
                    setDirty(true);
                  }}
                />
              }
            />
            <FieldDescription>
              Most distributors will not accept a pallet back without one. Leave it blank if they
              have not given you one yet — you can add it later.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <FieldControl
              render={
                <Textarea
                  color="module"
                  rows={2}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setDirty(true);
                  }}
                />
              }
            />
          </Field>
        </FormSection>

        <FormSection
          title="What is going back"
          description="Add each item by its code. Leave the cost blank and we will use what you paid."
        >
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel>Item code</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={skuInput}
                    placeholder="PUMP-4471"
                    onChange={(event) => {
                      setSkuInput(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      addLine();
                    }}
                  />
                }
              />
            </Field>
            <Button color="module" loading={lookup.isPending} onClick={addLine}>
              <Icon glyph={faCirclePlus} className="size-4" aria-hidden />
              Add
            </Button>
          </div>

          {lines.length === 0 ? (
            <Text className="text-sm">Nothing added yet.</Text>
          ) : (
            <Table size="sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="w-24 text-right">Going back</th>
                  <th className="w-32 text-right">Paid each</th>
                  <th className="w-0" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.variantId}:${index}`}>
                    <td className="w-full max-w-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{line.productTitle ?? 'Untitled product'}</span>
                        <span className="truncate font-mono text-sm">{line.sku}</span>
                      </span>
                    </td>
                    <td>
                      <Input
                        size="sm"
                        color="module"
                        type="number"
                        min={1}
                        aria-label={`How many ${line.sku} are going back`}
                        value={line.quantity}
                        onChange={(event) => {
                          const quantity = Number.parseInt(event.target.value, 10);
                          setDirty(true);
                          setLines((current) =>
                            current.map((l, i) =>
                              i === index
                                ? { ...l, quantity: Number.isFinite(quantity) ? quantity : 1 }
                                : l
                            )
                          );
                        }}
                      />
                    </td>
                    <td>
                      <Input
                        size="sm"
                        color="module"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="What you paid"
                        aria-label={`What you paid for each ${line.sku}`}
                        value={line.unitCost}
                        onChange={(event) => {
                          const unitCost = event.target.value;
                          setDirty(true);
                          setLines((current) =>
                            current.map((l, i) => (i === index ? { ...l, unitCost } : l))
                          );
                        }}
                      />
                    </td>
                    <td className="w-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        aria-label={`Remove ${line.sku}`}
                        onClick={() => {
                          setDirty(true);
                          setLines((current) => current.filter((_, i) => i !== index));
                        }}
                      >
                        <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </FormSection>

        <div className="flex flex-wrap items-center gap-2 pb-4">
          <Button color="module" disabled={!canSave} loading={create.isPending} onClick={onSave}>
            Put the return together
          </Button>
          <Text className="text-sm">
            Nothing leaves the shelf yet — you send it on the next screen.
          </Text>
        </div>
      </div>
    </div>
  );
}

/* ── Working an existing one ────────────────────────────────────────────── */

function ExistingReturn({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const existing = useSupplierReturn(id);
  const update = useUpdateSupplierReturn(id);
  const send = useSendSupplierReturn(id);
  const credit = useRecordSupplierCredit(id);
  const close = useCloseSupplierReturn(id);
  const cancel = useCancelSupplierReturn(id);
  const confirm = useConfirm();
  const toast = useToast();

  const data = existing.data;
  const [creditAmount, setCreditAmount] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackingDirty, setTrackingDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    setCreditAmount((data.creditExpectedCents / 100).toString());
    setTracking(data.trackingNumber ?? '');
    setTrackingDirty(false);
  }, [data]);

  if (!data) return null;

  const fail = (title: string) => (error: unknown) => {
    afterCommit(() => {
      toast.add({
        title,
        description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
        type: 'error',
      });
    });
  };

  const onSend = async () => {
    const ok = await confirm({
      title: `Send ${data.number} back?`,
      description: `${plural(data.lines.length, 'item', 'items')} will come off the shelf at ${data.warehouseName ?? 'this location'}, and ${formatCents(data.creditExpectedCents, data.currency)} goes on the list of what this supplier owes you. This cannot be undone from here — a mistake is corrected with a count.`,
      confirmLabel: 'It has gone back',
      cancelLabel: 'Not yet',
      color: 'warning',
    });
    if (!ok) return;
    send.mutate(undefined, {
      onSuccess: () => {
        afterCommit(() => {
          toast.add({
            title: `${data.number} sent`,
            description: `${formatCents(data.creditExpectedCents, data.currency)} now owed by ${data.supplierName ?? 'the supplier'}.`,
            type: 'success',
          });
        });
      },
      onError: fail('Could not send that return'),
    });
  };

  const onCredit = () => {
    const parsed = Number.parseFloat(creditAmount);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    credit.mutate(
      { creditReceivedCents: Math.round(parsed * 100) },
      {
        onSuccess: (saved) => {
          afterCommit(() => {
            toast.add({
              title: 'Credit recorded',
              description:
                (saved.creditShortfallCents ?? 0) > 0
                  ? `${formatCents(saved.creditShortfallCents ?? 0, saved.currency)} less than expected — worth querying.`
                  : 'Settled in full.',
              type: (saved.creditShortfallCents ?? 0) > 0 ? 'warning' : 'success',
            });
          });
        },
        onError: fail('Could not record that credit'),
      }
    );
  };

  const onClose = async () => {
    const ok = await confirm({
      title: `Write off ${formatCents(data.creditExpectedCents, data.currency)}?`,
      description:
        'This says you have accepted that no credit is coming. The return stays on the record, and the money stops being chased.',
      confirmLabel: 'Write it off',
      cancelLabel: 'Keep chasing',
      color: 'danger',
    });
    if (!ok) return;
    close.mutate('No credit expected — written off.', {
      onSuccess: () => {
        afterCommit(() => {
          toast.add({ title: `${data.number} written off`, type: 'info' });
        });
      },
      onError: fail('Could not close that return'),
    });
  };

  const onCancel = async () => {
    const ok = await confirm({
      title: `Abandon ${data.number}?`,
      description: 'Nothing has left the shelf, so nothing needs putting back. The record stays.',
      confirmLabel: 'Abandon it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    cancel.mutate(undefined, {
      onSuccess: () => {
        afterCommit(() => {
          toast.add({ title: `${data.number} abandoned`, type: 'info' });
        });
        ctx.close();
      },
      onError: fail('Could not abandon that return'),
    });
  };

  const onSaveTracking = () => {
    update.mutate(
      { trackingNumber: tracking.trim() === '' ? null : tracking.trim() },
      {
        onSuccess: () => {
          setTrackingDirty(false);
          afterCommit(() => {
            toast.add({ title: 'Tracking saved', type: 'success' });
          });
        },
        onError: fail('Could not save that tracking number'),
      }
    );
  };

  return (
    <div className={`${PANE_SHELL} overflow-y-auto`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2} className="text-lg">
          <span className="font-mono">{data.number}</span> · {data.supplierName ?? 'Supplier'}
        </Heading>
        <div className="flex items-center gap-2">
          <Badge color={returnReasonTone(data.reason)} variant="soft">
            {returnReasonLabel(data.reason)}
          </Badge>
          <Badge color={returnStatusTone(data.status)} variant="soft">
            {returnStatusLabel(data.status)}
          </Badge>
        </div>
      </div>

      <Stats className="w-full">
        <Stat>
          <StatTitle>You are owed</StatTitle>
          <StatValue>{formatCents(data.creditExpectedCents, data.currency)}</StatValue>
          <StatDesc>at what you paid for these units</StatDesc>
        </Stat>
        <Stat>
          <StatTitle>They have credited</StatTitle>
          {/* NULL is not zero. "Waiting" and "they gave us nothing" are
              different facts and only one of them should stop the chasing. */}
          <StatValue>
            {data.creditReceivedCents === null
              ? 'Nothing yet'
              : formatCents(data.creditReceivedCents, data.currency)}
          </StatValue>
          <StatDesc>
            {data.creditReceivedCents === null
              ? 'no credit note recorded'
              : (data.creditShortfallCents ?? 0) > 0
                ? `${formatCents(data.creditShortfallCents ?? 0, data.currency)} short`
                : 'settled in full'}
          </StatDesc>
        </Stat>
        <Stat>
          <StatTitle>Waiting</StatTitle>
          <StatValue>
            {data.awaitingCreditDays === null ? (
              data.sentAt ? (
                <Timestamp value={data.sentAt} format="relative" />
              ) : (
                'Not sent'
              )
            ) : (
              <Badge color={chaseTone(data.awaitingCreditDays)} variant="soft">
                {plural(data.awaitingCreditDays, 'day', 'days')}
              </Badge>
            )}
          </StatValue>
          <StatDesc>{data.rmaNumber ? `their ref ${data.rmaNumber}` : 'no return number'}</StatDesc>
        </Stat>
      </Stats>

      {data.status === 'sent' && (data.awaitingCreditDays ?? 0) >= 30 ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>This has been outstanding for over a month</AlertTitle>
            <AlertDescription>
              Most suppliers&apos; own terms say a credit should have been issued by now. Either
              chase it, or write it off deliberately so it stops sitting on your list.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {/* `shrink-0`: this pane is one scrolling COLUMN, and a card that may
          shrink absorbs the whole overflow — squashing the lines to a couple of
          rows while the column itself never scrolls. */}
      <Card className="shrink-0 overflow-x-auto">
        <Table size="sm">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right whitespace-nowrap">Quantity</th>
              <th className="text-right whitespace-nowrap">Paid each</th>
              <th className="text-right whitespace-nowrap">Worth</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.id}>
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{line.productTitle ?? 'Untitled product'}</span>
                    <span className="truncate text-sm">
                      <span className="font-mono">{line.variantSku ?? 'No code'}</span>
                      {line.lotNumber ? ` · batch ${line.lotNumber}` : ''}
                    </span>
                  </span>
                </td>
                <td className="text-right tabular-nums">{line.quantity}</td>
                <td className="text-right tabular-nums">
                  {formatCents(line.unitCostCents, data.currency)}
                </td>
                <td className="text-right tabular-nums">
                  {formatCents(line.lineTotalCents, data.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {data.status === 'draft' ? (
        <div className="flex flex-wrap items-center gap-2 pb-4">
          <Button
            color="warning"
            loading={send.isPending}
            onClick={() => {
              void onSend();
            }}
          >
            <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
            It has gone back
          </Button>
          <Button
            className="ml-auto"
            variant="outline"
            color="danger"
            loading={cancel.isPending}
            onClick={() => {
              void onCancel();
            }}
          >
            <Icon glyph={faBan} className="size-4" aria-hidden />
            Abandon
          </Button>
        </div>
      ) : null}

      {data.status === 'sent' ? (
        <Card className="flex flex-col gap-3 p-3">
          <Heading level={3} className="text-base">
            When the credit comes
          </Heading>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="max-w-48">
              <FieldLabel>They credited</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="number"
                    min={0}
                    step="0.01"
                    value={creditAmount}
                    onChange={(event) => {
                      setCreditAmount(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Button color="success" loading={credit.isPending} onClick={onCredit}>
              <Icon glyph={faMoneyBill} className="size-4" aria-hidden />
              Record the credit
            </Button>
            <Button
              className="ml-auto"
              variant="outline"
              color="danger"
              loading={close.isPending}
              onClick={() => {
                void onClose();
              }}
            >
              Write it off
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field className="max-w-64">
              <FieldLabel>Tracking number</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={tracking}
                    placeholder="Added after the carrier collects"
                    onChange={(event) => {
                      setTracking(event.target.value);
                      setTrackingDirty(true);
                    }}
                  />
                }
              />
            </Field>
            <Button
              variant="outline"
              color="module"
              disabled={!trackingDirty}
              loading={update.isPending}
              onClick={onSaveTracking}
            >
              Save
            </Button>
          </div>
        </Card>
      ) : null}

      {data.notes ? <Text className="text-sm">{data.notes}</Text> : null}
    </div>
  );
}
