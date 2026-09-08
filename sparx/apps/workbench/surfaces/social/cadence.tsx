'use client';

// Cadence — the plan behind the posting, rather than any one post.
//
// Three things a business sets up once and then leans on:
//   · WHEN they intend to post ("Tuesdays at 9"), which draws the gaps on the calendar
//     and, if they want, fills itself from posts they're happy to run again;
//   · the HASHTAG blocks they'd otherwise retype every time;
//   · a way to bring in a MONTH of posts from the spreadsheet they already plan in.
//
// One surface rather than three, because they are one job: setting up the rhythm. It is a
// pane — everything here is durable configuration you come back to.
//
// The honest bit about auto-fill: it only ever touches slots someone deliberately marked,
// it never overwrites a real post, and with approval on, what it schedules still waits for
// a person. Those three sentences are in the UI, not just in this comment.

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
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarClock, Hash, Plus, Trash2, Upload } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useViewer } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { canApprove, canCompose, socialErrorMessage, useSocialOverview } from './data';
import {
  formatMinuteOfDay,
  localTimezone,
  timeInputToMinuteOfDay,
  useDeleteHashtagSet,
  useDeleteSlot,
  useHashtagSets,
  usePostingSlots,
  usePreviewImport,
  useRunImport,
  useSaveHashtagSet,
  useSaveSlot,
  WEEKDAY_NAMES,
  type HashtagSet,
  type ImportPreview,
  type PostingSlot,
} from './planning-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4 p-4';

/* ── One posting time ─────────────────────────────────────────────────────── */

function SlotRow({
  slot,
  destinationNames,
  canManage,
  onDelete,
  deleting,
}: {
  slot: PostingSlot;
  destinationNames: string[];
  canManage: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text as="span" className="font-medium">
          {WEEKDAY_NAMES[slot.weekday]}s at {formatMinuteOfDay(slot.minuteOfDay)}
        </Text>
        <Text className="text-sm">
          {destinationNames.length > 0 ? destinationNames.join(', ') : 'No accounts chosen'} ·{' '}
          {slot.timezone}
        </Text>
      </div>
      {slot.autoFill ? (
        <Badge color="module" variant="soft" size="sm">
          Fills itself
        </Badge>
      ) : (
        <Badge color="neutral" variant="soft" size="sm">
          Just a reminder
        </Badge>
      )}
      {canManage ? (
        <Button size="sm" variant="ghost" color="danger" loading={deleting} onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
          Remove
        </Button>
      ) : null}
    </div>
  );
}

/* ── Adding a posting time ────────────────────────────────────────────────── */

function AddSlot({
  destinations,
  onDone,
}: {
  destinations: { id: string; name: string }[];
  onDone: () => void;
}) {
  const toast = useToast();
  const save = useSaveSlot();
  const [weekday, setWeekday] = useState('2');
  const [time, setTime] = useState('09:00');
  const [autoFill, setAutoFill] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const minuteOfDay = timeInputToMinuteOfDay(time);
  const valid = minuteOfDay !== null && (!autoFill || picked.size > 0);

  const submit = () => {
    if (minuteOfDay === null) return;
    save.mutate(
      {
        weekday: Number(weekday),
        minuteOfDay,
        timezone: localTimezone(),
        targetIds: [...picked],
        autoFill,
      },
      {
        onSuccess: () => {
          toast.add({ title: 'Posting time added', type: 'success' });
          onDone();
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that time',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-0">
          <FieldLabel>Day</FieldLabel>
          <FieldControl
            render={
              <Select
                color="module"
                aria-label="Day of the week"
                value={weekday}
                items={Object.fromEntries(
                  WEEKDAY_NAMES.map((name, index) => [String(index), name])
                )}
                onValueChange={(next: unknown) => {
                  if (typeof next === 'string') setWeekday(next);
                }}
              />
            }
          />
        </Field>
        <Field className="min-w-0">
          <FieldLabel>Time</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="time"
                className="max-w-[9rem]"
                value={time}
                onChange={(event) => {
                  setTime(event.target.value);
                }}
              />
            }
          />
          <FieldDescription>Your local time ({localTimezone()}).</FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Which accounts</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {destinations.map((dest) => {
            const on = picked.has(dest.id);
            return (
              <button
                key={dest.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPicked((current) => {
                    const next = new Set(current);
                    if (next.has(dest.id)) next.delete(dest.id);
                    else next.add(dest.id);
                    return next;
                  });
                }}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  on ? 'border-module bg-module bg-soft' : 'border-base-300'
                }`}
              >
                {dest.name}
              </button>
            );
          })}
        </div>
        <FieldDescription>
          Only needed if this time should fill itself — a reminder-only slot can leave it blank.
        </FieldDescription>
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Text className="text-sm">
            Fill this time automatically from posts marked &ldquo;run this again&rdquo;. It never
            replaces something you already planned, and with approval on it still waits for you.
          </Text>
        </div>
        <Switch
          color="module"
          checked={autoFill}
          aria-label="Fill this time automatically"
          onCheckedChange={setAutoFill}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!valid}
          loading={save.isPending}
          onClick={submit}
        >
          Add this time
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── Hashtag sets ─────────────────────────────────────────────────────────── */

function HashtagSetRow({
  set,
  canManage,
  onDelete,
  deleting,
}: {
  set: HashtagSet;
  canManage: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="border-base-300 flex flex-wrap items-start gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Text as="span" className="font-medium">
          {set.name}
        </Text>
        <div className="flex flex-wrap gap-1">
          {set.tags.map((tag) => (
            <Badge key={tag} color="neutral" variant="soft" size="sm">
              #{tag}
            </Badge>
          ))}
        </div>
      </div>
      {canManage ? (
        <Button size="sm" variant="ghost" color="danger" loading={deleting} onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function AddHashtagSet({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const save = useSaveHashtagSet();
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');

  const tags = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const submit = () => {
    save.mutate(
      { name: name.trim(), tags },
      {
        onSuccess: () => {
          toast.add({ title: 'Hashtag set saved', type: 'success' });
          onDone();
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that set',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3">
      <Field>
        <FieldLabel>What to call it</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={name}
              placeholder="New arrivals"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          }
        />
      </Field>
      <Field>
        <FieldLabel>The hashtags</FieldLabel>
        <FieldControl
          render={
            <Textarea
              color="module"
              rows={2}
              value={raw}
              placeholder="#newarrival #instock #shoplocal"
              onChange={(event) => {
                setRaw(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          Separate them with spaces or commas — the # is optional, we tidy them up.
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!name.trim() || tags.length === 0}
          loading={save.isPending}
          onClick={submit}
        >
          Save this set
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── Import from a spreadsheet ────────────────────────────────────────────── */

function ImportPanel({ destinations }: { destinations: { id: string; name: string }[] }) {
  const toast = useToast();
  const preview = usePreviewImport();
  const run = useRunImport();
  const [csv, setCsv] = useState('');
  const [checked, setChecked] = useState<ImportPreview | null>(null);
  const [fallback, setFallback] = useState<Set<string>>(new Set());

  const check = () => {
    preview.mutate(csv, {
      onSuccess: (result) => {
        setChecked(result);
      },
      onError: (error) => {
        toast.add({
          title: 'Could not read that',
          description: socialErrorMessage(error, 'Nothing was imported.'),
          type: 'error',
        });
      },
    });
  };

  const doImport = () => {
    run.mutate(
      { csv, defaultTargetIds: [...fallback] },
      {
        onSuccess: (result) => {
          setCsv('');
          setChecked(null);
          toast.add({
            title:
              result.created === 1 ? '1 post imported' : `${String(result.created)} posts imported`,
            description:
              result.problems.length > 0
                ? `${String(result.problems.length)} row(s) were skipped — see the list.`
                : 'They are in your Posts list as drafts.',
            type: result.problems.length > 0 ? 'info' : 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not import that',
            description: socialErrorMessage(error, 'Nothing was imported.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Paste your spreadsheet</FieldLabel>
        <FieldControl
          render={
            <Textarea
              color="module"
              rows={6}
              value={csv}
              spellCheck={false}
              placeholder={'body,when,accounts\n"Open late tonight!",2026-08-01 17:00,My Page'}
              onChange={(event) => {
                setCsv(event.target.value);
                setChecked(null);
              }}
            />
          }
        />
        <FieldDescription>
          Copy the rows straight out of your spreadsheet. The first row names the columns: you need
          one called <strong>body</strong> for the post text, and you can add <strong>when</strong>{' '}
          for the date and time and <strong>accounts</strong> for where it goes (separate several
          with a semicolon).
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>If a row doesn&rsquo;t name any accounts, use</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {destinations.map((dest) => {
            const on = fallback.has(dest.id);
            return (
              <button
                key={dest.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setFallback((current) => {
                    const next = new Set(current);
                    if (next.has(dest.id)) next.delete(dest.id);
                    else next.add(dest.id);
                    return next;
                  });
                }}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  on ? 'border-module bg-module bg-soft' : 'border-base-300'
                }`}
              >
                {dest.name}
              </button>
            );
          })}
        </div>
      </Field>

      {checked ? (
        <Alert color={checked.problems.length > 0 ? 'warning' : 'success'} variant="soft">
          <AlertContent>
            <AlertTitle>
              {checked.rows.length === 1
                ? '1 post ready to import'
                : `${String(checked.rows.length)} posts ready to import`}
            </AlertTitle>
            <AlertDescription>
              {checked.problems.length === 0 ? (
                'Everything read cleanly.'
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {checked.problems.slice(0, 8).map((problem) => (
                    <li key={`${String(problem.line)}-${problem.message}`}>
                      Row {problem.line}: {problem.message}
                    </li>
                  ))}
                  {checked.problems.length > 8 ? (
                    <li>…and {checked.problems.length - 8} more.</li>
                  ) : null}
                </ul>
              )}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          color="module"
          disabled={csv.trim().length === 0}
          loading={preview.isPending}
          onClick={check}
        >
          Check it first
        </Button>
        <Button
          size="sm"
          color="module"
          disabled={!checked || checked.rows.length === 0}
          loading={run.isPending}
          onClick={doImport}
        >
          <Upload className="size-4" aria-hidden />
          Import these posts
        </Button>
      </div>
    </div>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function SocialCadenceSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewer = useViewer();
  const overview = useSocialOverview();
  const slots = usePostingSlots();
  const sets = useHashtagSets();
  const deleteSlot = useDeleteSlot();
  const deleteSet = useDeleteHashtagSet();

  const [addingSlot, setAddingSlot] = useState(false);
  const [addingSet, setAddingSet] = useState(false);

  const canManage = canCompose(viewer.data?.role);
  const isAdmin = canApprove(viewer.data?.role);

  useEffect(() => {
    ctx.setTitle('Cadence');
  }, [ctx]);

  const destinations = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    for (const connection of overview.data?.connections ?? []) {
      if (connection.status !== 'active') continue;
      for (const target of connection.targets) {
        if (target.enabled) out.push({ id: target.id, name: target.name });
      }
    }
    return out;
  }, [overview.data]);

  const nameById = useMemo(() => new Map(destinations.map((d) => [d.id, d.name])), [destinations]);

  const removeSlot = (slot: PostingSlot) => {
    void (async () => {
      const ok = await confirm({
        title: 'Remove this posting time?',
        description: `${WEEKDAY_NAMES[slot.weekday]}s at ${formatMinuteOfDay(slot.minuteOfDay)} will stop showing on your calendar, and nothing will be scheduled into it. Posts already scheduled are not affected.`,
        confirmLabel: 'Remove it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      deleteSlot.mutate(slot.id, {
        onSuccess: () => {
          toast.add({ title: 'Posting time removed', type: 'success' });
        },
      });
    })();
  };

  const removeSet = (set: HashtagSet) => {
    void (async () => {
      const ok = await confirm({
        title: `Remove "${set.name}"?`,
        description: `This set of ${String(set.tags.length)} hashtags goes for good. Posts you already sent keep the tags they went out with.`,
        confirmLabel: 'Remove it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      deleteSet.mutate(set.id, {
        onSuccess: () => {
          toast.add({ title: 'Hashtag set removed', type: 'success' });
        },
      });
    })();
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Cadence controls"
        controls={
          <>
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              Cadence
            </Heading>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Your posting rhythm
            </Heading>
            <Text>
              Set the times you mean to post, save the hashtags you use again and again, and bring
              in a whole month at once from a spreadsheet. The calendar draws your times as gaps
              waiting to be filled.
            </Text>
          </div>

          <FormSection
            title="When you post"
            description="These show on your calendar as the times you plan to post."
            action={
              canManage && !addingSlot ? (
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  onClick={() => {
                    setAddingSlot(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a time
                </Button>
              ) : undefined
            }
          >
            {addingSlot ? (
              <AddSlot
                destinations={destinations}
                onDone={() => {
                  setAddingSlot(false);
                }}
              />
            ) : null}
            {slots.isPending ? (
              <Text className="text-sm">Loading…</Text>
            ) : (slots.data ?? []).length === 0 && !addingSlot ? (
              <EmptyState
                size="sm"
                icon={<CalendarClock className="size-6" aria-hidden />}
                title="No posting times yet"
                description="Businesses that post on a rhythm get seen more than ones that post when they remember. Add the times you mean to post and the calendar will show you the gaps."
              />
            ) : (
              <div className="flex flex-col">
                {(slots.data ?? []).map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    destinationNames={slot.targetIds
                      .map((id) => nameById.get(id))
                      .filter((n): n is string => Boolean(n))}
                    canManage={canManage}
                    deleting={deleteSlot.isPending && deleteSlot.variables === slot.id}
                    onDelete={() => {
                      removeSlot(slot);
                    }}
                  />
                ))}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Saved hashtags"
            description="Drop a whole block into a post — or its first comment — in one click."
            action={
              canManage && !addingSet ? (
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  onClick={() => {
                    setAddingSet(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  New set
                </Button>
              ) : undefined
            }
          >
            {addingSet ? (
              <AddHashtagSet
                onDone={() => {
                  setAddingSet(false);
                }}
              />
            ) : null}
            {sets.isPending ? (
              <Text className="text-sm">Loading…</Text>
            ) : (sets.data ?? []).length === 0 && !addingSet ? (
              <EmptyState
                size="sm"
                icon={<Hash className="size-6" aria-hidden />}
                title="No saved hashtags yet"
                description="Save the tags you use every time so you stop retyping them — and stop getting one of them slightly wrong."
              />
            ) : (
              <div className="flex flex-col">
                {(sets.data ?? []).map((set) => (
                  <HashtagSetRow
                    key={set.id}
                    set={set}
                    canManage={canManage}
                    deleting={deleteSet.isPending && deleteSet.variables === set.id}
                    onDelete={() => {
                      removeSet(set);
                    }}
                  />
                ))}
              </div>
            )}
          </FormSection>

          {isAdmin ? (
            <FormSection
              title="Bring in a month at once"
              description="Already plan your posts in a spreadsheet? Paste it here."
            >
              <ImportPanel destinations={destinations} />
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SocialCadenceSurface;
