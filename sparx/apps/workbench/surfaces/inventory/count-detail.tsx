'use client';

// A STOCK COUNT SESSION — start one, count each item, apply it to correct your
// real stock numbers in one go.
//
// ── One surface, two states, never a create modal ────────────────────────
//
// A new count IS this surface started empty ({id:'new'}); an open count is the
// same surface with a server row behind it ({id}). Starting a count is real work
// with a durable result you come back to, so it is a pane. On creation the pane
// REPLACES itself with the managed view of the count that now exists, rather than
// leaving a spent form beside a list that has moved on.
//
// ── Not EditorLayout ──────────────────────────────────────────────────────
//
// The heart of this is a line-by-line count with a running difference — a table
// you read down, not a completion-ordered form with a summary rail. So it is one
// centred, capped column, and the lifecycle action lives in the toolbar where
// the pane's primary action belongs.
//
// ── The one guard that matters: applying ─────────────────────────────────
//
// Entering counts is routine and saved on demand. APPLYING a count writes a
// correction to every real stock number through the ledger and cannot be undone,
// so a count whose differences are large — in money or in units — is named in
// plain figures before it is written. Small counts apply without ceremony, so
// the confirm still means something when it appears.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  ClipboardCheck,
  ClipboardList,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, useStockLevels, useStockLocations } from './data';
import { deltaTone, signedDelta } from './movements-data';
import {
  countErrorMessage,
  countState,
  countTypeLabel,
  isCountNotFound,
  useAddCountLine,
  useApproveCount,
  useCancelCount,
  useCount,
  useCreateCount,
  useEnterCounts,
  usePostCount,
  useRemoveCountLine,
  useSubmitCount,
  varianceLabel,
  varianceTone,
  type CountDetail,
  type CountLine,
  type CountType,
} from './counts-data';
import { ScanInput, playScanFeedback } from './scan-input';
import { useScanQueue, useScanToCount, type ScanActionResult } from './scan-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** Centred and capped — a count torn onto a second monitor is 2000px wide, and
 *  uncapped the difference column drifts a foot from the item it belongs to. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** Applying is worth stopping for once the corrections get large. Both terms
 *  matter: the money value catches a costly swing, the unit count catches a big
 *  swing in items whose cost was never entered (so their value reads as zero). */
const BIG_VARIANCE_UNITS = 50;

function parseQty(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   STARTING A COUNT — the {id:'new'} state
   ══════════════════════════════════════════════════════════════════════════ */

function StartCount({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const locationsQuery = useStockLocations();
  const create = useCreateCount();

  const locations = (locationsQuery.data?.items ?? []).filter((location) => location.isActive);

  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<CountType>('full');
  const [note, setNote] = useState('');

  useEffect(() => {
    ctx.setTitle('New count');
  }, [ctx]);

  const touched = warehouseId !== '' || note.trim() !== '';
  useDirtySource(
    touched && !create.isSuccess,
    'This count has not been started yet. Close anyway?'
  );

  const locationName = locations.find((location) => location.id === warehouseId)?.name ?? '';

  const submit = () => {
    if (warehouseId === '') return;
    create.mutate(
      { warehouseId, type, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: (created) => {
          // Become the managed view of the count that now exists. The toast
          // follows the swap rather than sharing its commit — see afterPaneChange.
          ctx.open('inventory.counts.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `Count started at ${locationName}`,
              description:
                type === 'full'
                  ? 'Every item kept here is ready to count.'
                  : 'Add the items you want to count, then enter what you find.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not start the count',
            description: countErrorMessage(error, 'Nothing was created.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New count actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            disabled={warehouseId === '' || create.isPending}
            loading={create.isPending}
            onClick={submit}
          >
            <ClipboardCheck className="size-4" aria-hidden />
            Start counting
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {locationsQuery.isPending ? (
            <p className="p-4 text-sm" role="status">
              Loading your locations…
            </p>
          ) : locations.length === 0 ? (
            <EmptyState
              icon={<Warehouse className="size-6" aria-hidden />}
              title="You have nowhere to count yet"
              description="A count is always tied to one place — a shop, a warehouse, a van. Set up at least one location and you can start counting what is on its shelves."
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
          ) : (
            <section className="card bg-base-100 flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-0.5">
                <Heading level={1} className="text-2xl font-semibold">
                  Start a stock count
                </Heading>
                <Text className="text-sm">
                  Count what is really on the shelf, then apply it to put your numbers right.
                </Text>
              </div>

              <Field>
                <FieldLabel>Where are you counting?</FieldLabel>
                <NativeSelect
                  size="sm"
                  value={warehouseId}
                  aria-label="Where are you counting"
                  onChange={(event) => {
                    setWarehouseId(event.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choose a location…
                  </option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  Counts are kept per place, so counting one shop never changes what another has.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>What do you want to count?</FieldLabel>
                <NativeSelect
                  size="sm"
                  value={type}
                  aria-label="What do you want to count"
                  onChange={(event) => {
                    setType(event.target.value as CountType);
                  }}
                >
                  <option value="full">Everything kept at this location</option>
                  <option value="cycle">Just certain items I&apos;ll choose</option>
                </NativeSelect>
                <FieldDescription>
                  {type === 'full'
                    ? 'Every item with stock here is listed for you to count, ready to go.'
                    : 'You start with an empty list and add the items you want to count as you go — good for a quick spot-check.'}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>A note (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      size="sm"
                      value={note}
                      placeholder="End-of-month count"
                      onChange={(event) => {
                        setNote(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Kept with the count, so it makes sense later.</FieldDescription>
              </Field>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ADD AN ITEM — the counting-phase picker
   ══════════════════════════════════════════════════════════════════════════ */

function AddItems({
  countId,
  warehouseId,
  existing,
}: {
  countId: string;
  warehouseId: string;
  existing: Set<string>;
}) {
  const toast = useToast();
  const add = useAddCountLine(countId);
  const [search, setSearch] = useState('');

  const results = useStockLevels({
    q: search.trim(),
    warehouseId,
    lowStockOnly: false,
    sortBy: 'product',
    order: 'asc',
    take: 8,
    skip: 0,
  });

  const matches = (results.data?.items ?? []).filter((level) => !existing.has(level.variantId));

  const addOne = (variantId: string, label: string) => {
    add.mutate(variantId, {
      onSuccess: () => {
        setSearch('');
        afterPaneChange(() => {
          toast.add({ title: `Added ${label}`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not add that item',
          description: countErrorMessage(error, 'It may already be on the count.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <Heading level={2} className="text-lg font-semibold">
          Add an item to count
        </Heading>
        <Text className="text-sm">Search the items kept at this location.</Text>
      </div>

      <SearchInput
        size="sm"
        aria-label="Search items to add"
        placeholder="Product name or code…"
        value={search}
        onValueChange={setSearch}
      />

      {search.trim() === '' ? null : results.isFetching && matches.length === 0 ? (
        <Text className="text-sm" role="status">
          Searching…
        </Text>
      ) : matches.length === 0 ? (
        <Text className="text-sm">
          Nothing here matches that, or everything matching is already on the count.
        </Text>
      ) : (
        <ul className="flex flex-col gap-1">
          {matches.map((level) => (
            <li key={level.variantId} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{level.productTitle ?? 'Untitled product'}</span>
                <span className="truncate font-mono text-sm">{level.sku ?? 'No code'}</span>
              </span>
              <Button
                size="sm"
                variant="soft"
                color="module"
                className="shrink-0"
                loading={add.isPending}
                onClick={() => {
                  addOne(level.variantId, level.sku ?? level.productTitle ?? 'item');
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE LINES — counting, or read back
   ══════════════════════════════════════════════════════════════════════════ */

function LinesCard({
  count,
  editable,
  drafts,
  setDraft,
  onRemove,
  removingId,
}: {
  count: CountDetail;
  editable: boolean;
  drafts: Record<string, string>;
  setDraft: (lineId: string, value: string) => void;
  onRemove: (line: CountLine) => void;
  removingId: string | null;
}) {
  const posted = count.status === 'posted';
  // On a blind count the server sends no expected quantity while counting, so
  // there is nothing to show and no difference to compute. The columns go away
  // rather than showing an em-dash: an empty column invites someone to go and
  // look the number up, which is exactly what blind counting is preventing.
  const blind = count.isBlind && count.status === 'counting';

  const displayedCounted = (line: CountLine): number | null =>
    drafts[line.id] !== undefined ? parseQty(drafts[line.id]) : line.countedQuantity;

  return (
    <section className="card bg-base-100 flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <Heading level={2} className="text-lg font-semibold">
          {editable ? 'Count each item' : 'What was counted'}
        </Heading>
        <Text className="text-sm">
          {blind
            ? 'Put in what you actually find. What the system expected is hidden until the count is submitted, so the number you write down is the number you saw.'
            : editable
              ? 'Put in what you actually find on the shelf. The difference from what we expected is worked out for you.'
              : 'The quantities counted, and how they differed from what was expected.'}
        </Text>
      </div>

      <Table size="sm">
        <thead>
          <tr>
            <th>Item</th>
            {blind ? null : (
              <th className="hidden text-right whitespace-nowrap @md:table-cell">We think</th>
            )}
            <th className="text-right whitespace-nowrap">Counted</th>
            {blind ? null : <th>{posted ? 'Correction' : 'Difference'}</th>}
            {editable ? <th className="w-0" /> : null}
          </tr>
        </thead>
        <tbody>
          {count.lines.map((line) => {
            const counted = displayedCounted(line);
            const variance =
              counted === null || line.expectedQuantity === null
                ? null
                : counted - line.expectedQuantity;
            return (
              <tr key={line.id}>
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{line.productTitle ?? 'Untitled product'}</span>
                    <span className="truncate font-mono text-sm">
                      {line.variantSku ?? 'No code'}
                    </span>
                    {blind ? null : (
                      <span className="truncate text-sm @md:hidden">
                        We think {String(line.expectedQuantity ?? '—')} here
                      </span>
                    )}
                  </span>
                </td>

                {blind ? null : (
                  <td className="hidden text-right tabular-nums @md:table-cell">
                    {line.expectedQuantity ?? '—'}
                  </td>
                )}

                <td className="text-right">
                  {editable ? (
                    <Input
                      color="module"
                      size="sm"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`Counted quantity for ${line.variantSku ?? 'item'}`}
                      className="ml-auto max-w-24 text-right"
                      value={drafts[line.id] ?? line.countedQuantity?.toString() ?? ''}
                      onChange={(event) => {
                        setDraft(line.id, event.target.value);
                      }}
                    />
                  ) : (
                    <span className="tabular-nums">{line.countedQuantity ?? '—'}</span>
                  )}
                </td>

                {blind ? null : (
                  <td>
                    {posted ? (
                      line.appliedDelta === null || line.appliedDelta === 0 ? (
                        <Badge color="neutral" variant="soft" size="sm">
                          No change
                        </Badge>
                      ) : (
                        <Badge color={deltaTone(line.appliedDelta)} variant="soft" size="sm">
                          <span className="tabular-nums">{signedDelta(line.appliedDelta)}</span>
                        </Badge>
                      )
                    ) : (
                      <Badge color={varianceTone(variance)} variant="soft" size="sm">
                        {varianceLabel(variance)}
                      </Badge>
                    )}
                  </td>
                )}

                {editable ? (
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      color="neutral"
                      shape="square"
                      aria-label={`Remove ${line.variantSku ?? 'this item'} from the count`}
                      title="Remove from this count"
                      loading={removingId === line.id}
                      onClick={() => {
                        onRemove(line);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SCANNING INTO A COUNT (docs/146 Phase 3.6)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The scan path, sitting above the search box because it is the fast one.
 *
 * Two behaviours differ from typing a total, and both are stated on screen
 * rather than left to be discovered:
 *
 *   • Each pull ADDS one. Counting a shelf is one trigger pull per item, so ten
 *     pulls on the same thing is ten. Typing a number still replaces it.
 *   • An item that is not on the sheet gets ADDED to the sheet. Finding stock
 *     the system does not know about is the most valuable thing a count does,
 *     and a workflow that refuses it teaches people to leave it off.
 */
function ScanIntoCount({ count }: { count: CountDetail }) {
  const scan = useScanToCount(count.id);
  const queue = useScanQueue();
  const [result, setResult] = useState<ScanActionResult | null>(null);

  const onScan = async (value: string) => {
    const outcome = await scan.mutateAsync({ value });
    setResult(outcome);
    playScanFeedback(outcome.outcome);
  };

  return (
    <section className="card bg-base-100 flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <Heading level={2} className="text-lg font-semibold">
          Scan what you find
        </Heading>
        <Text className="text-sm">
          One pull of the trigger adds one. Anything not already on the list gets added to it.
        </Text>
      </div>
      <ScanInput
        onScan={onScan}
        placeholder="Scan an item"
        result={result}
        busy={scan.isPending}
        queued={queue.size}
        focusOnMount={false}
      />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SESSION — a loaded count in any of its states
   ══════════════════════════════════════════════════════════════════════════ */

function CountSession({
  ctx,
  count,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  count: CountDetail;
  isFetching: boolean;
  updatedAt: number | undefined;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const enter = useEnterCounts(count.id);
  const submit = useSubmitCount(count.id);
  const approve = useApproveCount(count.id);
  const post = usePostCount(count.id);
  const cancel = useCancelCount(count.id);
  const removeLine = useRemoveCountLine(count.id);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    ctx.setTitle(count.number);
  }, [ctx, count.number]);

  const editable = count.status === 'counting';
  const state = countState(count.status);

  /** Lines whose typed value is valid and actually differs from what the server
   *  holds — the only ones a Save needs to send. */
  const changed = useMemo(
    () =>
      count.lines
        .filter((line) => drafts[line.id] !== undefined)
        .map((line) => ({ line, value: parseQty(drafts[line.id]) }))
        .filter(
          (entry): entry is { line: CountLine; value: number } =>
            entry.value !== null && entry.value !== entry.line.countedQuantity
        ),
    [count.lines, drafts]
  );

  const uncounted = count.lines.filter((line) => {
    const value = drafts[line.id] !== undefined ? parseQty(drafts[line.id]) : line.countedQuantity;
    return value === null;
  }).length;

  useDirtySource(
    changed.length > 0,
    `You have counted quantities on ${count.number} that are not saved. Close anyway?`
  );

  const setDraft = (lineId: string, value: string) => {
    setDrafts((current) => ({ ...current, [lineId]: value }));
  };

  const saveEntries = () =>
    enter.mutateAsync(
      changed.map(({ line, value }) => ({ lineId: line.id, countedQuantity: value }))
    );

  const doSave = async () => {
    if (changed.length === 0) return;
    try {
      await saveEntries();
      afterPaneChange(() => {
        toast.add({ title: 'Counts saved', type: 'success' });
      });
    } catch (error) {
      toast.add({
        title: 'Could not save those counts',
        description: countErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    }
  };

  const doFinish = async () => {
    try {
      if (changed.length > 0) await saveEntries();
      await submit.mutateAsync();
      afterPaneChange(() => {
        toast.add({
          title: 'Counting finished',
          description: 'Review the differences below, then apply them to correct your stock.',
          type: 'success',
        });
      });
    } catch (error) {
      toast.add({
        title: 'Could not finish the count',
        description: countErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    }
  };

  const doApprove = async () => {
    try {
      await approve.mutateAsync();
      afterPaneChange(() => {
        toast.add({ title: 'Count approved', type: 'success' });
      });
    } catch (error) {
      toast.add({
        title: 'Could not approve the count',
        description: countErrorMessage(error, 'Only a manager can approve this.'),
        type: 'error',
      });
    }
  };

  const totalUnitVariance = count.lines.reduce(
    (sum, line) => sum + (line.variance === null ? 0 : Math.abs(line.variance)),
    0
  );
  const differing = count.lines.filter(
    (line) => line.variance !== null && line.variance !== 0
  ).length;

  const doApply = async () => {
    const big =
      count.varianceValueCents > count.approvalThresholdCents ||
      totalUnitVariance >= BIG_VARIANCE_UNITS;
    if (big) {
      const ok = await confirm({
        title: `Apply ${count.number} and correct your stock?`,
        description: `This changes ${plural(differing, 'item', 'items')} at ${
          count.warehouseName ?? 'this location'
        }${
          count.varianceValueCents > 0
            ? `, worth ${formatCents(count.varianceValueCents)} in all`
            : ''
        }. Your on-hand numbers are corrected straight away and the change is recorded against your name. This cannot be undone — if a figure looks wrong, go back before applying.`,
        confirmLabel: 'Yes, apply it',
        cancelLabel: 'Go back',
        color: 'danger',
      });
      if (!ok) return;
    }
    try {
      await post.mutateAsync();
      afterPaneChange(() => {
        toast.add({
          title: `${count.number} applied`,
          description: `${plural(differing, 'item was', 'items were')} corrected.`,
          type: 'success',
        });
      });
    } catch (error) {
      toast.add({
        title: 'Could not apply the count',
        description: countErrorMessage(error, 'Your stock was not changed.'),
        type: 'error',
      });
    }
  };

  const doDiscard = async () => {
    const ok = await confirm({
      title: `Discard ${count.number}?`,
      description:
        'Nothing on your shelves changes — the quantities you have entered are thrown away and the count is closed. This cannot be undone.',
      confirmLabel: 'Discard it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync();
      afterPaneChange(() => {
        toast.add({ title: `${count.number} discarded`, type: 'success' });
      });
    } catch (error) {
      toast.add({
        title: 'Could not discard the count',
        description: countErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    }
  };

  const removeItem = (line: CountLine) => {
    setRemovingId(line.id);
    removeLine.mutate(line.id, {
      onSettled: () => {
        setRemovingId(null);
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove that item',
          description: countErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const canFinish = count.lineCount > 0 && uncounted === 0;
  const canApply =
    (count.status === 'review' && !count.requiresApproval) || count.status === 'approved';
  const canApprove = count.status === 'review' && count.requiresApproval;
  const canDiscard =
    count.status === 'counting' || count.status === 'review' || count.status === 'approved';

  // The most specific true thing about where this count stands. One message, not
  // a stack — the stage the count is at is the one thing the operator needs.
  const notice = buildNotice(count);

  const existing = new Set(count.lines.map((line) => line.variantId));

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Count actions"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {/* The sticker that makes "scan the count sheet" true. Without it that
            instruction in warehouse mode has nothing to scan. */}
            <Tooltip content="Print a scannable label for the count sheet">
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                shape="square"
                className="shrink-0"
                aria-label="Print a scannable label for this count"
                onClick={() => {
                  ctx.open(
                    'inventory.documents.label',
                    {
                      number: count.number,
                      title: 'Stock count',
                      subtitle: count.warehouseName ?? '',
                    },
                    { target: 'beside' }
                  );
                }}
              >
                <Printer className="size-4" aria-hidden />
              </Button>
            </Tooltip>
            {editable ? (
              <>
                {changed.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    color="neutral"
                    className="ml-auto shrink-0 whitespace-nowrap"
                    loading={enter.isPending}
                    onClick={() => {
                      void doSave();
                    }}
                  >
                    <Save className="size-4" aria-hidden />
                    Save
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  color="module"
                  className={`shrink-0 whitespace-nowrap${changed.length > 0 ? '' : 'ml-auto'}`}
                  disabled={!canFinish}
                  loading={submit.isPending || enter.isPending}
                  title={
                    canFinish ? undefined : 'Enter a quantity for every item before you can finish.'
                  }
                  onClick={() => {
                    void doFinish();
                  }}
                >
                  <ClipboardCheck className="size-4" aria-hidden />
                  Finish counting
                </Button>
              </>
            ) : null}
            {canApprove ? (
              <Button
                size="sm"
                color="module"
                className="ml-auto shrink-0 whitespace-nowrap"
                loading={approve.isPending}
                onClick={() => {
                  void doApprove();
                }}
              >
                <ShieldCheck className="size-4" aria-hidden />
                Approve
              </Button>
            ) : null}
            {canApply ? (
              <Button
                size="sm"
                color="module"
                className="ml-auto shrink-0 whitespace-nowrap"
                loading={post.isPending}
                onClick={() => {
                  void doApply();
                }}
              >
                <ClipboardCheck className="size-4" aria-hidden />
                Apply corrections
              </Button>
            ) : null}
            {/* ALWAYS the last child of a toolbar — see RefreshButton. Picks up a
            change someone else made to this count while it sat open. Carries the
            ml-auto itself when no primary action is present to push it over. */}
          </>
        }
        refresh={
          <RefreshButton
            className={editable || canApprove || canApply ? undefined : 'ml-auto'}
            isFetching={
              isFetching ||
              enter.isPending ||
              submit.isPending ||
              post.isPending ||
              approve.isPending
            }
            updatedAt={updatedAt}
            onRefresh={onRefresh}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Identity first: where this count is, then its reference. */}
          <section className="card bg-base-100 flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Heading level={1} className="min-w-0 text-2xl font-semibold break-words">
                  {count.warehouseName ?? 'Stock count'}
                </Heading>
                <Text className="font-mono text-sm">{count.number}</Text>
              </div>
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            </div>
            <Text className="text-sm">
              {countTypeLabel(count.type)} · {plural(count.lineCount, 'item', 'items')} · started{' '}
              <Timestamp value={count.startedAt} format="relative" />
              {count.note ? ` · ${count.note}` : ''}
            </Text>
            {editable && count.lineCount > 0 && uncounted > 0 ? (
              <Text className="text-sm">
                {String(count.lineCount - uncounted)} of {plural(count.lineCount, 'item', 'items')}{' '}
                counted — enter the rest before you can finish.
              </Text>
            ) : null}
          </section>

          {notice ? (
            <Alert color={notice.tone} variant="soft">
              <AlertContent>
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDescription>{notice.body}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* Scanning comes FIRST, above the search box. Counting a shelf by
              scanning is the fast path and searching for each item by name is
              the slow one, so the fast path gets the position. Each pull adds
              one — ten pulls on the same item is ten, which is what counting
              physically is. */}
          {editable ? <ScanIntoCount count={count} /> : null}

          {editable ? (
            <AddItems countId={count.id} warehouseId={count.warehouseId} existing={existing} />
          ) : null}

          {count.lineCount === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-6" aria-hidden />}
              title="No items on this count yet"
              description={
                editable
                  ? 'Search above for the items you want to count and add them here.'
                  : 'This count was closed without any items on it.'
              }
            />
          ) : (
            <LinesCard
              count={count}
              editable={editable}
              drafts={drafts}
              setDraft={setDraft}
              onRemove={removeItem}
              removingId={removingId}
            />
          )}

          {/* Rare, one-way, and NOT the point of the screen — so it sits under a
              divider after the work, not as a card of equal weight beside it. */}
          {canDiscard ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Text className="min-w-0 text-sm">
                Started this by mistake, or need to begin again?
              </Text>
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                loading={cancel.isPending}
                onClick={() => {
                  void doDiscard();
                }}
              >
                <X className="size-4" aria-hidden />
                Discard this count
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The one status message a session shows — the most specific true thing about
 *  where it stands right now. */
function buildNotice(
  count: CountDetail
): { tone: 'success' | 'warning' | 'info' | 'danger'; title: string; body: string } | null {
  switch (count.status) {
    case 'review':
      return count.requiresApproval
        ? {
            tone: 'warning',
            title: 'A manager needs to approve this',
            body: `The differences add up to ${formatCents(
              count.varianceValueCents
            )}, which is over your review limit of ${formatCents(
              count.approvalThresholdCents
            )}. A manager has to approve it before the corrections can be applied.`,
          }
        : {
            tone: 'info',
            title: 'Ready to apply',
            body: 'Counting is finished. Applying this will correct your stock numbers to match what was counted.',
          };
    case 'approved':
      return {
        tone: 'info',
        title: 'Approved — ready to apply',
        body: 'A manager has signed this off. Apply it to correct your stock numbers to match what was counted.',
      };
    case 'posted':
      return {
        tone: 'success',
        title: 'Applied',
        body: 'Your stock numbers were corrected to match this count. Every change is in the movement history, and nothing further is needed.',
      };
    case 'cancelled':
      return {
        tone: 'info',
        title: 'Discarded',
        body: 'This count was closed without applying anything. No stock was changed.',
      };
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PANE — route by id, then load
   ══════════════════════════════════════════════════════════════════════════ */

export function CountDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';

  if (id === 'new') return <StartCount ctx={ctx} />;
  return <LoadedCount ctx={ctx} id={id} />;
}

function LoadedCount({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const count = useCount(id);

  if (id === '') {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title="No count was chosen"
            description="This pane shows one stock count. Open it from the Stock counts list, or start a new one."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  ctx.open('inventory.counts.list', undefined, { target: 'replace' });
                }}
              >
                Open stock counts
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (count.isError) {
    const gone = isCountNotFound(count.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This count no longer exists' : 'Could not load this count'}
          description={
            gone
              ? 'It may have been removed. Your stock and its movement history are unaffected.'
              : 'This is a problem reaching the server. The count is unaffected — it just could not be read just now.'
          }
          onRetry={() => {
            void count.refetch();
          }}
        />
      </div>
    );
  }

  if (count.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading count…
        </p>
      </div>
    );
  }

  return (
    <CountSession
      ctx={ctx}
      count={count.data}
      isFetching={count.isFetching}
      updatedAt={count.dataUpdatedAt}
      onRefresh={() => {
        void count.refetch();
      }}
    />
  );
}
