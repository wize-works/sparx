'use client';

// STOCK — how many of this product exist, where they are, and what is holding them.
//
// A product-scoped facet pane. It implements the contract in product-scope.tsx
// verbatim: resolve the scope, hand every non-ready state to the shared
// fallback, render only when a product is genuinely in hand.
//
// ── Why this pane is not a table ─────────────────────────────────────────
//
// Stock is (variant × location), which reads as a grid and is one on a wide
// screen. But this pane exists to be docked NARROW beside the thing it is about
// — that is the entire reason it is a pane and not a tab — and a six-column grid
// at 340px is columns of two characters each. So the shape is a card per version
// and a row per location inside it: the identity is the content, the state is a
// badge on the right, and it survives any width without a horizontal scrollbar.
//
// ── The two empty states are different problems ──────────────────────────
//
// "No versions yet" and "nowhere to keep stock" both render nothing, and telling
// someone to go set up a warehouse when what they actually lack is a sellable
// version of the product sends them to the wrong screen entirely. They get
// separate states with separate advice, and a third — "counted nowhere yet" —
// is not an error at all, just a product nobody has counted, which is why it
// keeps the working UI rather than replacing it.
//
// ── Available is not on-hand minus allocated ─────────────────────────────
//
// There is a third term: the safety buffer, units deliberately withheld from
// shoppers. When it is set, the arithmetic on screen does not add up unless it
// is stated, and an operator who thinks the number is simply wrong stops
// trusting the whole pane. So a buffered row says so, in words.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Select,
  Text,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  faBoxOpen,
  faBoxes,
  faClipboardCheck,
  faClockRotateLeft,
  faFloppyDisk,
  faLocationDot,
  faLock,
  faShieldCheck,
  faSliders,
  faWarehouse,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  FollowingNotice,
  ProductScopeFallback,
  useProductScope,
  type ProductScope,
} from './product-scope';
import {
  formatCents,
  productErrorMessage,
  useProductMovements,
  useProductReservations,
  useProductStock,
  useProductVariants,
  useSetReorderPolicy,
  useSetStockCount,
  useStockLocations,
  type ProductStockLevel,
  type StockLocation,
  type StockMovement,
  type StockReservation,
  type Tone,
  type Variant,
} from './products-data';
import { PaneEmpty } from '../../components/pane-empty';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneWaiting } from '../../components/pane-waiting';

const LABEL = 'Stock';
/** Registry module for this pane, so the brand draws Stock's own picture in the
 *  empty, waiting and failed states rather than the generic one. */
const MODULE = 'inventory';

/** Centred and capped — a pane torn onto a second monitor is 2000px wide, and
 *  uncapped this becomes a line of numbers pinned to the left edge. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

type ReadyScope = Extract<ProductScope, { state: 'ready' }>;

/* ── Freezing a following pane while an editor is open ──────────────────── */

/**
 * Reports "an inline editor is open somewhere below" up to the surface root.
 *
 * `useProductScope`'s `hold` is the only thing that stops a FOLLOWING pane
 * re-pointing at another product mid-edit, and it has to be answered ABOVE the
 * hook — which is three levels above the count form that knows. A context is the
 * cheapest way to say it upward without threading a callback through every card
 * and row. Keys are per-editor so two open at once both have to close before the
 * pane is free to move again.
 */
const EditorRegistry = createContext<(key: string, open: boolean) => void>(() => undefined);

/** Declares this editor open for as long as it is mounted. */
function useHoldWhileOpen(key: string): void {
  const register = useContext(EditorRegistry);
  useEffect(() => {
    register(key, true);
    return () => {
      register(key, false);
    };
  }, [register, key]);
}

/* ── Saying what a number means ─────────────────────────────────────────── */

interface LevelState {
  label: string;
  tone: Tone;
}

/**
 * How many a shopper could actually buy right now.
 *
 * NOT `level.available`, and the difference is the whole reason this function
 * exists. The API's `available` is `onHand − allocated` and stops there, but the
 * sell path also withholds the safety buffer — so on a buffered level `available`
 * is a number nobody can ever reach. Showing it beside a sentence saying units
 * are held back produced exactly the contradiction that sentence was written to
 * prevent: "3 units are held back" over two identical figures.
 *
 * Derived here rather than fixed in the API on purpose: `available` is a
 * documented public-API field that integrators already read, and quietly
 * changing what it means is not a call to make from a UI pane.
 */
function sellable(level: ProductStockLevel): number {
  return Math.max(0, level.onHand - level.allocated - level.safetyBuffer);
}

/**
 * What this level actually means for selling, in the words an owner would use.
 *
 * Derived from what a shopper can BUY — not from on-hand, which can be plentiful
 * while every unit is already spoken for or held back.
 */
function levelState(level: ProductStockLevel): LevelState {
  const canSell = sellable(level);
  if (canSell <= 0) {
    return { label: 'None to sell', tone: 'danger' };
  }
  if (level.reorderPoint !== null && canSell <= level.reorderPoint) {
    return { label: 'Running low', tone: 'warning' };
  }
  return { label: 'In stock', tone: 'success' };
}

/** A version's name as a person would say it — its code, and its option
 *  combination when it has one. */
function variantLabel(variant: Variant): string {
  return variant.title ? `${variant.sku} · ${variant.title}` : variant.sku;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Name a few things inside a sentence, and stop naming them before the sentence
 *  turns into a list. WHICH ones is the useful part when there are three; when
 *  there are fifteen the cards below are the list and the number is the news —
 *  and this pane is built to be docked at 340px, where fifteen codes is a wall. */
function listNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${String(names[0])}.`;
  if (names.length <= 3) {
    return `${names.slice(0, -1).join(', ')} and ${String(names[names.length - 1])}.`;
  }
  return `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more.`;
}

/** The ledger's stored reason, said in plain words. The stored words are the
 *  engineer's ("sync", "transfer_out"); these are the shop's. */
function movementReason(movement: StockMovement): string {
  switch (movement.reason) {
    case 'sale':
      return 'Sold';
    case 'return':
      return 'Came back from a customer';
    case 'cancel':
      return 'Put back after a cancelled order';
    case 'recount':
      return 'Counted';
    case 'loss':
      return 'Lost';
    case 'damage':
      return 'Damaged';
    case 'transfer_in':
      return 'Arrived from another location';
    case 'transfer_out':
      return 'Sent to another location';
    case 'receive':
      return 'Received from a supplier';
    case 'sync':
      return 'Corrected by a connected system';
    default:
      return 'Changed by hand';
  }
}

/** What is holding a unit, said in plain words. */
function holderLabel(reservation: StockReservation): string {
  switch (reservation.holderType) {
    case 'cart':
      return 'In someone’s basket';
    case 'order':
      return 'On an order not yet shipped';
    case 'subscription':
      return 'Held for a repeating order';
    default:
      return 'Held';
  }
}

/* ── Recording a count ──────────────────────────────────────────────────── */

/**
 * The correction form for ONE version at ONE place.
 *
 * It asks for the number that is actually on the shelf, not the difference from
 * the number we think is there. Someone who has just counted knows "nine"; making
 * them work out "minus two" from a figure they already believe is wrong is how a
 * correction turns into a second error. The server reconciles it to a movement
 * under a row lock, so a sale landing mid-count cannot be overwritten.
 */
function CountForm({
  productId,
  variant,
  locations,
  levels,
  initialWarehouseId,
  onDone,
}: {
  productId: string;
  variant: Variant;
  locations: StockLocation[];
  levels: ProductStockLevel[];
  initialWarehouseId: string | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const setCount = useSetStockCount(productId);
  useHoldWhileOpen(`count:${variant.id}`);

  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? locations[0]?.id ?? '');
  const current = levels.find((level) => level.warehouseId === warehouseId) ?? null;
  const [counted, setCounted] = useState(String(current?.onHand ?? 0));
  const [note, setNote] = useState('');

  const parsed = Number.parseInt(counted, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0 && warehouseId !== '';
  // `current?.onHand` is undefined when this version has never been counted
  // here, which is never equal to a parsed number — so a first count reads as
  // changed, exactly as it should.
  const changed = current?.onHand !== parsed || note.trim() !== '';

  useDirtySource(
    changed && valid,
    `A counted quantity for ${variant.sku} has not been saved. Close anyway?`
  );

  const locationItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const location of locations) items[location.id] = location.name;
    return items;
  }, [locations]);

  const submit = () => {
    if (!valid) return;
    setCount.mutate(
      {
        variantId: variant.id,
        warehouseId,
        onHand: parsed,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      },
      {
        onSuccess: () => {
          // Collapse FIRST, announce after, one tick apart. `onDone` unmounts
          // this form, whose `useHoldWhileOpen` cleanup sets state on the
          // surface root — so the toast is describing a state that has already
          // settled rather than racing it.
          //
          // NOTE: this does NOT silence Base UI's "flushSync was called from
          // inside a lifecycle method". That warning comes from ToastRoot's own
          // mount layout effect measuring its height while the invalidation's
          // refetch is still re-rendering, and it fires for every
          // invalidate-then-toast save in this app, unmount or not. See the
          // report accompanying this change — the fix belongs in the shared
          // toast wiring, not here.
          onDone();
          afterPaneChange(() => {
            toast.add({
              title: `${variant.sku} counted`,
              description: `Now recorded as ${plural(parsed, 'unit', 'units')} at ${
                locationItems[warehouseId] ?? 'that location'
              }.`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not record that count',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="border-base-300 bg-base-200 flex flex-col gap-3 rounded-lg border p-3">
      <Heading level={4} className="text-base font-semibold">
        Record what you counted
      </Heading>

      <Field>
        <FieldLabel>Where you counted it</FieldLabel>
        <Select
          color="module"
          size="sm"
          items={locationItems}
          value={warehouseId}
          aria-label="Where you counted it"
          onValueChange={(next) => {
            const id = next as string;
            setWarehouseId(id);
            setCounted(String(levels.find((l) => l.warehouseId === id)?.onHand ?? 0));
          }}
        />
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
                if (event.key === 'Enter') submit();
              }}
            />
          }
        />
        <FieldDescription>
          {current
            ? `We currently think there are ${plural(current.onHand, 'unit', 'units')} here. Put in what you actually counted — we work out the difference and record it.`
            : 'This version has never been counted here. Put in what is on the shelf.'}
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
              placeholder="Found two in the back"
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
          loading={setCount.isPending}
          onClick={submit}
        >
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          Save this count
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── Reorder policy ─────────────────────────────────────────────────────── */

/** When to reorder, how many to get, and how long it takes to come. All three
 *  together, because a trigger without a lead time is a guess. */
function ReorderForm({
  productId,
  variant,
  level,
  onDone,
}: {
  productId: string;
  variant: Variant;
  level: ProductStockLevel;
  onDone: () => void;
}) {
  const toast = useToast();
  const save = useSetReorderPolicy(productId);
  useHoldWhileOpen(`rule:${variant.id}:${level.warehouseId}`);

  const [point, setPoint] = useState(String(level.reorderPoint ?? ''));
  const [quantity, setQuantity] = useState(String(level.reorderQuantity ?? ''));
  const [lead, setLead] = useState(String(level.leadTimeDays ?? ''));

  const pointValue = Number.parseInt(point, 10);
  const quantityValue = Number.parseInt(quantity, 10);
  const leadValue = Number.parseInt(lead, 10);
  const valid =
    Number.isFinite(pointValue) &&
    pointValue >= 0 &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0;

  useDirtySource(valid, `A reorder rule for ${variant.sku} has not been saved. Close anyway?`);

  const submit = () => {
    if (!valid) return;
    save.mutate(
      {
        variantId: variant.id,
        warehouseId: level.warehouseId,
        reorderPoint: pointValue,
        reorderQuantity: quantityValue,
        ...(Number.isFinite(leadValue) && leadValue >= 0 ? { leadTimeDays: leadValue } : {}),
      },
      {
        onSuccess: () => {
          // Collapse first, announce after — see the note in CountForm.
          onDone();
          afterPaneChange(() => {
            toast.add({ title: 'Reorder rule saved', type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that rule',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="border-base-300 bg-base-200 flex flex-col gap-3 rounded-lg border p-3">
      <Heading level={4} className="text-base font-semibold">
        Tell me when to get more
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!valid}
          loading={save.isPending}
          onClick={submit}
        >
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          Save this rule
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── One location's line within a version ───────────────────────────────── */

function LevelRow({
  productId,
  variant,
  level,
  currency,
  onExplain,
}: {
  productId: string;
  variant: Variant;
  level: ProductStockLevel;
  currency: string;
  /** Open the explanation of THIS location's number, beside. */
  onExplain: () => void;
}) {
  const [editingRule, setEditingRule] = useState(false);
  const state = levelState(level);
  const cost = level.avgCostCents ?? level.unitCostCents;

  return (
    <div className="border-base-300 flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon glyph={faLocationDot} className="size-4 shrink-0" aria-hidden />
          <Text className="min-w-0 font-semibold">{level.warehouseName}</Text>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
          {/* Same affordance as the Inventory module's own item pane, in the
              same place, because it is the same question asked of the same
              number — a merchant who learns it here should find it there. */}
          <Tooltip content="Where this number came from">
            <Button
              size="sm"
              variant="ghost"
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
          <Text className="text-2xl font-semibold">{sellable(level)}</Text>
          <Text className="text-sm">To sell</Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold">{level.onHand}</Text>
          <Text className="text-sm">On the shelf</Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-2xl font-semibold">{level.allocated}</Text>
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
              )}${level.leadTimeDays === null ? '' : ` · about ${plural(level.leadTimeDays, 'day', 'days')} to arrive`}`}
          {cost === null ? '' : ` · costs you ${formatCents(cost, currency)} each`}
        </Text>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditingRule((open) => !open);
          }}
        >
          <Icon glyph={faSliders} className="size-4" aria-hidden />
          {level.reorderPoint === null ? 'Set a reorder rule' : 'Change the rule'}
        </Button>
      </div>

      {editingRule ? (
        <ReorderForm
          productId={productId}
          variant={variant}
          level={level}
          onDone={() => {
            setEditingRule(false);
          }}
        />
      ) : null}
    </div>
  );
}

/* ── One version ────────────────────────────────────────────────────────── */

function VariantCard({
  productId,
  variant,
  levels,
  locations,
  currency,
  onExplain,
}: {
  onExplain: (warehouseId: string) => void;
  productId: string;
  variant: Variant;
  levels: ProductStockLevel[];
  locations: StockLocation[];
  currency: string;
}) {
  const [counting, setCounting] = useState(false);
  const totalAvailable = levels.reduce((sum, level) => sum + sellable(level), 0);

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col">
          <Heading level={3} className="min-w-0 text-lg font-semibold break-all">
            {variantLabel(variant)}
          </Heading>
          <Text className="text-sm">
            {levels.length === 0
              ? 'Not counted anywhere yet'
              : `${plural(totalAvailable, 'unit', 'units')} to sell across ${plural(
                  levels.length,
                  'location',
                  'locations'
                )}`}
          </Text>
        </div>
        <Button
          size="sm"
          variant="outline"
          color="module"
          onClick={() => {
            setCounting((open) => !open);
          }}
        >
          <Icon glyph={faClipboardCheck} className="size-4" aria-hidden />
          Record a count
        </Button>
      </div>

      {levels.length === 0 ? (
        <Text className="text-sm">
          Nobody has said how many of this version you have, so your website sells it without limit.
          Count it once and it starts keeping track.
        </Text>
      ) : (
        <div className="flex flex-col gap-3">
          {levels.map((level) => (
            <LevelRow
              key={level.warehouseId}
              productId={productId}
              variant={variant}
              level={level}
              currency={currency}
              onExplain={() => {
                onExplain(level.warehouseId);
              }}
            />
          ))}
        </div>
      )}

      {counting ? (
        <CountForm
          productId={productId}
          variant={variant}
          locations={locations}
          levels={levels}
          initialWarehouseId={levels[0]?.warehouseId ?? null}
          onDone={() => {
            setCounting(false);
          }}
        />
      ) : null}
    </section>
  );
}

/* ── Holds and history ──────────────────────────────────────────────────── */

function HoldsSection({ reservations }: { reservations: StockReservation[] }) {
  if (reservations.length === 0) return null;
  const total = reservations.reduce((sum, hold) => sum + hold.quantity, 0);

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={3} className="text-lg font-semibold">
          What is holding stock
        </Heading>
        <Text className="text-sm">
          {plural(total, 'unit is', 'units are')} on the shelf but already promised, so they are not
          offered for sale.
        </Text>
      </div>
      <ul className="flex flex-col gap-2">
        {reservations.map((hold) => (
          <li key={hold.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="min-w-0">
              <span className="font-semibold">{hold.quantity}</span> ×{' '}
              {hold.variantSku ?? 'a version'} — {holderLabel(hold)}
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

/** The last few changes. Capped on screen because this is context, not the
 *  point of the pane — the full ledger has a surface of its own. */
function HistorySection({ movements }: { movements: StockMovement[] }) {
  const [expanded, setExpanded] = useState(false);
  if (movements.length === 0) return null;
  const shown = expanded ? movements : movements.slice(0, 8);

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={3} className="flex items-center gap-2 text-lg font-semibold">
          <Icon glyph={faClockRotateLeft} className="size-4" aria-hidden />
          Recent changes
        </Heading>
        <Text className="text-sm">Every change to this product’s counts, newest first.</Text>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((movement) => (
          <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <Text className="min-w-0">
              <span className="font-semibold">
                {movement.delta > 0 ? `+${String(movement.delta)}` : movement.delta}
              </span>{' '}
              {movementReason(movement)} · {movement.variantSku ?? 'a version'}
              {movement.warehouseName === null ? '' : ` at ${movement.warehouseName}`}
              {movement.note === null ? '' : ` — ${movement.note}`}
            </Text>
            <Text className="text-sm">
              <Timestamp value={movement.createdAt} format="relative" />
            </Text>
          </li>
        ))}
      </ul>
      {movements.length > 8 ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => {
            setExpanded((open) => !open);
          }}
        >
          {expanded ? 'Show fewer' : `Show all ${String(movements.length)}`}
        </Button>
      ) : null}
    </section>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

function StockBody({ ctx, scope }: { ctx: SurfaceContext; scope: ReadyScope }) {
  const productId = scope.productId;
  const stock = useProductStock(productId);
  const variantsQuery = useProductVariants(productId);
  const locationsQuery = useStockLocations();
  const reservations = useProductReservations(productId);
  const movements = useProductMovements(productId);

  // Memoised because `?? []` mints a fresh array every render, which would make
  // the grouping below recompute on every keystroke in any editor on the pane.
  const levels = useMemo(() => stock.data?.items ?? [], [stock.data]);
  const variants = variantsQuery.data ?? [];
  const locations = (locationsQuery.data?.items ?? []).filter((location) => location.isActive);
  const currency = variants[0]?.currency ?? 'USD';

  const byVariant = useMemo(() => {
    const map = new Map<string, ProductStockLevel[]>();
    for (const level of levels) {
      const list = map.get(level.variantId);
      if (list) list.push(level);
      else map.set(level.variantId, [level]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
    }
    return map;
  }, [levels]);

  const totals = levels.reduce(
    (sum, level) => ({
      available: sum.available + sellable(level),
      onHand: sum.onHand + level.onHand,
      allocated: sum.allocated + level.allocated,
    }),
    { available: 0, onHand: 0, allocated: 0 }
  );

  const low = levels.filter(
    (level) => level.reorderPoint !== null && sellable(level) <= level.reorderPoint
  );

  // Versions nobody has ever counted. A version becomes stock-managed by being
  // COUNTED, not by existing (availability.ts), so these sell WITHOUT LIMIT
  // however their "when you run out" setting reads — and the totals above are
  // the counted ones only.
  //
  // The card for each one already says so, and the message below is that
  // sentence raised to the top of the pane. It had to be, because the mixed case
  // is the one that arrives by surprise: adding a colour to a shirt that already
  // sells makes five new versions in one press, and the person doing it is
  // thinking about the colour (issue 444).
  const uncounted = variants.filter((variant) => !byVariant.has(variant.id));

  // ONE message, the most specific true one. A "running low" warning while
  // something is outright unsellable would bury the worse news under the milder.
  const outOfStock = levels.filter((level) => sellable(level) <= 0);
  const alert: { tone: Tone; title: string; body: string } | null =
    levels.length === 0
      ? null
      : outOfStock.length > 0
        ? {
            tone: 'danger',
            title:
              outOfStock.length === levels.length
                ? 'Nothing left to sell'
                : `${plural(outOfStock.length, 'place has', 'places have')} nothing left`,
            body: 'Your website shows it as sold out and will not take an order for it. It comes back on sale by itself the moment you count some in.',
          }
        : low.length > 0
          ? {
              tone: 'warning',
              title: `${plural(low.length, 'version is', 'versions are')} running low`,
              body: 'These have reached the level you asked to be warned at. Ordering now is what keeps them from selling out.',
            }
          : null;

  const failedToLoad = stock.isError || variantsQuery.isError;
  const stillLoading = stock.isPending || variantsQuery.isPending || locationsQuery.isPending;

  // Every branch returns a CARD, because the populated one is a stack of them.
  // A state that skipped it sat on the pane's recessed surface while the state
  // either side of it sat lifted, so the pane jumped as the data arrived.
  const body = () => {
    // A failed load REPLACES the working UI. Rendering an empty stock list beside
    // live count buttons would invite someone to correct a count they cannot see.
    // The empty-state shape, not an Alert: there is nothing behind the message
    // for a banner to sit over. See components/pane-load-error.tsx.
    if (failedToLoad) {
      return (
        <Card>
          <PaneLoadError
            module={MODULE}
            icon={<Icon glyph={faBoxOpen} className="size-6" aria-hidden />}
            title="Could not load stock for this product"
            description="This is a problem reaching the server. Nothing about your stock has changed — it just could not be read just now."
            onRetry={() => {
              void stock.refetch();
              void variantsQuery.refetch();
            }}
          />
        </Card>
      );
    }

    if (stillLoading) {
      return (
        <Card>
          <PaneWaiting module={MODULE} />
        </Card>
      );
    }

    // Two different problems, two different answers. Sending someone to set up a
    // storage location when what they lack is a sellable version of the product
    // wastes the trip.
    if (variants.length === 0) {
      return (
        <Card>
          <PaneEmpty
            module={MODULE}
            icon={<Icon glyph={faBoxOpen} className="size-6" aria-hidden />}
            title="There is nothing to count yet"
            description="This product has no versions, so there is nothing that can be stocked or sold. Add one on the product itself and it will appear here."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={(event) => {
                  ctx.open(
                    'commerce.product.detail',
                    { id: productId },
                    { target: event.shiftKey ? 'tab' : 'beside' }
                  );
                }}
              >
                Open this product
              </Button>
            }
          />
        </Card>
      );
    }

    if (locations.length === 0) {
      return (
        <Card>
          <PaneEmpty
            module={MODULE}
            icon={<Icon glyph={faWarehouse} className="size-6" aria-hidden />}
            title="You have nowhere to keep stock yet"
            description="Counts are always kept per place — a shop, a warehouse, a garage. Set up at least one and you can start recording how many of this product you have."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={(event) => {
                  ctx.open('inventory.warehouses.list', undefined, {
                    target: event.shiftKey ? 'beside' : 'tab',
                  });
                }}
              >
                Set up a location
              </Button>
            }
          />
        </Card>
      );
    }

    return (
      <>
        {/* The product-wide answer first, so the question "do I have any" is
            settled before anyone reads a single row. */}
        {levels.length > 0 ? (
          <section className="card bg-base-100 grid grid-cols-3 gap-2 p-4">
            <div className="flex flex-col">
              <Text className="text-3xl font-semibold">{totals.available}</Text>
              <Text className="text-sm">To sell</Text>
            </div>
            <div className="flex flex-col">
              <Text className="text-3xl font-semibold">{totals.onHand}</Text>
              <Text className="text-sm">On the shelf</Text>
            </div>
            <div className="flex flex-col">
              <Text className="text-3xl font-semibold">{totals.allocated}</Text>
              <Text className="text-sm">Spoken for</Text>
            </div>
          </section>
        ) : null}

        {alert ? (
          <Alert color={alert.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.body}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {/* One message about the ABSENCE of counts, beside the one above about the
            counts themselves. They are different news and neither buries the
            other: "nothing left" is a sale you will not make, "not counted" is a
            sale you will make and cannot fill. */}
        {levels.length === 0 ? (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>Nothing has been counted yet</AlertTitle>
              <AlertDescription>
                Until you count it, your website sells this one without limit — nobody has told it
                there is a number. Record a count against any version below and it starts keeping
                track: it comes off sale at zero, and back on when you bring more in.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : uncounted.length > 0 ? (
          // `soft`, unlike the standalone one above it: this one sits directly
          // under the counted-stock band, and a solid fill over a soft one reads
          // as the louder of the two whatever the words say.
          <Alert color="info" variant="soft">
            <AlertContent>
              <AlertTitle>
                {plural(uncounted.length, 'version has', 'versions have')} never been counted
              </AlertTitle>
              <AlertDescription>
                {uncounted.length === 1
                  ? 'Nobody has said how many of it you have, so your website sells it without limit and the numbers above leave it out.'
                  : 'Nobody has said how many of these you have, so your website sells them without limit and the numbers above leave them out.'}{' '}
                {listNames(uncounted.map((variant) => variant.sku))} Record a count against{' '}
                {uncounted.length === 1 ? 'it' : 'each'} below and it starts keeping track.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {variants.map((variant) => (
          <VariantCard
            key={variant.id}
            productId={productId}
            variant={variant}
            levels={byVariant.get(variant.id) ?? []}
            locations={locations}
            currency={currency}
            onExplain={(warehouseId) => {
              ctx.open(
                'inventory.stock.provenance',
                { variantId: variant.id, warehouseId },
                { target: 'beside' }
              );
            }}
          />
        ))}

        <HoldsSection reservations={reservations.data?.items ?? []} />
        <HistorySection movements={movements.data?.items ?? []} />
      </>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock actions"
        status={
          <>
            {scope.isFollowing ? (
              <Badge color="info" variant="soft" size="sm">
                Following
              </Badge>
            ) : null}
            {/* Sheds its label first when the pane is narrow — the number is the
            point, and it is already carried by the summary card below. */}
            {levels.length > 0 ? (
              <Badge variant="outline" size="sm" className="ml-auto hidden @md:inline-flex">
                <Icon glyph={faBoxes} className="size-3" aria-hidden />
                {String(totals.available)} to sell
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={stock.isFetching}
            updatedAt={stock.dataUpdatedAt}
            onRefresh={() => {
              void stock.refetch();
              void reservations.refetch();
              void movements.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <FollowingNotice scope={scope} />
          {body()}
        </div>
      </div>
    </div>
  );
}

export function ProductStockSurface({ ctx }: { ctx: SurfaceContext }) {
  // Which inline editors are open, tracked HERE because `hold` has to be
  // answered above `useProductScope` — a following pane that re-points while
  // someone is halfway through typing a counted quantity loses it with no
  // dialog, which is the one failure the hold exists to prevent.
  const [openEditors, setOpenEditors] = useState<string[]>([]);
  const register = useCallback((key: string, open: boolean) => {
    setOpenEditors((current) =>
      open
        ? current.includes(key)
          ? current
          : [...current, key]
        : current.filter((candidate) => candidate !== key)
    );
  }, []);

  const scope = useProductScope(ctx, { label: LABEL, hold: openEditors.length > 0 });

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} module={MODULE} />;
  }
  return (
    <EditorRegistry.Provider value={register}>
      {/* Keyed on the product so a following pane that DID move starts with
          every editor closed, rather than leaving a form open over a product it
          was never opened against. */}
      <StockBody key={scope.productId} ctx={ctx} scope={scope} />
    </EditorRegistry.Provider>
  );
}
