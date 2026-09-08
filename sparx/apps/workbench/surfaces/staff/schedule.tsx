'use client';

// SCHEDULE — who is on, by the week (docs/149 §5).
//
// NOTHING HERE REACHES THE LEDGER. Nobody is paid for a shift; they are paid for
// the time entry that happened during it. Keeping the two apart is the whole
// reason `staff_shifts` and `staff_time_entries` are different tables — every
// rota product eventually conflates "scheduled hours" and "paid hours", and the
// result is a labour figure nobody trusts. So this screen shows PLANNED time and
// never a cost.
//
// DRAFT IS A REAL STATE, not a half-saved one. A manager builds next week over
// several sittings and releases it in one act, so drafts render distinctly and
// "Publish the week" is a single button rather than a per-shift toggle.
//
// Approved time off sits on the grid alongside the shifts, because the question
// this screen answers is "who is available on Thursday", and a rota that omitted
// the person on holiday would answer it wrongly.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Send, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  staffErrorMessage,
  useDeleteShift,
  usePublishShifts,
  useSaveShift,
  useShifts,
  useStaffMembers,
  useTimeOff,
  type Shift,
} from './data';
import {
  formatMinutes,
  formatTime,
  shiftRange,
  shiftState,
  timeOffKindLabel,
  timeOffKindTone,
  toDateInput,
  weekRange,
} from './format';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The seven day keys of a Monday-start week. */
function weekDays(from: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) =>
    toDateInput(new Date(start.getTime() + index * 86_400_000))
  );
}

function dayKeyOf(iso: string): string {
  return iso.slice(0, 10);
}

function shiftMinutes(shift: Shift): number {
  return Math.max(
    0,
    Math.round((new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 60_000)
  );
}

/** `2026-03-02` + `08:00` → an ISO instant. Kept explicit rather than relying on
 *  `new Date('2026-03-02T08:00')`, which is parsed in LOCAL time by every engine
 *  and would silently move a shift for anyone not on UTC. */
function instant(day: string, time: string): string {
  return new Date(`${day}T${time}:00`).toISOString();
}

interface ShiftDialogState {
  id: string | null;
  staffMemberId: string;
  day: string;
  start: string;
  end: string;
  label: string;
}

export function ScheduleSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useState(() => weekRange(new Date()));
  const [editing, setEditing] = useState<ShiftDialogState | null>(null);

  const shifts = useShifts(range);
  const people = useStaffMembers({ status: 'active' });
  const timeOff = useTimeOff({ status: 'approved' });
  const saveShift = useSaveShift();
  const removeShift = useDeleteShift();
  const publish = usePublishShifts();

  const days = useMemo(() => weekDays(range.from), [range.from]);
  const loaded = shifts.data?.items;
  const items = useMemo(() => loaded ?? [], [loaded]);

  const byDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of items) {
      const key = dayKeyOf(shift.startsAt);
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [items]);

  /** Approved leave overlapping this week, so the rota shows who is away. */
  const awayByDay = useMemo(() => {
    const map = new Map<string, { id: string; name: string; kind: string }[]>();
    for (const request of timeOff.data?.items ?? []) {
      const start = new Date(request.startsAt).getTime();
      const end = new Date(request.endsAt).getTime();
      for (const day of days) {
        const at = new Date(`${day}T12:00:00.000Z`).getTime();
        if (at < start || at > end) continue;
        map.set(day, [
          ...(map.get(day) ?? []),
          {
            id: request.id,
            name: request.staffMemberName ?? 'Someone',
            kind: request.kind,
          },
        ]);
      }
    }
    return map;
  }, [timeOff.data?.items, days]);

  const drafts = items.filter((shift) => shift.status === 'draft');
  const plannedMinutes = items
    .filter((shift) => shift.status !== 'cancelled')
    .reduce((sum, shift) => sum + shiftMinutes(shift), 0);

  const doPublish = () => {
    if (drafts.length === 0) return;
    publish.mutate(
      drafts.map((shift) => shift.id),
      {
        onSuccess: (result) => {
          afterPaneChange(() => {
            toast.add({
              title:
                result.published === 1
                  ? '1 shift published'
                  : `${String(result.published)} shifts published`,
              description: 'The week is now the published rota.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not publish the week',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const doSave = () => {
    if (!editing || editing.staffMemberId === '') return;
    saveShift.mutate(
      {
        id: editing.id,
        staffMemberId: editing.staffMemberId,
        startsAt: instant(editing.day, editing.start),
        endsAt: instant(editing.day, editing.end),
        label: editing.label.trim() === '' ? null : editing.label.trim(),
      },
      {
        onSuccess: () => {
          setEditing(null);
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that shift',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const doDelete = async (shift: Shift) => {
    const ok = await confirm({
      title: 'Remove this shift?',
      description: `${shift.staffMemberName ?? 'This person'} comes off the rota for that slot. Any hours they actually worked are untouched.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    removeShift.mutate(shift.id, {
      onSuccess: () => {
        setEditing(null);
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove that shift',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const openNew = (day: string) => {
    setEditing({
      id: null,
      staffMemberId: people.data?.items[0]?.id ?? '',
      day,
      start: '09:00',
      end: '17:00',
      label: '',
    });
  };

  const openExisting = (shift: Shift) => {
    const start = new Date(shift.startsAt);
    const end = new Date(shift.endsAt);
    const hhmm = (date: Date) =>
      `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    setEditing({
      id: shift.id,
      staffMemberId: shift.staffMemberId,
      day: dayKeyOf(shift.startsAt),
      start: hhmm(start),
      end: hhmm(end),
      label: shift.label ?? '',
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Schedule controls"
        controls={
          <>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                aria-label="Previous week"
                onClick={() => {
                  setRange((current) => shiftRange(current, -1));
                }}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Text as="span" className="min-w-40 text-center text-sm font-medium">
                {new Date(`${range.from}T00:00:00.000Z`).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })}
                {' – '}
                {new Date(`${range.to}T00:00:00.000Z`).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                aria-label="Next week"
                onClick={() => {
                  setRange((current) => shiftRange(current, 1));
                }}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                setRange(weekRange(new Date()));
              }}
            >
              This week
            </Button>
            {drafts.length > 0 ? (
              <Button
                size="sm"
                color="module"
                className="ml-auto"
                loading={publish.isPending}
                onClick={doPublish}
              >
                <Send className="size-4" aria-hidden />
                Publish {String(drafts.length)} {drafts.length === 1 ? 'shift' : 'shifts'}
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={drafts.length > 0 ? undefined : 'ml-auto'}
            isFetching={shifts.isFetching}
            updatedAt={shifts.data ? shifts.dataUpdatedAt : undefined}
            onRefresh={() => {
              void shifts.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shifts.isError ? (
          <EmptyState
            icon={<CalendarDays className="size-6" aria-hidden />}
            title="Could not load the rota"
            description="The server could not be reached. Nothing on the schedule is affected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void shifts.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : (people.data?.items.length ?? 0) === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<CalendarDays className="size-6" aria-hidden />}
              title="Nobody to schedule yet"
              description="Add people to your team first, then you can build a week around them."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    ctx.open('staff.people', {});
                  }}
                >
                  Open the roster
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
              <Text className="text-sm">
                <span className="font-medium tabular-nums">{formatMinutes(plannedMinutes)}</span>{' '}
                rostered this week
              </Text>
              {drafts.length > 0 ? (
                <Text className="text-sm">
                  {drafts.length === 1 ? '1 shift' : `${String(drafts.length)} shifts`} not
                  published yet — the team cannot see them.
                </Text>
              ) : null}
            </div>

            <div className="grid gap-2 @2xl:grid-cols-7">
              {days.map((day, index) => {
                const dayShifts = (byDay.get(day) ?? []).sort((a, b) =>
                  a.startsAt.localeCompare(b.startsAt)
                );
                const away = awayByDay.get(day) ?? [];
                const label = new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, {
                  day: 'numeric',
                  timeZone: 'UTC',
                });
                return (
                  <Card key={day} className="flex min-h-40 flex-col gap-2 p-2">
                    <div className="flex items-baseline justify-between">
                      <Heading level={3} className="text-sm font-semibold">
                        {DAY_NAMES[index]} {label}
                      </Heading>
                      <Button
                        size="xs"
                        variant="ghost"
                        color="module"
                        aria-label={`Add a shift on ${DAY_NAMES[index] ?? day}`}
                        onClick={() => {
                          openNew(day);
                        }}
                      >
                        <Plus className="size-4" aria-hidden />
                      </Button>
                    </div>

                    {away.map((person) => (
                      <Badge
                        key={person.id}
                        color={timeOffKindTone(person.kind)}
                        variant="soft"
                        size="sm"
                        className="justify-start"
                      >
                        {person.name} · {timeOffKindLabel(person.kind).toLowerCase()}
                      </Badge>
                    ))}

                    {dayShifts.length === 0 && away.length === 0 ? (
                      <Text className="text-sm">Nobody on</Text>
                    ) : null}

                    {dayShifts.map((shift) => {
                      const state = shiftState(shift.status);
                      return (
                        <button
                          key={shift.id}
                          type="button"
                          className="border-base-300 rounded-field hover:border-module w-full border p-2 text-left"
                          onClick={() => {
                            openExisting(shift);
                          }}
                        >
                          <div className="truncate text-sm font-medium">
                            {shift.staffMemberName ?? 'Unassigned'}
                          </div>
                          <div className="text-sm tabular-nums">
                            {formatTime(shift.startsAt)} – {formatTime(shift.endsAt)}
                          </div>
                          {shift.label ? (
                            <div className="truncate text-sm">{shift.label}</div>
                          ) : null}
                          {shift.status !== 'published' ? (
                            <Badge color={state.tone} variant="soft" size="sm" className="mt-1">
                              {state.label}
                            </Badge>
                          ) : null}
                        </button>
                      );
                    })}
                  </Card>
                );
              })}
            </div>

            <p className="px-1 pb-2 text-xs">
              A shift is who you PLAN to have in. What they actually worked is a separate record —
              nobody is paid from this screen.
            </p>
          </div>
        )}
      </div>

      {/* A shift is four fields and seconds of work, there is no shift surface to
          return to, and the week behind it is exactly the context you need while
          filling it in — so this is one of the few places a dialog beats a pane
          (sparx/apps/workbench/CLAUDE.md). */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
          <DialogTitle>{editing?.id ? 'Change this shift' : 'Add a shift'}</DialogTitle>

          {editing ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
              <Field>
                <FieldLabel>Who</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      value={editing.staffMemberId}
                      onChange={(event) => {
                        setEditing({ ...editing, staffMemberId: event.target.value });
                      }}
                    >
                      {(people.data?.items ?? []).map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Day</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      type="date"
                      value={editing.day}
                      onChange={(event) => {
                        setEditing({ ...editing, day: event.target.value });
                      }}
                    />
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>Starts</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        type="time"
                        value={editing.start}
                        onChange={(event) => {
                          setEditing({ ...editing, start: event.target.value });
                        }}
                      />
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>Ends</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        type="time"
                        value={editing.end}
                        onChange={(event) => {
                          setEditing({ ...editing, end: event.target.value });
                        }}
                      />
                    }
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>What it is</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      placeholder="Open, Close, Bay 2, Front counter…"
                      value={editing.label}
                      onChange={(event) => {
                        setEditing({ ...editing, label: event.target.value });
                      }}
                    />
                  }
                />
              </Field>
            </div>
          ) : null}

          <DialogFooter>
            {editing?.id ? (
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                className="mr-auto"
                onClick={() => {
                  const shift = items.find((row) => row.id === editing.id);
                  if (shift) void doDelete(shift);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Remove
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" color="module" loading={saveShift.isPending} onClick={doSave}>
              {editing?.id ? 'Save' : 'Add it'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
