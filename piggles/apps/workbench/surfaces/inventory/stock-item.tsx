'use client';

// ONE SKU'S STOCK — where it is, how much is there, and what is holding it.
//
// ── This is a read-only detail pane, so it opens by saying WHAT it is ────
//
// Product name, then the code printed on the shelf label. A stock pane that
// opens with a quantity field tells you nothing about the thing you are about
// to change the count of, and the count is the one number nobody should correct
// on the wrong item.
//
// ── Not EditorLayout ─────────────────────────────────────────────────────
//
// There is no completion-ordered form here and no running summary to put beside
// one — it is a status, three numbers and a card per location. EditorLayout
// would produce an empty rail floating beside a short column. One centred,
// capped column instead.
//
// ── Cards per location, not a grid ───────────────────────────────────────
//
// Stock is (sku × location) and a table of it reads fine at full width, which
// this pane will frequently not be: it is meant to dock beside the list. A card
// per place, with the numbers inside it, survives 320px without a horizontal
// scrollbar and keeps each location's reorder rule attached to the location it
// belongs to.
//
// ── A big correction gets a confirm ──────────────────────────────────────
//
// Recording a count is routine and un-confirmed. Recording one that wipes out
// most of a shelf is how a typo becomes an out-of-stock product, and the ledger
// records the correction either way — so a change past a threshold is named in
// plain numbers before it is written. That is the only guard: not ceremony on
// every save, which teaches people to click through it.

import { useEffect, useMemo, useState } from 'react';
import { pickCountLocation, readLastCountLocation, writeLastCountLocation } from './count-location';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneEmpty } from '../../components/pane-empty';
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
  Text,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faBox,
  faBoxOpen,
  faClipboardCheck,
  faClockRotateLeft,
  faFloppyDisk,
  faLocationDot,
  faLock,
  faPrint,
  faShieldCheck,
  faSliders,
  faSparkles,
  faWarehouse,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  formatCents,
  holderLabel,
  isNotFound,
  levelState,
  locationLabel,
  movementReason,
  overallState,
  plural,
  sellable,
  stockErrorMessage,
  useRecordCount,
  useSetReorderRule,
  useSetSafetyBuffer,
  useStockHistory,
  useStockHolds,
  useStockItem,
  useStockLocations,
  type StockLevel,
  type StockLocation,
} from './data';
import { useGenerateBarcodes, useVariantBarcodes } from './scan-data';
import { productCopyWith } from '../../lib/product';

/** Registry module for this surface, so the brand's empty-state artwork is this
 *  app's own picture rather than the generic one. */
const MODULE = 'inventory';

/** Centred and capped — a pane torn onto a second monitor is 2000px wide, and
 *  uncapped this becomes a line of numbers pinned to the left edge. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/**
 * How big a correction has to be before it is worth stopping for.
 *
 * Both terms matter. The absolute floor stops a confirm on every small fix at a
 * shop with three of everything; the proportion catches the fat-finger that
 * turns 240 into 24 on a warehouse line where 216 units is a normal day.
 */
const BIG_CHANGE_UNITS = 25;
const BIG_CHANGE_SHARE = 0.5;

function isBigCorrection(from: number, to: number): boolean {
  const change = Math.abs(to - from);
  if (change < BIG_CHANGE_UNITS) return false;
  return from === 0 || change / from >= BIG_CHANGE_SHARE;
}

/* ── Recording a count ──────────────────────────────────────────────────── */

/**
 * The correction form: one sku, one place, one number.
 *
 * It asks for what is actually on the shelf, not the difference from what we
 * think is there. Someone who has just counted knows "nine"; making them work
 * out "minus two" from a figure they already believe is wrong is how a
 * correction turns into a second error. The server reconciles it to a movement
 * under a row lock, so a sale landing mid-count cannot be overwritten.
 */
function CountForm({
  variantId,
  productId,
  sku,
  levels,
  locations,
  initialWarehouseId,
  onDone,
}: {
  variantId: string;
  productId: string | null;
  sku: string;
  levels: StockLevel[];
  locations: StockLocation[];
  /** Set only when somebody pressed Count on ONE location's card. An explicit
   *  ask beats every guess below it. */
  initialWarehouseId: string | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const record = useRecordCount();

  // Not `locations[0]`. That is the first place by NAME, which is a fact about
  // the alphabet — see count-location.ts for the ladder this reads instead.
  // There is no `nearby` here: this pane is one sku, so it never sees the rest
  // of the product. The remembered place is what carries somebody through a run
  // of them.
  const [warehouseId, setWarehouseId] = useState(
    () =>
      initialWarehouseId ??
      pickCountLocation({
        here: levels.map((level) => level.warehouseId),
        nearby: [],
        remembered: readLastCountLocation(),
        offered: locations.map((location) => location.id),
      })
  );
  const current = levels.find((level) => level.warehouseId === warehouseId) ?? null;
  const [counted, setCounted] = useState(String(current?.onHand ?? 0));
  const [note, setNote] = useState('');

  const parsed = Number.parseInt(counted, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0 && warehouseId !== '';
  // `current?.onHand` is undefined when this sku has never been counted here,
  // which never equals a parsed number — so a FIRST count reads as changed,
  // exactly as it should.
  const changed = current?.onHand !== parsed || note.trim() !== '';

  useDirtySource(
    changed && valid,
    `A counted quantity for ${sku} has not been saved. Close anyway?`
  );

  const chosenLocation =
    locations.find((location) => location.id === warehouseId)?.name ?? 'that location';

  const submit = async () => {
    if (!valid) return;

    if (current && isBigCorrection(current.onHand, parsed)) {
      const dropped = parsed < current.onHand;
      const ok = await confirm({
        title: `Change ${sku} from ${String(current.onHand)} to ${String(parsed)}?`,
        description: `That ${dropped ? 'removes' : 'adds'} ${plural(
          Math.abs(parsed - current.onHand),
          'unit',
          'units'
        )} at ${chosenLocation}${
          dropped ? ' and may take it off sale on your website. ' : '. '
        }The change is recorded against your name so it can be traced later. If you meant a different number, go back and change it.`,
        confirmLabel: `Yes, it is ${String(parsed)}`,
        cancelLabel: 'Go back',
        color: dropped ? 'danger' : 'warning',
      });
      if (!ok) return;
    }

    record.mutate(
      {
        variantId,
        ...(productId ? { productId } : {}),
        warehouseId,
        onHand: parsed,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      },
      {
        onSuccess: () => {
          // Remember the place, so the next count does not ask again. Written on
          // SUCCESS only: a place that failed to save is not somewhere anybody
          // counted.
          writeLastCountLocation(warehouseId);
          // Collapse FIRST, announce after. `onDone` unmounts this form, so the
          // toast describes a state that has already settled rather than racing
          // it — see afterPaneChange.
          onDone();
          afterPaneChange(() => {
            toast.add({
              title: `${sku} counted`,
              description: `Now recorded as ${plural(parsed, 'unit', 'units')} at ${chosenLocation}.`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not record that count',
            description: stockErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <Heading level={2} className="text-lg font-semibold">
        Record what you counted
      </Heading>

      <Field>
        <FieldLabel>Where you counted it</FieldLabel>
        <NativeSelect
          size="sm"
          value={warehouseId}
          aria-label="Where you counted it"
          onChange={(event) => {
            const id = event.target.value;
            setWarehouseId(id);
            setCounted(String(levels.find((level) => level.warehouseId === id)?.onHand ?? 0));
          }}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
        <FieldDescription>
          Counts are always kept per place, so a shelf in one shop never changes what another one
          has.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>How many are there</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              size="sm"
              type="number"
              min={0}
              inputMode="numeric"
              value={counted}
              onChange={(event) => {
                setCounted(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          }
        />
        <FieldDescription>
          {current
            ? `We currently think there are ${plural(current.onHand, 'unit', 'units')} here. Put in what you actually counted — we work out the difference and record it.`
            : 'This has never been counted here. Put in what is on the shelf and your website starts keeping track of it.'}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Why it changed (optional)</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              size="sm"
              value={note}
              placeholder="Found two more in the back"
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          Kept with the record, so it makes sense a year from now.
        </FieldDescription>
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!valid}
          loading={record.isPending}
          onClick={() => {
            void submit();
          }}
        >
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          Save this count
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/* ── How a location is managed ──────────────────────────────────────────── */

/**
 * The reorder rule and the cushion, edited together.
 *
 * They are two server writes and one decision — "how should this place look
 * after itself" — so splitting them into two forms would make an operator open
 * two panels to answer one question. Each write only fires if its own fields
 * actually changed, so setting a cushion on a level with no reorder rule does
 * not fail on the rule endpoint's required fields.
 */
function ManagementForm({
  variantId,
  productId,
  sku,
  level,
  onDone,
}: {
  variantId: string;
  productId: string | null;
  sku: string;
  level: StockLevel;
  onDone: () => void;
}) {
  const toast = useToast();
  const saveRule = useSetReorderRule();
  const saveBuffer = useSetSafetyBuffer();

  const [point, setPoint] = useState(level.reorderPoint === null ? '' : String(level.reorderPoint));
  const [quantity, setQuantity] = useState(
    level.reorderQuantity === null ? '' : String(level.reorderQuantity)
  );
  const [lead, setLead] = useState(level.leadTimeDays === null ? '' : String(level.leadTimeDays));
  const [buffer, setBuffer] = useState(String(level.safetyBuffer));

  const pointValue = Number.parseInt(point, 10);
  const quantityValue = Number.parseInt(quantity, 10);
  const leadValue = Number.parseInt(lead, 10);
  const bufferValue = Number.parseInt(buffer, 10);

  const ruleTouched = point.trim() !== '' || quantity.trim() !== '';
  const ruleValid =
    Number.isFinite(pointValue) &&
    pointValue >= 0 &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0;
  const bufferValid = Number.isFinite(bufferValue) && bufferValue >= 0;
  const bufferChanged = bufferValid && bufferValue !== level.safetyBuffer;

  // A half-filled rule ("warn me at 5" with no quantity) is the one state the
  // server would reject, and it deserves a sentence rather than a dead button.
  const ruleIncomplete = ruleTouched && !ruleValid;
  const canSave = bufferValid && !ruleIncomplete && (ruleTouched ? ruleValid : true);
  const somethingToSave = (ruleTouched && ruleValid) || bufferChanged;

  useDirtySource(
    somethingToSave,
    `Changes to how ${sku} is managed at ${level.warehouseName} have not been saved. Close anyway?`
  );

  const submit = async () => {
    if (!canSave || !somethingToSave) return;
    try {
      if (ruleTouched && ruleValid) {
        await saveRule.mutateAsync({
          variantId,
          ...(productId ? { productId } : {}),
          warehouseId: level.warehouseId,
          reorderPoint: pointValue,
          reorderQuantity: quantityValue,
          ...(Number.isFinite(leadValue) && leadValue >= 0 ? { leadTimeDays: leadValue } : {}),
        });
      }
      if (bufferChanged) {
        await saveBuffer.mutateAsync({
          variantId,
          ...(productId ? { productId } : {}),
          warehouseId: level.warehouseId,
          safetyBuffer: bufferValue,
        });
      }
      onDone();
      afterPaneChange(() => {
        toast.add({ title: `Saved for ${level.warehouseName}`, type: 'success' });
      });
    } catch (error) {
      toast.add({
        title: 'Could not save that',
        description: stockErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    }
  };

  const busy = saveRule.isPending || saveBuffer.isPending;

  return (
    <div className="border-base-300 bg-base-200 flex flex-col gap-3 rounded-lg border p-3">
      <Heading level={4} className="text-base font-semibold">
        How {level.warehouseName} looks after this
      </Heading>

      <div className="grid gap-3 @md:grid-cols-3">
        <Field>
          <FieldLabel>Warn me at</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                size="sm"
                type="number"
                min={0}
                inputMode="numeric"
                value={point}
                placeholder="None"
                onChange={(event) => {
                  setPoint(event.target.value);
                }}
              />
            }
          />
          <FieldDescription>Units left before this is flagged.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Order this many</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                size="sm"
                type="number"
                min={1}
                inputMode="numeric"
                value={quantity}
                placeholder="None"
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
              />
            }
          />
          <FieldDescription>How many to buy each time.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Days to arrive</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                size="sm"
                type="number"
                min={0}
                inputMode="numeric"
                value={lead}
                placeholder="Optional"
                onChange={(event) => {
                  setLead(event.target.value);
                }}
              />
            }
          />
          <FieldDescription>How long your supplier takes.</FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Hold back from your website</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              size="sm"
              type="number"
              min={0}
              inputMode="numeric"
              value={buffer}
              className="max-w-32"
              onChange={(event) => {
                setBuffer(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          Units kept out of what shoppers can buy — a cushion so the last few on the shelf are never
          sold out from under a customer standing in front of you. Zero offers everything.
        </FieldDescription>
      </Field>

      {/* ONE message, the most specific one — not a generic "check your entries"
          above a field that already knows what is wrong. */}
      {ruleIncomplete ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>A reorder rule needs both numbers</AlertTitle>
            <AlertDescription>
              Say when to warn you AND how many to order — a warning with no quantity cannot tell
              you what to do about it. Clear both to have no rule at all.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!canSave || !somethingToSave}
          loading={busy}
          onClick={() => {
            void submit();
          }}
        >
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          Save
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── One location ───────────────────────────────────────────────────────── */

function LocationCard({
  variantId,
  productId,
  sku,
  level,
  currency,
  onExplain,
}: {
  /** Open the explanation of THIS location's number, beside. */
  onExplain: () => void;
  variantId: string;
  productId: string | null;
  sku: string;
  level: StockLevel;
  currency: string;
}) {
  const [editing, setEditing] = useState(false);
  const state = levelState(level);
  const cost = level.avgCostCents ?? level.unitCostCents;

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon glyph={faLocationDot} className="size-4 shrink-0" aria-hidden />
          <Heading level={3} className="min-w-0 text-lg font-semibold">
            {locationLabel(level)}
          </Heading>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
          {/* The numbers below are the whole reason anyone is on this screen, so
              the way to interrogate them sits with them rather than in a menu.
              Icon-only with a tooltip: it is a secondary action beside a status
              badge, and a labelled button here would compete with the counts. */}
          <Tooltip content="Where this number came from">
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              aria-label="Where this number came from"
              onClick={onExplain}
            >
              <Icon glyph={faShieldCheck} className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Three numbers, and the one that answers "can I sell it" leads. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">{sellable(level)}</Text>
          <Text className="text-sm">To sell</Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">{level.onHand}</Text>
          <Text className="text-sm">On the shelf</Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold tabular-nums">{level.allocated}</Text>
          <Text className="text-sm">Spoken for</Text>
        </div>
      </div>

      {/* Names the missing term. Without it the row reads as three numbers that
          do not subtract to each other, and a number that does not add up is a
          number nobody believes for the rest of the screen. */}
      {level.safetyBuffer > 0 ? (
        <Text className="text-sm">
          That is {String(level.onHand)} on the shelf, less {String(level.allocated)} spoken for,
          less {plural(level.safetyBuffer, 'unit', 'units')} you deliberately hold back from your
          website as a cushion.
        </Text>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text className="text-sm">
          {level.reorderPoint === null
            ? 'No reorder rule — nothing will warn you when this runs down.'
            : `Warns at ${String(level.reorderPoint)}, then order ${String(
                level.reorderQuantity ?? 0
              )}${
                level.leadTimeDays === null
                  ? ''
                  : ` · about ${plural(level.leadTimeDays, 'day', 'days')} to arrive`
              }`}
          {cost === null ? '' : ` · costs you ${formatCents(cost, currency)} each`}
        </Text>
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          onClick={() => {
            setEditing((open) => !open);
          }}
        >
          <Icon glyph={faSliders} className="size-4" aria-hidden />
          {level.reorderPoint === null ? 'Set a reorder rule' : 'Change how this is managed'}
        </Button>
      </div>

      {editing ? (
        <ManagementForm
          variantId={variantId}
          productId={productId}
          sku={sku}
          level={level}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </section>
  );
}

/* ── Holds and history ──────────────────────────────────────────────────── */

/**
 * What you can scan to bring this item up (docs/146 Phase 3.1).
 *
 * Placed on the STOCK screen rather than only in the catalogue because the
 * question "why did that box not scan" is asked by someone looking at stock, and
 * the answer — no code, or a code on a different item — belongs where the
 * question is. An item with no code at all gets the mint button here, which is
 * the shortest path there is from a spreadsheet catalogue to a scannable one.
 */
function BarcodesSection({
  variantId,
  sku,
  ctx,
}: {
  variantId: string;
  sku: string | null;
  ctx: SurfaceContext;
}) {
  const barcodes = useVariantBarcodes(variantId);
  const generate = useGenerateBarcodes();
  const toast = useToast();
  const rows = barcodes.data ?? [];

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex flex-col gap-0.5">
          <Heading level={2} className="text-lg font-semibold">
            What scans as this
          </Heading>
          <Text className="text-sm">Every code that brings this item up on a scanner.</Text>
        </div>
        {rows.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            color="module"
            onClick={() => {
              ctx.open('inventory.barcodes.labels', { variantId }, { target: 'beside' });
            }}
          >
            <Icon glyph={faPrint} className="size-4" aria-hidden />
            Print labels
          </Button>
        ) : null}
      </div>

      {barcodes.isLoading ? (
        <Text className="text-sm">Loading codes…</Text>
      ) : rows.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text className="min-w-0 text-sm">
            {productCopyWith(
              'inventory.barcode.none',
              `Nothing scans as ${sku ?? 'this item'} yet, so it has to be found by name every time. Piggles can create a real UPC for it — any scanner reads it, and it can never clash with a manufacturer’s code.`,
              { item: sku ?? 'this item' }
            )}
          </Text>
          <Button
            size="sm"
            color="module"
            disabled={generate.isPending}
            onClick={() => {
              generate.mutate(
                { variantIds: [variantId] },
                {
                  onSuccess: (result) => {
                    const made = result.generated[0];
                    toast.add({
                      title: made ? `Barcode ${made.value} created` : 'Nothing to create',
                      description: made ? 'Print a label for it and it is scannable.' : undefined,
                      type: made ? 'success' : 'info',
                    });
                  },
                  onError: () => {
                    toast.add({ title: 'Could not create a barcode', type: 'error' });
                  },
                }
              );
            }}
          >
            <Icon glyph={faSparkles} className="size-4" aria-hidden />
            {generate.isPending ? 'Creating…' : 'Create a barcode'}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span className="truncate font-mono font-medium">{row.value}</span>
                <Badge color="neutral" variant="outline" size="sm">
                  {row.symbologyLabel}
                </Badge>
                {row.isPrimary ? (
                  <Badge color="module" variant="soft" size="sm">
                    Main
                  </Badge>
                ) : null}
                {/* The fact with consequences: one pull of the trigger on this
                    code books twelve, not one. */}
                {row.packSize > 1 ? (
                  <Badge color="module-commerce" size="sm">
                    One scan = {row.packSize}
                  </Badge>
                ) : null}
                {row.supplierName ? (
                  <Badge color="module-crm" variant="soft" size="sm">
                    {row.supplierName}
                  </Badge>
                ) : null}
                {!row.isActive ? (
                  <Badge color="warning" variant="soft" size="sm">
                    Retired
                  </Badge>
                ) : null}
              </span>
              <Text className="text-sm">
                {row.scanCount > 0
                  ? `Scanned ${plural(row.scanCount, 'time', 'times')}`
                  : 'Never scanned'}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HoldsSection({ holds }: { holds: ReturnType<typeof useStockHolds>['data'] }) {
  const rows = holds?.items ?? [];
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, hold) => sum + hold.quantity, 0);

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          What is holding this stock
        </Heading>
        <Text className="text-sm">
          {plural(total, 'unit is', 'units are')} on the shelf but already promised, so they are not
          offered for sale.
        </Text>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((hold) => (
          <li key={hold.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="min-w-0">
              <span className="font-semibold">{hold.quantity}</span> ×{' '}
              {holderLabel(hold.holderType)}
              {hold.warehouseName === null ? '' : ` at ${hold.warehouseName}`}
            </Text>
            <Text className="text-sm">
              {hold.expiresAt === null ? (
                <span className="inline-flex items-center gap-1">
                  <Icon glyph={faLock} className="size-3" aria-hidden />
                  Held until it ships
                </span>
              ) : (
                <>
                  Frees up <Timestamp value={hold.expiresAt} format="relative" />
                </>
              )}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The recent ledger. Capped on screen because this is context, not the point
 *  of the pane — the full movement log is a surface of its own. */
function HistorySection({ history }: { history: ReturnType<typeof useStockHistory>['data'] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = history?.items ?? [];
  if (rows.length === 0) return null;
  const shown = expanded ? rows : rows.slice(0, 8);

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="flex items-center gap-2 text-lg font-semibold">
          <Icon glyph={faClockRotateLeft} className="size-4" aria-hidden />
          Recent changes
        </Heading>
        <Text className="text-sm">Every change to this item’s counts, newest first.</Text>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((movement) => (
          <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="min-w-0">
              <span className="font-semibold tabular-nums">
                {movement.delta > 0 ? `+${String(movement.delta)}` : String(movement.delta)}
              </span>{' '}
              {movementReason(movement.reason)}
              {movement.warehouseName === null ? '' : ` at ${movement.warehouseName}`}
              {movement.note === null ? '' : ` — ${movement.note}`}
            </Text>
            <Text className="text-sm">
              <Timestamp value={movement.createdAt} format="relative" />
            </Text>
          </li>
        ))}
      </ul>
      {rows.length > 8 ? (
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          className="self-start"
          onClick={() => {
            setExpanded((open) => !open);
          }}
        >
          {expanded ? 'Show fewer' : `Show all ${String(rows.length)}`}
        </Button>
      ) : null}
    </section>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function StockItemSurface({ ctx }: { ctx: SurfaceContext }) {
  const variantId = typeof ctx.params.variantId === 'string' ? ctx.params.variantId : '';

  const item = useStockItem(variantId);
  const locationsQuery = useStockLocations();
  const holds = useStockHolds(variantId);
  const history = useStockHistory(variantId);

  const [counting, setCounting] = useState(false);
  const [countAt, setCountAt] = useState<string | null>(null);

  const levels = useMemo(() => {
    const rows = [...(item.data?.items ?? [])];
    rows.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
    return rows;
  }, [item.data]);

  const first = levels[0] ?? null;
  const sku = first?.sku ?? null;
  const productTitle = first?.productTitle ?? null;
  const productId = first?.productId ?? null;

  useEffect(() => {
    if (sku) ctx.setTitle(sku);
  }, [ctx, sku]);

  const locations = (locationsQuery.data?.items ?? []).filter((location) => location.isActive);

  // A pane opened without a variant is a broken link, not a loading state, and
  // it must not sit spinning forever pretending otherwise.
  if (variantId === '') {
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneEmpty
            module={MODULE}
            icon={<Icon glyph={faBoxOpen} className="size-6" aria-hidden />}
            title="No item was chosen"
            description="This pane shows the stock of one item. Open it from the Stock list by clicking a row."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  ctx.open('inventory.stock.list', undefined, { target: 'replace' });
                }}
              >
                Open the stock list
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  // A failed load REPLACES the pane — never an empty set of cards beside a live
  // "Record a count" button, which would invite someone to correct a number
  // they cannot see.
  if (item.isError) {
    const gone = isNotFound(item.error);
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            reason={gone ? 'missing' : 'unreachable'}
            title={gone ? 'This item no longer exists' : 'Could not load this item’s stock'}
            description={
              gone
                ? 'It has been removed from your catalog. Its past orders and its stock history are unaffected.'
                : 'This is a problem reaching the server. Your stock is unaffected — the numbers just could not be read just now.'
            }
            onRetry={() => {
              void item.refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (item.isPending || locationsQuery.isPending) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  const state = overallState(levels);
  const totals = levels.reduce(
    (sum, level) => ({
      sellable: sum.sellable + sellable(level),
      onHand: sum.onHand + level.onHand,
      allocated: sum.allocated + level.allocated,
    }),
    { sellable: 0, onHand: 0, allocated: 0 }
  );

  const low = levels.filter(
    (level) => level.reorderPoint !== null && sellable(level) <= level.reorderPoint
  );
  const out = levels.filter((level) => sellable(level) <= 0);

  // ONE message, the most specific true one. A "running low" warning stacked
  // above something being outright unsellable buries the worse news.
  const alert: { tone: 'danger' | 'warning'; title: string; body: string } | null =
    out.length > 0
      ? {
          tone: 'danger',
          title:
            out.length === levels.length
              ? 'Nothing left to sell'
              : `${plural(out.length, 'location has', 'locations have')} nothing left`,
          body: 'Your website shows it as sold out and will not take an order for it. It comes back on sale by itself the moment you count some in.',
        }
      : low.length > 0
        ? {
            tone: 'warning',
            title: `${plural(low.length, 'location is', 'locations are')} running low`,
            body: 'These have reached the level you asked to be warned at. Ordering now is what keeps them from selling out.',
          }
        : null;

  // Every place that could hold this but does not — a real answer, and only
  // answerable by knowing the full list of locations rather than the levels.
  const stockedAt = new Set(levels.map((level) => level.warehouseId));
  const unstocked = locations.filter((location) => !stockedAt.has(location.id));

  const startCount = (warehouseId: string | null) => {
    setCountAt(warehouseId);
    setCounting(true);
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock item actions"
        status={
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        }
        primary={
          <>
            {/* Sheds its label first: the product is one click away either way, and
            counting is what this pane is for. */}
            {productId ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="ml-auto shrink-0 whitespace-nowrap"
                title="Open the product this belongs to"
                onClick={(event) => {
                  ctx.open(
                    'commerce.product.detail',
                    { id: productId },
                    { target: event.shiftKey ? 'beside' : 'tab' }
                  );
                }}
              >
                <Icon glyph={faBox} className="size-4" aria-hidden />
                <span className="hidden @xl:inline">Open product</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              color="module"
              className={`shrink-0 whitespace-nowrap${productId ? '' : 'ml-auto'}`}
              disabled={locations.length === 0}
              onClick={() => {
                startCount(levels[0]?.warehouseId ?? null);
              }}
            >
              <Icon glyph={faClipboardCheck} className="size-4" aria-hidden />
              Record a count
            </Button>
          </>
        }
        refresh={
          /* ALWAYS the last child of a toolbar — see RefreshButton. */
          <RefreshButton
            isFetching={item.isFetching}
            updatedAt={item.data ? item.dataUpdatedAt : undefined}
            onRefresh={() => {
              void item.refetch();
              void holds.refetch();
              void history.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Identity first: what this is, then the code on the shelf label. */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Heading level={1} className="min-w-0 text-2xl font-semibold break-words">
                {productTitle ?? 'This item'}
              </Heading>
              <Text className="min-w-0 font-mono text-base break-all">
                {sku ?? 'No product code'}
              </Text>
            </div>

            {/* Totals only once there is something to total. With stock in ONE
                place these three numbers are character-for-character the ones
                on the location card below, and a figure printed twice on one
                screen reads as two facts that happen to agree. */}
            {levels.length > 1 ? (
              <div className="border-base-300 grid grid-cols-3 gap-2 border-t pt-3">
                <div className="flex flex-col">
                  <Text className="text-3xl font-semibold tabular-nums">{totals.sellable}</Text>
                  <Text className="text-sm">To sell</Text>
                </div>
                <div className="flex flex-col">
                  <Text className="text-3xl font-semibold tabular-nums">{totals.onHand}</Text>
                  <Text className="text-sm">On the shelf</Text>
                </div>
                <div className="flex flex-col">
                  <Text className="text-3xl font-semibold tabular-nums">{totals.allocated}</Text>
                  <Text className="text-sm">Spoken for</Text>
                </div>
              </div>
            ) : null}
          </section>

          {alert ? (
            <Alert color={alert.tone} variant="soft">
              <AlertContent>
                <AlertTitle>{alert.title}</AlertTitle>
                <AlertDescription>{alert.body}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* Three genuinely different problems, three different answers. */}
          {locations.length === 0 ? (
            <EmptyState
              icon={<Icon glyph={faWarehouse} className="size-6" aria-hidden />}
              title="You have nowhere to keep stock yet"
              description="Counts are always kept per place — a shop, a warehouse, a garage. Set up at least one and you can start recording how many of this you have."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    ctx.open('inventory.warehouses.list', undefined, { target: 'tab' });
                  }}
                >
                  Set up a location
                </Button>
              }
            />
          ) : levels.length === 0 ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>Nothing has been counted yet</AlertTitle>
                <AlertDescription>
                  Until you count it, your website sells this one without limit — nobody has told it
                  there is a number. Record a count at any of your locations and it starts keeping
                  track: it comes off sale when it reaches zero, and back on when you bring more in.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {counting ? (
            <CountForm
              variantId={variantId}
              productId={productId}
              sku={sku ?? 'this item'}
              levels={levels}
              locations={locations}
              initialWarehouseId={countAt}
              onDone={() => {
                setCounting(false);
              }}
            />
          ) : null}

          {levels.map((level) => (
            <LocationCard
              key={level.warehouseId}
              variantId={variantId}
              productId={productId}
              sku={sku ?? 'this item'}
              level={level}
              currency="USD"
              onExplain={() => {
                ctx.open(
                  'inventory.stock.provenance',
                  { variantId, warehouseId: level.warehouseId },
                  { target: 'beside' }
                );
              }}
            />
          ))}

          {/* "Not stocked at the Portland shop" is an answer, not an absence —
              and it is the one place a first count can be started from. */}
          {unstocked.length > 0 ? (
            <section className="card bg-base-100 flex flex-col gap-3 p-4">
              <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
                <Heading level={2} className="text-lg font-semibold">
                  Not kept here
                </Heading>
                <Text className="text-sm">
                  These places have never counted this item, so they have none of it to sell.
                </Text>
              </div>
              <ul className="flex flex-col gap-2">
                {unstocked.map((location) => (
                  <li
                    key={location.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <Text className="min-w-0">{location.name}</Text>
                    <Button
                      size="sm"
                      variant="ghost"
                      color="neutral"
                      onClick={() => {
                        startCount(location.id);
                      }}
                    >
                      <Icon glyph={faClipboardCheck} className="size-4" aria-hidden />
                      Count it here
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <BarcodesSection variantId={variantId} sku={sku} ctx={ctx} />

          <HoldsSection holds={holds.data} />
          <HistorySection history={history.data} />
        </div>
      </div>
    </div>
  );
}
