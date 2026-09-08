'use client';

// ONE DELIVERY — book in what turned up against an order, including when it is
// not quite what you ordered.
//
// ── Create or read; never edit ────────────────────────────────────────────
//
// `{id:'new'}` is the booking form; `{id}` is a receipt already posted, shown
// read-only — a receipt is a permanent record, and a mistake is put right by a
// later stock count, never by editing history. So there is no "manage" state
// here, just book-it and view-it.
//
// ── Where it lands is the order's decision, not a choice here ──────────────
//
// Goods are booked into the location the purchase order already names — the
// server takes the warehouse from the order — so this pane SHOWS where they land
// rather than offering a picker that would be a lie.
//
// ── What arrived vs what was ordered ──────────────────────────────────────
//
// Each line shows what is still outstanding and reacts as you type: short, exact,
// or more than expected, in plain words. Anything damaged is sent as its own
// count: the stock ledger records it arriving and then being written off, so it
// is NEVER added to sellable stock and NEVER counted against the order — the
// supplier still owes those units. If what you book differs from what was
// outstanding, posting asks you to confirm, because a receipt moves real stock
// numbers and cannot be edited afterwards.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Combobox,
  DateInput,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Table,
  Textarea,
  Text,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ClipboardList, Coins, PackageCheck, PackageX, Plus, Printer, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import { buyingErrorMessage, isNotFound } from './suppliers-data';
import {
  formatDay,
  outstandingUnits,
  usePurchaseOrder,
  usePurchaseOrders,
  type PurchaseOrderLine,
} from './purchase-orders-data';
import {
  receiptLineState,
  useCreateReceipt,
  useReceipt,
  type GoodsReceiptDetail,
  type ReceiveChargeInput,
  type ReceiveLineInput,
} from './receiving-data';
import {
  ALLOCATION_BASES,
  CHARGE_KINDS,
  basisLabel,
  chargeKindLabel,
  chargeSharePercent,
  chargeShareTone,
  useAddReceiptCharge,
  useRemoveReceiptCharge,
  type AllocationBasis,
  type ChargeKind,
} from './costing-data';
import { describeQuantityShort } from './assembly-data';
import { ReceiptBillPanel } from './receipt-bill-panel';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

interface LineEntry {
  received: string;
  damaged: string;
  /** Optional batch / lot code for this line — only sent when the buyer types one. */
  lot: string;
}

/**
 * One extra cost being typed in.
 *
 * Held as strings because it is a form: a half-typed "12." is a legitimate
 * intermediate state and parsing on every keystroke would eat the decimal point.
 */
interface ChargeDraft {
  kind: ChargeKind;
  amount: string;
  basis: AllocationBasis;
}

/** Pounds-and-pence as typed → whole pence. Returns null for anything that is
 *  not yet a number, so a half-typed amount is simply not sent rather than
 *  being sent as a zero. */
function parseAmountCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function outstandingFor(line: PurchaseOrderLine): number {
  return Math.max(0, line.quantityOrdered - line.quantityReceived);
}

/* ── Booking a delivery ─────────────────────────────────────────────────── */

function BookDelivery({ ctx, preTargetPoId }: { ctx: SurfaceContext; preTargetPoId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const createReceipt = useCreateReceipt();

  const [poId, setPoId] = useState(preTargetPoId);
  const [entries, setEntries] = useState<Record<string, LineEntry>>({});
  const [receivedAt, setReceivedAt] = useState<Date | null>(() => new Date());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  // What getting it here cost. An editable list rather than three fixed boxes:
  // most deliveries have none of these and an imported one has three, so a fixed
  // set of fields would be wrong for both.
  const [charges, setCharges] = useState<ChargeDraft[]>([]);

  // The pool the picker chooses from: orders you can still receive against. Two
  // server queries because "receivable" is two statuses (placed + partly
  // received) and the endpoint filters by one at a time — merged, never sieved.
  const submitted = usePurchaseOrders({ status: 'submitted', take: 250, skip: 0 });
  const partial = usePurchaseOrders({ status: 'partial', take: 250, skip: 0 });
  const receivable = useMemo(
    () => [...(submitted.data?.items ?? []), ...(partial.data?.items ?? [])],
    [submitted.data, partial.data]
  );

  // 'new' keeps the query disabled until a real order is chosen — an empty id
  // would otherwise fire a request for `/purchase-orders/` and 404.
  const poDetail = usePurchaseOrder(poId === '' ? 'new' : poId);
  const detail = poId !== '' ? (poDetail.data ?? null) : null;

  // Seed each line blank when the order lands — a deliberate entry per line, so a
  // full delivery is a "fill it in" click rather than a silent pre-tick that
  // over-books whatever the buyer did not glance at.
  useEffect(() => {
    if (!detail) return;
    const next: Record<string, LineEntry> = {};
    for (const line of detail.lines) next[line.id] = { received: '', damaged: '', lot: '' };
    setEntries(next);
  }, [detail]);

  useEffect(() => {
    ctx.setTitle('Receive a delivery');
  }, [ctx]);

  const setEntry = (lineId: string, key: keyof LineEntry, value: string) => {
    setEntries((current) => ({
      ...current,
      [lineId]: { received: '', damaged: '', lot: '', ...current[lineId], [key]: value },
    }));
  };

  const fillOutstanding = () => {
    if (!detail) return;
    const next: Record<string, LineEntry> = {};
    for (const line of detail.lines) {
      const out = outstandingFor(line);
      next[line.id] = {
        received: out > 0 ? String(out) : '',
        damaged: '',
        // Keep any batch code already typed — filling quantities shouldn't wipe it.
        lot: entries[line.id]?.lot ?? '',
      };
    }
    setEntries(next);
  };

  const parsed = (detail?.lines ?? []).map((line) => {
    const entry = entries[line.id] ?? { received: '', damaged: '', lot: '' };
    const received = Number.parseInt(entry.received, 10);
    const damaged = Number.parseInt(entry.damaged, 10);
    return {
      line,
      outstanding: outstandingFor(line),
      received: Number.isFinite(received) && received > 0 ? received : 0,
      damaged: Number.isFinite(damaged) && damaged > 0 ? damaged : 0,
      lot: entry.lot.trim(),
    };
  });

  // A line is being booked when it records SOME arrival — good units, damaged
  // units, or both. A total-loss line (0 good, some damaged) counts here even
  // though nothing joins stock, so it can be posted and the loss recorded.
  const toBook = parsed.filter((row) => row.received > 0 || row.damaged > 0);
  const totalUnits = toBook.reduce((sum, row) => sum + row.received, 0);
  const totalDamaged = toBook.reduce((sum, row) => sum + row.damaged, 0);
  // Anything that is not "exactly what was outstanding, all good" is a discrepancy
  // worth confirming — short, over, some damaged, or fully damaged.
  const anyDiscrepancy = toBook.some((row) => row.received !== row.outstanding || row.damaged > 0);
  const anyInvalid = parsed.some((row) => {
    const entry = entries[row.line.id];
    if (!entry) return false;
    return (
      (entry.received.trim() !== '' && !Number.isInteger(Number(entry.received))) ||
      (entry.damaged.trim() !== '' && !Number.isInteger(Number(entry.damaged)))
    );
  });

  const chargeInputs: ReceiveChargeInput[] = charges
    .map((c) => ({ kind: c.kind, amountCents: parseAmountCents(c.amount), basis: c.basis }))
    .filter(
      (c): c is { kind: ChargeKind; amountCents: number; basis: AllocationBasis } =>
        c.amountCents !== null && c.amountCents > 0
    )
    .map((c) => ({ kind: c.kind, amountCents: c.amountCents, allocationBasis: c.basis }));
  const chargeTotalCents = chargeInputs.reduce((sum, c) => sum + c.amountCents, 0);

  const dirty =
    toBook.length > 0 || note.trim() !== '' || reference.trim() !== '' || charges.length > 0;
  const canPost = poId !== '' && toBook.length > 0 && !anyInvalid && detail !== null;

  useDirtySource(dirty, 'You have a delivery you have not booked in yet. Close anyway?');

  const post = async () => {
    if (!canPost || !detail) return;

    if (anyDiscrepancy) {
      const shorts = toBook.filter((row) => row.received > 0 && row.received < row.outstanding);
      const overs = toBook.filter((row) => row.received > row.outstanding);
      // Fully-damaged (total-loss) lines vs lines that arrived partly damaged —
      // named separately so a total loss reads truthfully.
      const fullyDamaged = toBook.filter((row) => row.received === 0 && row.damaged > 0);
      const partlyDamaged = toBook.filter((row) => row.received > 0 && row.damaged > 0);
      const notes: string[] = [];
      if (shorts.length > 0) {
        notes.push(`${String(shorts.length)} line(s) are short of what was outstanding`);
      }
      if (overs.length > 0) {
        notes.push(`${String(overs.length)} line(s) have more than was expected`);
      }
      if (fullyDamaged.length > 0) {
        const units = fullyDamaged.reduce((sum, row) => sum + row.damaged, 0);
        notes.push(
          `${String(units)} unit(s) across ${String(fullyDamaged.length)} line(s) arrived fully damaged — nothing received against the order; recorded and written off, and the order stays open for them`
        );
      }
      if (partlyDamaged.length > 0) {
        notes.push(
          `${String(partlyDamaged.length)} line(s) had some damaged units — recorded and written off, not added to sellable stock or counted against the order`
        );
      }
      const ok = await confirm({
        title: 'Book this delivery as counted?',
        description: `${notes.join('; ')}. Booking moves your stock numbers and cannot be undone by editing — a later correction is a stock count. Post it exactly as you have entered it?`,
        confirmLabel: 'Book it in',
        cancelLabel: 'Go back',
        color: 'warning',
      });
      if (!ok) return;
    }

    const lines: ReceiveLineInput[] = toBook.map((row) => ({
      purchaseOrderLineId: row.line.id,
      // May be 0 on a total-loss line — the server writes only the damaged pair,
      // credits the order by nothing, and leaves it open.
      quantity: row.received,
      // Damaged units ride the same line — the server records them arriving and
      // then writing them off, so they never join sellable stock or the order.
      ...(row.damaged > 0 ? { quantityDamaged: row.damaged } : {}),
      // Only a line with good units and a batch code the buyer typed becomes a
      // traceable lot — there is nothing to trace on a fully-damaged line.
      ...(row.received > 0 && row.lot ? { lotNumber: row.lot } : {}),
    }));

    createReceipt.mutate(
      {
        purchaseOrderId: poId,
        ...(receivedAt ? { receivedAt: receivedAt.toISOString() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        lines,
        ...(chargeInputs.length > 0 ? { charges: chargeInputs } : {}),
      },
      {
        onSuccess: (receipt) => {
          ctx.open('inventory.receiving.detail', { id: receipt.id }, { target: 'replace' });
          afterPaneChange(() => {
            const description =
              totalUnits > 0
                ? `${String(totalUnits)} unit${totalUnits === 1 ? '' : 's'} added to your stock.${
                    totalDamaged > 0
                      ? ` ${String(totalDamaged)} damaged unit${totalDamaged === 1 ? '' : 's'} recorded and written off.`
                      : ''
                  }`
                : `A total loss of ${String(totalDamaged)} damaged unit${totalDamaged === 1 ? '' : 's'} was recorded and written off. Nothing was added to stock and the order stays open.`;
            toast.add({
              title: `Delivery booked in as ${receipt.number}`,
              description,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not book that delivery',
            description: buyingErrorMessage(
              error,
              'Nothing was changed. Your stock is unaffected.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  // Memoised so the Combobox's items keep a stable identity across renders (Base
  // UI re-keys its effect on the array otherwise, and matches selection by ref).
  const receivableOptions = useMemo(
    () =>
      receivable.map((po) => ({
        value: po.id,
        label: `${po.number} · ${po.supplierName ?? 'supplier'} · ${String(outstandingUnits(po))} due`,
      })),
    [receivable]
  );
  const selectedOption = receivableOptions.find((option) => option.value === poId) ?? null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Receive a delivery actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <PackageCheck className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Receive a delivery
            </Text>
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!canPost}
            loading={createReceipt.isPending}
            onClick={() => {
              void post();
            }}
          >
            <PackageCheck className="size-4" aria-hidden />
            Book it in
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Book in a delivery
            </Heading>
            <Text>
              Pick the order it is for, enter what actually turned up, and book it in. That is the
              moment your stock numbers go up.
            </Text>
          </div>

          {/* Choosing the order — only when not opened from one already. */}
          {preTargetPoId === '' ? (
            <FormSection title="Which order is this for?">
              <Field>
                <FieldLabel required>Purchase order</FieldLabel>
                <Combobox
                  color="module"
                  items={receivableOptions}
                  value={selectedOption}
                  placeholder={
                    receivableOptions.length === 0
                      ? 'No orders are waiting to be received'
                      : 'Find the order this delivery is for…'
                  }
                  emptyMessage="No order matches that."
                  aria-label="Purchase order"
                  clearable={false}
                  onValueChange={(next) => {
                    const option = next as { value: string } | null;
                    if (option) setPoId(option.value);
                  }}
                />
                <FieldDescription>
                  Only orders you have placed and not fully received appear here.
                </FieldDescription>
              </Field>
            </FormSection>
          ) : null}

          {poId === '' ? null : poDetail.isError ? (
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertTitle>Could not load that order</AlertTitle>
                <AlertDescription>
                  {isNotFound(poDetail.error)
                    ? 'The order could not be found. It may have been cancelled.'
                    : 'This is a problem reaching the server. Try again.'}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : poDetail.isPending ? (
            <p className="p-4 text-sm" role="status">
              Loading the order…
            </p>
          ) : detail ? (
            <>
              <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ClipboardList className="size-4 shrink-0" aria-hidden />
                  <div className="flex min-w-0 flex-col">
                    <Text className="font-mono font-medium">{detail.number}</Text>
                    <Text className="text-sm">{detail.supplierName ?? 'No supplier'}</Text>
                  </div>
                </div>
                <Text className="text-sm">
                  Booking into{' '}
                  <span className="font-medium">
                    {detail.warehouseName ?? 'the order location'}
                  </span>
                </Text>
              </div>

              <FormSection
                title="What turned up"
                description="Enter how many good units arrived for each line. Put anything that turned up damaged in the Damaged box — it is recorded and written off, so it never joins your sellable stock and the order stays open for it."
                action={
                  <Button size="sm" variant="outline" color="neutral" onClick={fillOutstanding}>
                    Fill in what&apos;s outstanding
                  </Button>
                }
              >
                <Table size="sm">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right whitespace-nowrap">Outstanding</th>
                      <th className="whitespace-nowrap">Received now</th>
                      <th className="hidden whitespace-nowrap @lg:table-cell">Batch / lot</th>
                      <th className="hidden whitespace-nowrap @md:table-cell">Damaged</th>
                      <th>How it lands</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((row) => {
                      const state = receiptLineState(row.received, row.outstanding, row.damaged);
                      // A fully-damaged line has nothing to trace, so its batch
                      // field is switched off (and any typed code is not sent).
                      const lotDisabled = row.received === 0 && row.damaged > 0;
                      return (
                        <tr key={row.line.id}>
                          <td className="w-full max-w-0">
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate">
                                {row.line.description ?? row.line.productTitle ?? 'Item'}
                              </span>
                              <span className="truncate font-mono text-sm">
                                {row.line.variantSku ?? 'No code'}
                              </span>
                            </span>
                          </td>
                          <td className="text-right tabular-nums">{row.outstanding}</td>
                          <td>
                            <Input
                              color="module"
                              size="sm"
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`Received now for ${row.line.variantSku ?? 'item'}`}
                              className="w-20 text-right tabular-nums"
                              value={entries[row.line.id]?.received ?? ''}
                              onChange={(event) => {
                                setEntry(row.line.id, 'received', event.target.value);
                              }}
                            />
                          </td>
                          <td className="hidden @lg:table-cell">
                            <Input
                              color="module"
                              size="sm"
                              maxLength={63}
                              disabled={lotDisabled}
                              aria-label={`Batch or lot number for ${row.line.variantSku ?? 'item'}`}
                              placeholder={lotDisabled ? 'Not applicable' : 'Leave blank'}
                              spellCheck={false}
                              className="w-32"
                              value={lotDisabled ? '' : (entries[row.line.id]?.lot ?? '')}
                              onChange={(event) => {
                                setEntry(row.line.id, 'lot', event.target.value);
                              }}
                            />
                          </td>
                          <td className="hidden @md:table-cell">
                            <Input
                              color="module"
                              size="sm"
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`Damaged for ${row.line.variantSku ?? 'item'}`}
                              className="w-20 text-right tabular-nums"
                              value={entries[row.line.id]?.damaged ?? ''}
                              onChange={(event) => {
                                setEntry(row.line.id, 'damaged', event.target.value);
                              }}
                            />
                          </td>
                          <td>
                            <Badge color={state.tone} variant="soft" size="sm">
                              {state.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>

                {totalUnits > 0 ? (
                  <Text className="text-sm">
                    Booking in{' '}
                    <span className="font-semibold tabular-nums">{String(totalUnits)}</span> unit
                    {totalUnits === 1 ? '' : 's'} across {String(toBook.length)} line
                    {toBook.length === 1 ? '' : 's'}.
                    {totalDamaged > 0 ? (
                      <>
                        {' '}
                        <span className="tabular-nums">{String(totalDamaged)}</span> damaged unit
                        {totalDamaged === 1 ? '' : 's'} will be recorded and written off, not added
                        to stock.
                      </>
                    ) : null}
                  </Text>
                ) : totalDamaged > 0 ? (
                  <Text className="text-sm">
                    No good units to add — booking a total loss of{' '}
                    <span className="font-semibold tabular-nums">{String(totalDamaged)}</span>{' '}
                    damaged unit{totalDamaged === 1 ? '' : 's'} across {String(toBook.length)} line
                    {toBook.length === 1 ? '' : 's'}. Nothing is added to stock and the order stays
                    open for these units.
                  </Text>
                ) : (
                  <Text className="text-sm">
                    Nothing to book in yet — enter what arrived above.
                  </Text>
                )}

                <Text className="text-sm">
                  <span className="font-medium">Damaged units.</span> Count anything that arrived
                  broken or unsellable. Your stock records it turning up and then being written off,
                  so it is never added to what you can sell — and because the supplier still owes
                  you those units, the order stays open until they are replaced.
                </Text>

                <Text className="text-sm">
                  <span className="font-medium">Batch / lot number.</span> If this delivery is a
                  batch you need to trace later — something with an expiry date, or that could be
                  recalled — give it a code here so you can find these exact units again. Leave it
                  blank for anything ordinary.
                </Text>
              </FormSection>

              {/* What it cost to GET the goods here. Left out of the cost of
                  stock, this is where margin quietly disappears — on imported
                  goods it is routinely a fifth of what a unit really costs. */}
              <FormSection
                title="What getting it here cost"
                description="Shipping, import duty, customs fees — anything you paid on top of the goods. It is spread across the lines above so each item's real cost includes its share. Leave it empty if there was nothing, and add the bill later if it has not arrived yet."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    color="neutral"
                    onClick={() => {
                      setCharges((current) => [
                        ...current,
                        { kind: 'freight', amount: '', basis: 'value' },
                      ]);
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    Add a cost
                  </Button>
                }
              >
                {charges.length === 0 ? (
                  <Text className="text-sm">
                    Nothing added. The items will cost exactly what the supplier invoiced.
                  </Text>
                ) : (
                  <div className="flex flex-col gap-2">
                    {charges.map((charge, index) => (
                      <div
                        key={`charge-${String(index)}`}
                        className="border-base-300 grid gap-2 rounded-lg border p-2 @lg:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_auto]"
                      >
                        <NativeSelect
                          size="sm"
                          aria-label={`What this cost is, row ${String(index + 1)}`}
                          value={charge.kind}
                          onChange={(event) => {
                            const kind = event.target.value as ChargeKind;
                            setCharges((current) =>
                              current.map((c, i) => (i === index ? { ...c, kind } : c))
                            );
                          }}
                        >
                          {CHARGE_KINDS.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label}
                            </option>
                          ))}
                        </NativeSelect>
                        <Input
                          color="module"
                          size="sm"
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`Amount, row ${String(index + 1)}`}
                          className="text-right tabular-nums"
                          value={charge.amount}
                          onChange={(event) => {
                            const amount = event.target.value;
                            setCharges((current) =>
                              current.map((c, i) => (i === index ? { ...c, amount } : c))
                            );
                          }}
                        />
                        <NativeSelect
                          size="sm"
                          aria-label={`How to spread it, row ${String(index + 1)}`}
                          value={charge.basis}
                          onChange={(event) => {
                            const basis = event.target.value as AllocationBasis;
                            setCharges((current) =>
                              current.map((c, i) => (i === index ? { ...c, basis } : c))
                            );
                          }}
                        >
                          {ALLOCATION_BASES.filter((b) => b.value !== 'manual').map((b) => (
                            <option key={b.value} value={b.value}>
                              {b.label}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button
                          size="sm"
                          variant="ghost"
                          color="danger"
                          shape="square"
                          aria-label={`Remove cost row ${String(index + 1)}`}
                          onClick={() => {
                            setCharges((current) => current.filter((_, i) => i !== index));
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    {chargeTotalCents > 0 ? (
                      <Text className="text-sm">
                        <span className="font-semibold tabular-nums">
                          {formatCents(chargeTotalCents)}
                        </span>{' '}
                        will be spread across {plural(toBook.length, 'line', 'lines')} on this
                        delivery.
                      </Text>
                    ) : null}
                  </div>
                )}
              </FormSection>

              <FormSection title="Delivery details">
                <div className="grid gap-3 @md:grid-cols-2">
                  <Field>
                    <FieldLabel>When it arrived</FieldLabel>
                    <DateInput
                      color="module"
                      value={receivedAt}
                      aria-label="When it arrived"
                      onValueChange={(date) => {
                        setReceivedAt(date);
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Packing slip reference</FieldLabel>
                    <FieldControl
                      render={
                        <Input
                          color="module"
                          value={reference}
                          placeholder="Off the delivery note"
                          spellCheck={false}
                          onChange={(event) => {
                            setReference(event.target.value);
                          }}
                        />
                      }
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Note</FieldLabel>
                  <FieldControl
                    render={
                      <Textarea
                        color="module"
                        rows={2}
                        value={note}
                        placeholder="Anything worth recording about this delivery"
                        onChange={(event) => {
                          setNote(event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>Kept with the receipt.</FieldDescription>
                </Field>
              </FormSection>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── What it really cost ────────────────────────────────────────────────── */

/**
 * The three-line story of a delivery's cost: goods → getting them here → total.
 *
 * This is the feature in one card. A business looks at a supplier invoice, sees
 * £4.00 a unit and prices at £6.00, and never learns that the shipping and duty
 * made it £4.62 — so a line they believe carries 33% margin carries 23%. Adding
 * up the extra costs and dividing them across the things they arrived with is
 * arithmetic nobody does by hand, which is exactly why it does not get done.
 *
 * The bill usually arrives AFTER the pallet, so a cost can be added to a posted
 * delivery here. Doing so corrects what is still on the shelf and leaves what
 * has already sold costed at what it cost then — restating the cost of goods
 * already shipped would move figures a business has closed its books on.
 */
function LandedCostSection({ receipt }: { receipt: GoodsReceiptDetail }) {
  const toast = useToast();
  const confirm = useConfirm();
  const addCharge = useAddReceiptCharge(receipt.id);
  const removeCharge = useRemoveReceiptCharge();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ChargeDraft>({ kind: 'freight', amount: '', basis: 'value' });

  const amountCents = parseAmountCents(draft.amount);
  const canSave = amountCents !== null && amountCents > 0;

  const save = () => {
    if (!canSave) return;
    addCharge.mutate(
      { kind: draft.kind, amountCents, allocationBasis: draft.basis },
      {
        onSuccess: () => {
          setAdding(false);
          setDraft({ kind: 'freight', amount: '', basis: 'value' });
          toast.add({
            title: 'Cost added',
            description:
              'It has been spread across this delivery. What you still hold has been revalued; anything already sold keeps the cost it went out at.',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that cost',
            description: buyingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const remove = async (chargeId: string, label: string, amountLabel: string) => {
    const ok = await confirm({
      title: `Remove ${label}?`,
      description: `${amountLabel} will stop counting towards what these goods cost, and everything you still hold from this delivery will be revalued down. Items already sold keep the cost they went out at.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    removeCharge.mutate(chargeId, {
      onError: (error) => {
        toast.add({
          title: 'Could not remove that cost',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const sharePercent =
    receipt.landedTotalCents > 0
      ? Math.round((receipt.chargeTotalCents / receipt.landedTotalCents) * 1000) / 10
      : 0;

  return (
    <FormSection
      title="What it really cost"
      description="What you paid the supplier, what it cost to get the goods here, and the total your stock is actually valued at."
      action={
        adding ? null : (
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a cost
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">
            {formatCents(receipt.goodsValueCents, receipt.baseCurrency)}
          </Text>
          <Text className="text-sm">What the goods cost</Text>
        </div>
        <div className="flex flex-col">
          <Text
            className={
              receipt.chargeTotalCents > 0
                ? 'text-warning text-2xl font-semibold tabular-nums'
                : 'text-2xl font-semibold tabular-nums'
            }
          >
            {formatCents(receipt.chargeTotalCents, receipt.baseCurrency)}
          </Text>
          <Text className="text-sm">
            {receipt.chargeTotalCents > 0
              ? `Getting them here — ${String(sharePercent)}% of the total`
              : 'Nothing recorded for getting them here'}
          </Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-module text-2xl font-semibold tabular-nums">
            {formatCents(receipt.landedTotalCents, receipt.baseCurrency)}
          </Text>
          <Text className="text-sm">What this stock is worth to you</Text>
        </div>
      </div>

      {receipt.currency !== receipt.baseCurrency ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>Billed in {receipt.currency}</AlertTitle>
            <AlertDescription>
              Converted at {receipt.fxRate} on the day it arrived, so everything above is in{' '}
              {receipt.baseCurrency}. That rate is fixed to this delivery — a later rate change does
              not alter what these goods cost you.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {receipt.charges.length > 0 ? (
        <Table size="sm">
          <thead>
            <tr>
              <th>Cost</th>
              <th className="hidden @lg:table-cell">Spread</th>
              <th className="text-right whitespace-nowrap">Amount</th>
              <th className="w-10" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {receipt.charges.map((charge) => (
              <tr key={charge.id}>
                <td>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{chargeKindLabel(charge.kind)}</span>
                    {charge.description ? (
                      <span className="truncate text-sm">{charge.description}</span>
                    ) : null}
                  </span>
                </td>
                <td className="hidden text-sm @lg:table-cell">
                  {basisLabel(charge.allocationBasis)}
                </td>
                <td className="text-right font-medium tabular-nums">
                  {formatCents(charge.amountCents, receipt.currency)}
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="danger"
                    shape="square"
                    aria-label={`Remove ${chargeKindLabel(charge.kind)}`}
                    loading={removeCharge.isPending}
                    onClick={() => {
                      void remove(
                        charge.id,
                        chargeKindLabel(charge.kind).toLowerCase(),
                        formatCents(charge.amountCents, receipt.currency)
                      );
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : adding ? null : (
        <Text className="text-sm">
          Nothing has been recorded on top of the supplier&apos;s invoice. If a shipping or customs
          bill turns up for this delivery, add it here and every item&apos;s cost is corrected.
        </Text>
      )}

      {adding ? (
        <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3">
          <div className="grid gap-2 @lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
            <Field>
              <FieldLabel>What was it for?</FieldLabel>
              <NativeSelect
                aria-label="What this cost is"
                value={draft.kind}
                onChange={(event) => {
                  setDraft((d) => ({ ...d, kind: event.target.value as ChargeKind }));
                }}
              >
                {CHARGE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel required>Amount</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Amount"
                    className="text-right tabular-nums"
                    value={draft.amount}
                    onChange={(event) => {
                      setDraft((d) => ({ ...d, amount: event.target.value }));
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>How should it be spread?</FieldLabel>
              <NativeSelect
                aria-label="How to spread it"
                value={draft.basis}
                onChange={(event) => {
                  setDraft((d) => ({ ...d, basis: event.target.value as AllocationBasis }));
                }}
              >
                {ALLOCATION_BASES.filter((b) => b.value !== 'manual').map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>
                {ALLOCATION_BASES.find((b) => b.value === draft.basis)?.hint}
              </FieldDescription>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              color="module"
              disabled={!canSave}
              loading={addCharge.isPending}
              onClick={save}
            >
              <Coins className="size-4" aria-hidden />
              Add it
            </Button>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                setAdding(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </FormSection>
  );
}

/* ── Viewing a posted receipt ───────────────────────────────────────────── */

function ViewReceipt({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const receipt = useReceipt(id);

  useEffect(() => {
    if (receipt.data) ctx.setTitle(receipt.data.number);
  }, [ctx, receipt.data]);

  if (receipt.isError) {
    const gone = isNotFound(receipt.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This receipt no longer exists' : 'Could not load this receipt'}
          description={
            gone
              ? 'It may have been removed.'
              : 'This is a problem reaching the server. The record is unaffected.'
          }
          onRetry={() => {
            void receipt.refetch();
          }}
        />
      </div>
    );
  }

  if (receipt.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  const data = receipt.data;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Receipt actions"
        controls={
          <>
            <Badge color="success" variant="soft" size="sm">
              Booked in
            </Badge>
            {/* A receipt is history, so this is for TRACING rather than for a
            workflow: stick it on the carton that came in and a scan months later
            says which delivery it arrived on. */}
            <Tooltip content="Print a scannable label so this delivery can be traced later">
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                shape="square"
                className="shrink-0"
                aria-label="Print a scannable label for this delivery"
                onClick={() => {
                  ctx.open(
                    'inventory.documents.label',
                    {
                      number: data.number,
                      title: 'Goods receipt',
                      subtitle: data.warehouseName ?? '',
                    },
                    { target: 'beside' }
                  );
                }}
              >
                <Printer className="size-4" aria-hidden />
              </Button>
            </Tooltip>
            {data.purchaseOrderId ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="ml-auto shrink-0"
                onClick={(event) => {
                  ctx.open(
                    'inventory.purchase-orders.detail',
                    { id: data.purchaseOrderId },
                    { target: event.shiftKey ? 'beside' : 'tab' }
                  );
                }}
              >
                <ClipboardList className="size-4" aria-hidden />
                <span className="hidden @lg:inline">Open the order</span>
              </Button>
            ) : (
              <span className="ml-auto" />
            )}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={receipt.isFetching}
            updatedAt={receipt.dataUpdatedAt}
            onRefresh={() => {
              void receipt.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="font-mono text-2xl font-semibold">
              {data.number}
            </Heading>
            <Text className="text-sm">
              {data.purchaseOrderNumber ? `Against order ${data.purchaseOrderNumber}` : 'No order'}
              {data.warehouseName ? ` · Into ${data.warehouseName}` : ''}
              {` · Received ${formatDay(data.receivedAt)}`}
              {data.reference ? ` · Slip ${data.reference}` : ''}
            </Text>
          </div>

          <FormSection title="What was booked in">
            <Table size="sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right whitespace-nowrap">Units</th>
                  <th className="hidden text-right whitespace-nowrap @md:table-cell">Invoiced</th>
                  <th className="hidden text-right whitespace-nowrap @lg:table-cell">
                    Plus getting it here
                  </th>
                  <th className="text-right whitespace-nowrap">Really cost, each</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => {
                  const share =
                    line.baseUnitCostCents === null
                      ? null
                      : chargeSharePercent({
                          baseUnitCostCents: line.baseUnitCostCents,
                          allocatedChargeCents: line.allocatedChargeCents,
                          quantity: line.quantityReceived,
                        });
                  return (
                    <tr key={line.id}>
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{line.productTitle ?? 'Item'}</span>
                          <span className="truncate font-mono text-sm">
                            {line.variantSku ?? 'No code'}
                            {line.lotNumber ? ` · Lot ${line.lotNumber}` : ''}
                          </span>
                        </span>
                      </td>
                      {/* Both readings when the delivery was counted in packs:
                          "3 CS · 36" says what was counted AND what landed. */}
                      <td className="text-right font-medium tabular-nums">
                        {describeQuantityShort({
                          baseQuantity: line.quantityReceived,
                          uomCode: line.uomCode,
                          unitsPerUom: line.unitsPerUom,
                        })}
                      </td>
                      <td className="hidden text-right tabular-nums @md:table-cell">
                        {formatCents(line.unitCostCents, data.currency)}
                      </td>
                      <td className="hidden text-right tabular-nums @lg:table-cell">
                        {line.allocatedChargeCents > 0 ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {formatCents(line.allocatedChargeCents, data.baseCurrency)}
                            {share !== null && share > 0 ? (
                              <Badge color={chargeShareTone(share)} variant="soft" size="sm">
                                {share}%
                              </Badge>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      {/* The number that matters. Bold because it is the one an
                          owner should be pricing off, and it is not the one the
                          supplier's invoice showed them. */}
                      <td className="text-right font-semibold tabular-nums">
                        {line.landedUnitCostCents === null
                          ? formatCents(line.unitCostCents, data.currency)
                          : formatCents(line.landedUnitCostCents, data.baseCurrency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Text className="text-sm">
              {data.quantityReceived} unit{data.quantityReceived === 1 ? '' : 's'} in total were
              added to your stock. This receipt is a permanent record — a correction is a later
              stock count, not a change here.
            </Text>
          </FormSection>

          <LandedCostSection receipt={data} />

          {/* The invoice for this delivery (docs/146 Phase 10.10). Below the
              landed cost on purpose: the freight that was just spread over the
              lines is the thing most likely to differ from what the supplier
              actually billed, and it should be on screen when the paper is
              being read. */}
          <ReceiptBillPanel ctx={ctx} goodsReceiptId={data.id} />

          {data.note ? (
            <FormSection title="Note">
              <Text className="text-sm whitespace-pre-line">{data.note}</Text>
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function ReceiptDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const preTargetPoId =
    typeof ctx.params.purchaseOrderId === 'string' ? ctx.params.purchaseOrderId : '';

  if (id === 'new') return <BookDelivery ctx={ctx} preTargetPoId={preTargetPoId} />;

  // A receipt id with no such receipt shows the not-found handling in ViewReceipt.
  if (id === '') {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <PackageX className="size-6" aria-hidden />
            <Text>No delivery was chosen. Open one from the Receiving list.</Text>
          </div>
        </div>
      </div>
    );
  }

  return <ViewReceipt ctx={ctx} id={id} />;
}
