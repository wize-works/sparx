'use client';

// ONE COUNTING SCHEDULE — set it up, or change it.
//
// ── Create and edit are the same surface ──────────────────────────────────
//
// `{id:'new'}` renders exactly what `{id}` renders, so the form exists once. The
// house rule, and the reason a create modal was never an option here.
//
// ── The defaults ARE the advice ───────────────────────────────────────────
//
// A new schedule opens as "top-value stock, every month, 50 at a time, blind" —
// which is the setup the whole trade converges on, and which somebody who has
// never cycle-counted before has no way to arrive at from an empty form. Every
// choice is still theirs; none of them is a blank box with a question mark.
//
// Blind is the default and it is the one worth defending: a scheduled count
// exists to MEASURE accuracy, and showing the counter the expected figure
// measures agreement instead. A hand-made count still defaults the other way,
// because a person counting one shelf on purpose usually wants the comparison in
// front of them.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Heading,
  Input,
  NativeSelect,
  Switch,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { faCalendarClock, faFloppyDisk, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import {
  abcLabel,
  abcTone,
  cadenceLabel,
  scheduleState,
  useCountSchedule,
  useDeleteCountSchedule,
  useSaveCountSchedule,
  type AbcClass,
  type CountCadence,
} from './planning-data';

interface Draft {
  warehouseId: string;
  name: string;
  abcClass: '' | AbcClass;
  zoneName: string;
  cadence: CountCadence;
  intervalDays: number;
  maxItemsPerRun: number;
  isBlind: boolean;
  isActive: boolean;
}

/** What a brand-new schedule opens as — the setup the trade converges on. */
const NEW_DRAFT: Draft = {
  warehouseId: '',
  name: 'Top-value stock, monthly',
  abcClass: 'A',
  zoneName: '',
  cadence: 'monthly',
  intervalDays: 30,
  maxItemsPerRun: 50,
  isBlind: true,
  isActive: true,
};

const CADENCES: { value: CountCadence; label: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'annually', label: 'Once a year' },
  { value: 'custom', label: 'Every so many days…' },
];

/** Is the next run already owed? A schedule is due the moment it is created, so
 *  this is the normal state on first save, not an edge case. */
function isDue(nextRunAt: string | null): boolean {
  if (!nextRunAt) return false;
  const at = new Date(nextRunAt).getTime();
  return Number.isFinite(at) && at <= Date.now();
}

export function CountScheduleDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = ctx.params.id ?? 'new';
  const isNew = id === 'new';

  const locations = useStockLocations();
  // MEMOIZED because this array is a dependency of the seeding effect below. A bare
  // `.filter(…)` returns a NEW array on every render, so the effect re-ran every render,
  // and its `existing.data` branch calls `setDraft` with a fresh object each time — which
  // re-renders, which rebuilds the array, which re-runs the effect. That is an unbounded
  // loop: the pane pinned a core and filled the console with "Maximum update depth
  // exceeded" for as long as it stayed open, and because React's depth counter is shared,
  // the error surfaced against whatever component happened to setState next — including
  // innocent `onChange` handlers in unrelated panes.
  const activeLocations = useMemo(
    () => (locations.data?.items ?? []).filter((location) => location.isActive),
    [locations.data]
  );

  const existing = useCountSchedule(id);
  const save = useSaveCountSchedule(id);
  const remove = useDeleteCountSchedule();
  const confirm = useConfirm();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [dirty, setDirty] = useState(false);

  // Seed from the server ONCE PER RECORD, and default a new schedule's location
  // to the only one there is — a single-warehouse business should never have to
  // answer a question with one possible answer.
  //
  // The `useMemo` above removed one way this effect could re-run every render;
  // the ref below removes the CONSEQUENCE, which is the part worth being sure
  // about. Seeding was previously guarded by nothing at all, so anything that
  // gave `existing.data` a new identity — a background refetch, a cache write
  // from another pane, a future `select` — put a fresh object into state, which
  // re-rendered, which could re-run this, which seeded again. React's update-depth
  // counter is shared across the tree, so when that did run away it reported
  // itself against whichever component set state next, in whichever pane. Two
  // hours of this migration's verification went into a loop attributed here that
  // turned out to be a mount-time storm; a guard that cannot loop is worth more
  // than a dependency array that currently happens not to.
  //
  // Seeding once is also the correct BEHAVIOUR, independently of the loop: a
  // refetch landing while someone is mid-edit must not overwrite what they have
  // typed. `save` resets the ref, so a successful save re-seeds from the server.
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    const server = existing.data;
    if (server) {
      if (seededFor.current === id) return;
      seededFor.current = id;
      setDraft({
        warehouseId: server.warehouseId,
        name: server.name,
        abcClass: server.abcClass ?? '',
        zoneName: server.zoneName ?? '',
        cadence: server.cadence,
        intervalDays: server.intervalDays,
        maxItemsPerRun: server.maxItemsPerRun,
        isBlind: server.isBlind,
        isActive: server.isActive,
      });
      setDirty(false);
      return;
    }
    if (isNew && activeLocations.length > 0) {
      // Returning `current` unchanged when there is nothing to do lets React bail
      // out of the re-render entirely, so this branch cannot feed itself either.
      setDraft((current) =>
        current.warehouseId === ''
          ? { ...current, warehouseId: activeLocations[0]?.id ?? '' }
          : current
      );
    }
  }, [existing.data, id, isNew, activeLocations]);

  useDirtySource(dirty, 'This counting schedule has unsaved changes. Close it anyway?');

  const patch = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
  };

  const canSave = draft.name.trim().length > 0 && draft.warehouseId !== '';

  const onSave = () => {
    save.mutate(
      {
        ...(isNew ? { warehouseId: draft.warehouseId } : {}),
        name: draft.name.trim(),
        abcClass: draft.abcClass === '' ? null : draft.abcClass,
        zoneName: draft.zoneName.trim() === '' ? null : draft.zoneName.trim(),
        cadence: draft.cadence,
        ...(draft.cadence === 'custom' ? { intervalDays: draft.intervalDays } : {}),
        maxItemsPerRun: draft.maxItemsPerRun,
        isBlind: draft.isBlind,
        ...(isNew ? {} : { isActive: draft.isActive }),
      },
      {
        onSuccess: (saved) => {
          setDirty(false);
          // Let the refetch that follows re-seed the form from what the server
          // actually stored — the one moment where server data SHOULD win, since
          // there are no unsaved edits left to protect.
          seededFor.current = null;
          toast.add({
            title: isNew ? 'Schedule set up' : 'Schedule saved',
            description: `${saved.name} — next count ${new Date(saved.nextRunAt).toLocaleDateString()}.`,
            type: 'success',
          });
          if (isNew) ctx.open('inventory.count-schedules.detail', { id: saved.id });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that schedule',
            description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      description:
        'The counts it has already created are kept — they are the record that counting happened. What stops is the counting itself: nothing will create the next one.',
      confirmLabel: 'Delete the schedule',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(id, {
      onSuccess: () => {
        setDirty(false);
        toast.add({ title: 'Schedule deleted', type: 'success' });
        ctx.close();
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that schedule',
          description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
          type: 'error',
        });
      },
    });
  };

  if (!isNew && existing.isLoading) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting label="Loading the schedule…" />
      </div>
    );
  }

  const state = existing.data ? scheduleState(existing.data) : null;

  return (
    <div className={`${PANE_SHELL} overflow-y-auto`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2} className="text-lg">
          {isNew ? 'Set up a counting schedule' : 'Counting schedule'}
        </Heading>
        {state ? (
          <Badge color={state.tone} variant="soft">
            {state.label}
          </Badge>
        ) : null}
      </div>

      {existing.data?.lastCountOpen ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>The last count from this schedule is still open</AlertTitle>
            <AlertDescription>
              Count {existing.data.lastCountNumber} has not been posted, so no new count will be
              created until it is. Two open counts over the same shelves produce two sets of
              expected figures for one lot of stock, and posting the second silently undoes the
              first.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-base">What to call it</span>
          <Input
            value={draft.name}
            placeholder="Top-value stock, monthly"
            onChange={(event) => {
              patch({ name: event.target.value });
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-base">Which location</span>
          <NativeSelect
            value={draft.warehouseId}
            disabled={!isNew}
            onChange={(event) => {
              patch({ warehouseId: event.target.value });
            }}
          >
            <option value="">Choose a location…</option>
            {activeLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </NativeSelect>
          {!isNew ? (
            <span className="text-sm">
              A schedule belongs to its location — set up another one to cover somewhere else.
            </span>
          ) : null}
        </label>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Heading level={3} className="text-base">
          What it covers
        </Heading>
        <Text className="text-sm">
          Counting where the money is often, and the long tail rarely, covers a whole catalog for a
          fraction of the effort of a full stocktake.
        </Text>

        <label className="flex flex-col gap-1">
          <span className="text-base">Which stock</span>
          <NativeSelect
            value={draft.abcClass}
            onChange={(event) => {
              patch({ abcClass: event.target.value as '' | AbcClass });
            }}
          >
            <option value="">Everything at this location</option>
            <option value="A">Top-value stock only</option>
            <option value="B">Mid-value stock only</option>
            <option value="C">The long tail only</option>
          </NativeSelect>
          {draft.abcClass ? (
            <span className="text-sm">
              <Badge color={abcTone(draft.abcClass)} variant="soft" size="sm">
                {abcLabel(draft.abcClass)}
              </Badge>{' '}
              is worked out from what you actually use in a year, and it is kept up to date
              overnight — so this schedule follows the stock, not a list you have to maintain.
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-base">Narrow to one zone (optional)</span>
          <Input
            value={draft.zoneName}
            placeholder="e.g. Mezzanine"
            onChange={(event) => {
              patch({ zoneName: event.target.value });
            }}
          />
          <span className="text-sm">
            Leave blank for the whole location. A zone is whatever you named it on your shelves.
          </span>
        </label>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Heading level={3} className="text-base">
          How often, and how much at a time
        </Heading>

        <label className="flex flex-col gap-1">
          <span className="text-base">How often</span>
          <NativeSelect
            value={draft.cadence}
            onChange={(event) => {
              patch({ cadence: event.target.value as CountCadence });
            }}
          >
            {CADENCES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </label>

        {draft.cadence === 'custom' ? (
          <label className="flex flex-col gap-1">
            <span className="text-base">Days between counts</span>
            <Input
              type="number"
              min={1}
              max={3650}
              className="max-w-32"
              value={String(draft.intervalDays)}
              onChange={(event) => {
                patch({ intervalDays: Math.max(1, Number(event.target.value) || 1) });
              }}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-base">How many items per count</span>
          <Input
            type="number"
            min={1}
            max={500}
            className="max-w-32"
            value={String(draft.maxItemsPerRun)}
            onChange={(event) => {
              patch({ maxItemsPerRun: Math.max(1, Number(event.target.value) || 1) });
            }}
          />
          <span className="text-sm">
            A count of four hundred lines does not get done. Each run takes the{' '}
            {plural(draft.maxItemsPerRun, 'item', 'items')} that have gone longest without being
            counted — anything never counted comes first of all — and the rest waits for next time.
          </span>
        </label>

        <div className="flex items-start gap-3">
          <Switch
            color="module"
            checked={draft.isBlind}
            aria-label="Hide the expected figure from whoever is counting"
            onCheckedChange={(checked) => {
              patch({ isBlind: checked });
            }}
          />
          <div className="flex flex-col">
            <Text>Hide the expected figure from whoever is counting</Text>
            <Text className="text-sm">
              On by default, and worth keeping on. A scheduled count exists to measure how accurate
              your stock figures are; showing the counter what to expect measures whether they agree
              with it instead.
            </Text>
          </div>
        </div>

        {!isNew ? (
          <div className="flex items-start gap-3">
            <Switch
              color="module"
              checked={draft.isActive}
              aria-label="Keep this schedule running"
              onCheckedChange={(checked) => {
                patch({ isActive: checked });
              }}
            />
            <div className="flex flex-col">
              <Text>Keep this schedule running</Text>
              <Text className="text-sm">
                Pausing stops new counts appearing. It resumes on a sensible date rather than firing
                every count it missed.
              </Text>
            </div>
          </div>
        ) : null}
      </Card>

      {existing.data ? (
        <Card className="flex flex-col gap-1 p-4">
          <Heading level={3} className="text-base">
            <Icon
              glyph={faCalendarClock}
              className="mr-1 inline size-4 align-text-bottom"
              aria-hidden
            />
            History
          </Heading>
          <Text className="text-sm">
            {cadenceLabel(existing.data.cadence, existing.data.intervalDays)} ·{' '}
            {plural(existing.data.coveredLevels, 'item', 'items')} currently covered
          </Text>
          <Text className="text-sm">
            Last run:{' '}
            {existing.data.lastRunAt ? (
              <Timestamp value={existing.data.lastRunAt} format="relative" />
            ) : (
              'never'
            )}
            {existing.data.lastCountNumber ? ` (count ${existing.data.lastCountNumber})` : ''}
          </Text>
          <Text className="text-sm">
            {/* A due date in the past under the words "Next run" reads as broken
                — a freshly created schedule is due immediately and announced
                itself as "7 seconds ago". Overdue is a state, not a timestamp. */}
            {isDue(existing.data.nextRunAt) ? (
              <>Next run: due now — it will be picked up on the next nightly pass.</>
            ) : (
              <>
                Next run: <Timestamp value={existing.data.nextRunAt} format="relative" />
              </>
            )}
          </Text>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button color="module" disabled={!canSave} loading={save.isPending} onClick={onSave}>
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          {isNew ? 'Set it up' : 'Save changes'}
        </Button>
        {!isNew ? (
          <Button
            className="ml-auto"
            variant="ghost"
            color="danger"
            loading={remove.isPending}
            onClick={() => {
              void onDelete();
            }}
          >
            <Icon glyph={faTrashCan} className="size-4" aria-hidden />
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
