'use client';

// AVAILABILITY — the hours you can be booked, and the days you cannot.
//
// Two things live here, because to an owner they are one question: "when am I
// free?". The WEEKLY HOURS are the normal pattern — the same every week, set per
// person or place, because a booking is only offered when the thing it needs is
// within its hours. The CLOSURES are the one-off exceptions on top: a holiday, a
// day off, a shutdown, which override the weekly pattern for a date or a range.
//
// The weekly hours are an explicit-save editor, like every other editor in the
// app: one Save in the toolbar, edits register as unsaved work so switching away
// asks first, and the whole week is written at once (the server replaces it
// wholesale). Closures are added and removed one at a time — each is its own
// small commit, so they take effect the moment you add them.

import { useEffect, useMemo, useState } from 'react';
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
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { CalendarOff, Clock, Plus, Trash2, Users, X } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  WEEK_DAYS,
  customHoursOf,
  minutesToClock,
  minutesToTime,
  resourceKindLabel,
  schedulingErrorMessage,
  timeToMinutes,
  useCreateException,
  useDeleteException,
  useExceptions,
  useResourceWindows,
  useResources,
  useSetResourceWindows,
  type AvailabilityException,
  type AvailabilityWindow,
  type AvailabilityWindowInput,
} from './setup-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

interface TimeWindow {
  start: string;
  end: string;
}
type WeekDraft = Record<number, TimeWindow[]>;

const DEFAULT_WINDOW: TimeWindow = { start: '09:00', end: '17:00' };

function emptyWeek(): WeekDraft {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function weekFrom(windows: AvailabilityWindow[]): WeekDraft {
  const week = emptyWeek();
  for (const window of windows) {
    week[window.dayOfWeek] = [
      ...(week[window.dayOfWeek] ?? []),
      { start: minutesToTime(window.startMinute), end: minutesToTime(window.endMinute) },
    ];
  }
  for (let day = 0; day <= 6; day += 1) {
    week[day]?.sort((a, b) => a.start.localeCompare(b.start));
  }
  return week;
}

/** True when every window has a valid start and an end after it. */
function weekValid(week: WeekDraft): boolean {
  for (let day = 0; day <= 6; day += 1) {
    for (const window of week[day] ?? []) {
      const start = timeToMinutes(window.start);
      const end = timeToMinutes(window.end);
      if (start === null || end === null || end <= start) return false;
    }
  }
  return true;
}

function weekToWindows(week: WeekDraft): AvailabilityWindowInput[] {
  const out: AvailabilityWindowInput[] = [];
  for (let day = 0; day <= 6; day += 1) {
    for (const window of week[day] ?? []) {
      const start = timeToMinutes(window.start);
      const end = timeToMinutes(window.end);
      if (start === null || end === null || end <= start) continue;
      out.push({ dayOfWeek: day, startMinute: start, endMinute: end });
    }
  }
  return out;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** An exception's own words, or a fallback when it was left unnamed. Empty text
 *  should reach the fallback, which is why this is a ternary, not `??`. */
function exceptionReason(exception: AvailabilityException, fallback: string): string {
  const reason = exception.reason?.trim();
  if (reason !== undefined && reason !== '') return reason;
  return fallback;
}

/** An exception's date range in plain words — a single day when it is one. */
function exceptionRange(exception: AvailabilityException): string {
  const start = new Date(exception.startAt);
  const end = new Date(exception.endAt);
  const startDay = DATE_FMT.format(start);
  const endDay = DATE_FMT.format(end);
  return startDay === endDay ? startDay : `${startDay} – ${endDay}`;
}

/* ── The weekly-hours editor (one resource) ─────────────────────────────── */

function WeeklyHours({ week, onChange }: { week: WeekDraft; onChange: (next: WeekDraft) => void }) {
  const setDay = (day: number, windows: TimeWindow[]) => {
    onChange({ ...week, [day]: windows });
  };

  return (
    <div className="divide-base-300 flex flex-col divide-y">
      {WEEK_DAYS.map((day) => {
        const windows = week[day.value] ?? [];
        const open = windows.length > 0;
        return (
          <div key={day.value} className="flex flex-col gap-2 py-3 @lg:flex-row @lg:gap-4">
            <div className="flex items-center gap-3 @lg:w-44 @lg:pt-1.5">
              <Switch
                color="module"
                checked={open}
                aria-label={`${day.label} — open for bookings`}
                onCheckedChange={(next: boolean) => {
                  setDay(day.value, next ? [{ ...DEFAULT_WINDOW }] : []);
                }}
              />
              <Text as="span" className="font-medium">
                {day.label}
              </Text>
            </div>

            <div className="min-w-0 flex-1">
              {open ? (
                <div className="flex flex-col gap-2">
                  {windows.map((window, index) => {
                    const start = timeToMinutes(window.start);
                    const end = timeToMinutes(window.end);
                    const invalid = start === null || end === null || end <= start;
                    return (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          color={invalid ? 'error' : 'module'}
                          className="max-w-32 tabular-nums"
                          aria-label={`${day.label} — start of hours ${String(index + 1)}`}
                          value={window.start}
                          onChange={(event) => {
                            setDay(
                              day.value,
                              windows.map((w, i) =>
                                i === index ? { ...w, start: event.target.value } : w
                              )
                            );
                          }}
                        />
                        <Text as="span" className="text-sm">
                          to
                        </Text>
                        <Input
                          type="time"
                          color={invalid ? 'error' : 'module'}
                          className="max-w-32 tabular-nums"
                          aria-label={`${day.label} — end of hours ${String(index + 1)}`}
                          value={window.end}
                          onChange={(event) => {
                            setDay(
                              day.value,
                              windows.map((w, i) =>
                                i === index ? { ...w, end: event.target.value } : w
                              )
                            );
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          color="neutral"
                          shape="square"
                          aria-label={`Remove these hours on ${day.label}`}
                          onClick={() => {
                            const next = windows.filter((_, i) => i !== index);
                            setDay(day.value, next);
                          }}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </div>
                    );
                  })}
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      color="module"
                      onClick={() => {
                        setDay(day.value, [...windows, { ...DEFAULT_WINDOW }]);
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      Add another block
                    </Button>
                  </div>
                </div>
              ) : (
                <Text className="text-sm @lg:pt-1.5">Closed</Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Closures & time off ────────────────────────────────────────────────── */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Closures({
  resourceId,
  resourceName,
  exceptions,
}: {
  resourceId: string;
  resourceName: string;
  exceptions: AvailabilityException[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateException();
  const remove = useDeleteException();

  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<'everyone' | 'resource'>('everyone');
  // What happens on these dates: shut all day, or open with special hours.
  const [kind, setKind] = useState<'closed' | 'custom_hours'>('closed');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('13:00');

  // The exceptions that touch the chosen resource: the business-wide ones (which
  // apply to everybody) plus this resource's own. Another resource's day off is
  // not this resource's concern, so it is left out.
  const relevant = useMemo(
    () =>
      exceptions
        .filter((exception) => exception.resourceId === null || exception.resourceId === resourceId)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [exceptions, resourceId]
  );

  const rangeValid = from !== '' && to !== '' && to >= from;
  const openMin = timeToMinutes(openTime);
  const closeMin = timeToMinutes(closeTime);
  // Special hours need an open and a close, with the close later than the open.
  const hoursValid =
    kind === 'closed' || (openMin !== null && closeMin !== null && closeMin > openMin);
  const canAdd = rangeValid && hoursValid;

  const add = () => {
    if (!canAdd) return;
    // An exception covers whole days: local midnight to the end of the last day.
    // For special hours, the meta says which part of each of those days is open.
    const startAt = new Date(`${from}T00:00:00`).toISOString();
    const endAt = new Date(`${to}T23:59:59`).toISOString();
    const customHours = kind === 'custom_hours' && openMin !== null && closeMin !== null;
    create.mutate(
      {
        kind,
        startAt,
        endAt,
        resourceId: scope === 'resource' ? resourceId : null,
        reason: reason.trim() === '' ? null : reason.trim(),
        ...(customHours ? { meta: { startMinute: openMin, endMinute: closeMin } } : {}),
      },
      {
        onSuccess: () => {
          setReason('');
          setFrom(todayIso());
          setTo(todayIso());
          toast.add({
            title: kind === 'custom_hours' ? 'Special hours added' : 'Closure added',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title:
              kind === 'custom_hours' ? 'Could not add these hours' : 'Could not add this closure',
            description: schedulingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async (exception: AvailabilityException) => {
    const label = exceptionReason(exception, exceptionRange(exception));
    const ok = await confirm({
      title: `Remove “${label}”?`,
      description: 'Bookings will be offered on these dates again, subject to the weekly hours.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(exception.id, {
      onError: (error) => {
        toast.add({
          title: 'Could not remove this closure',
          description: schedulingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const customHours = kind === 'custom_hours';
  const dateLabel = customHours ? 'day' : 'day closed';

  return (
    <FormSection
      title="Closures & special hours"
      description="Days that break the weekly pattern — a holiday you are shut, a day off, or a date you open different hours (say Christmas Eve, 9am–1pm). These win over the weekly hours above for the dates they cover."
    >
      {relevant.length > 0 ? (
        <div className="divide-base-300 flex flex-col divide-y">
          {relevant.map((exception) => {
            const hours = customHoursOf(exception);
            const Icon = hours ? Clock : CalendarOff;
            const title = exceptionReason(exception, hours ? 'Special hours' : 'Closed');
            const detail = hours
              ? `${exceptionRange(exception)} · ${minutesToClock(hours.startMinute)} – ${minutesToClock(hours.endMinute)}`
              : exceptionRange(exception);
            return (
              <div key={exception.id} className="flex items-center gap-3 py-2">
                <Icon className="size-4 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Text as="span" className="truncate font-medium">
                    {title}
                  </Text>
                  <Text as="span" className="text-sm">
                    {detail}
                  </Text>
                </div>
                <Badge
                  color={exception.resourceId === null ? 'info' : 'neutral'}
                  variant="soft"
                  size="sm"
                >
                  {exception.resourceId === null ? 'Everyone' : resourceName}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  shape="square"
                  aria-label={`Remove ${exceptionReason(exception, hours ? 'these special hours' : 'this closure')}`}
                  onClick={() => {
                    void onDelete(exception);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <Text className="text-sm">
          Nothing set yet. Add a holiday you are shut, a day off, or a date with special hours
          below.
        </Text>
      )}

      {/* Add-an-exception form. It commits straight to the server, so it lives
          inline rather than as a separate pane — there is nothing to return to and
          manage, only to add or remove. */}
      <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3">
        <Field>
          <FieldLabel>What happens</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                className="max-w-sm"
                value={kind}
                aria-label="What happens on these dates"
                onChange={(event) => {
                  setKind(event.target.value as 'closed' | 'custom_hours');
                }}
              >
                <option value="closed">Closed all day</option>
                <option value="custom_hours">Open, but with special hours</option>
              </NativeSelect>
            }
          />
        </Field>

        {customHours ? (
          <div className="grid gap-3 @md:grid-cols-2">
            <Field>
              <FieldLabel>Opens</FieldLabel>
              <FieldControl
                render={
                  <Input
                    type="time"
                    color={hoursValid ? 'module' : 'error'}
                    className="max-w-32 tabular-nums"
                    aria-label="Opening time on these dates"
                    value={openTime}
                    onChange={(event) => {
                      setOpenTime(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Closes</FieldLabel>
              <FieldControl
                render={
                  <Input
                    type="time"
                    color={hoursValid ? 'module' : 'error'}
                    className="max-w-32 tabular-nums"
                    aria-label="Closing time on these dates"
                    value={closeTime}
                    onChange={(event) => {
                      setCloseTime(event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </div>
        ) : null}

        <Field>
          <FieldLabel>What is it (optional)</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={reason}
                placeholder={customHours ? 'Christmas Eve' : 'Public holiday'}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            }
          />
        </Field>

        <div className="grid gap-3 @md:grid-cols-2">
          <Field>
            <FieldLabel>First {dateLabel}</FieldLabel>
            <FieldControl
              render={
                <Input
                  type="date"
                  color={rangeValid ? 'module' : 'error'}
                  className="max-w-44"
                  aria-label={`First ${dateLabel}`}
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    if (to < event.target.value) setTo(event.target.value);
                  }}
                />
              }
            />
          </Field>
          <Field>
            <FieldLabel>Last {dateLabel}</FieldLabel>
            <FieldControl
              render={
                <Input
                  type="date"
                  color={rangeValid ? 'module' : 'error'}
                  className="max-w-44"
                  aria-label={`Last ${dateLabel}`}
                  value={to}
                  min={from}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                />
              }
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Who it affects</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                className="max-w-sm"
                value={scope}
                aria-label="Who this affects"
                onChange={(event) => {
                  setScope(event.target.value as 'everyone' | 'resource');
                }}
              >
                <option value="everyone">Everyone — the whole business</option>
                <option value="resource">Just {resourceName}</option>
              </NativeSelect>
            }
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            color="module"
            variant="soft"
            disabled={!canAdd}
            loading={create.isPending}
            onClick={add}
          >
            <Plus className="size-4" aria-hidden />
            {customHours ? 'Add special hours' : 'Add closure'}
          </Button>
          {!rangeValid ? (
            <Text className="text-sm">The last day cannot be before the first.</Text>
          ) : !hoursValid ? (
            <Text className="text-sm">The closing time must be later than the opening time.</Text>
          ) : null}
        </div>
      </div>
    </FormSection>
  );
}

/* ── The surface ────────────────────────────────────────────────────────── */

export function AvailabilitySurface({ ctx }: { ctx: SurfaceContext }) {
  const confirm = useConfirm();
  const toast = useToast();

  const resources = useResources({ activeOnly: false });
  const [resourceId, setResourceId] = useState<string | null>(null);

  useEffect(() => {
    ctx.setTitle('Availability');
  }, [ctx]);

  // Default to the first resource once they load; stay put after that.
  const resourceList = resources.data?.items ?? [];
  const firstResourceId = resourceList[0]?.id ?? null;
  useEffect(() => {
    if (resourceId === null && firstResourceId !== null) {
      setResourceId(firstResourceId);
    }
  }, [resourceId, firstResourceId]);

  const windowsQuery = useResourceWindows(resourceId);
  const exceptionsQuery = useExceptions();
  const save = useSetResourceWindows(resourceId ?? '');

  const loadedWeek = useMemo(
    () => (windowsQuery.data ? weekFrom(windowsQuery.data) : null),
    [windowsQuery.data]
  );

  const [draft, setDraft] = useState<WeekDraft>(emptyWeek);
  const [touched, setTouched] = useState(false);

  // Re-seed the draft from the server whenever a different resource's hours load,
  // unless the operator has edits in flight — the same shape as the settings
  // editor's touched-guard.
  useEffect(() => {
    setTouched(false);
  }, [resourceId]);
  useEffect(() => {
    if (!touched && loadedWeek) setDraft(loadedWeek);
  }, [loadedWeek, touched]);

  const setWeek = (next: WeekDraft) => {
    setTouched(true);
    setDraft(next);
  };

  const dirty = loadedWeek !== null && JSON.stringify(draft) !== JSON.stringify(loadedWeek);
  const valid = weekValid(draft);

  useDirtySource(dirty, 'Your weekly hours have unsaved changes. Close anyway?');

  const selected = resourceList.find((resource) => resource.id === resourceId) ?? null;
  const resourceName = selected?.name ?? 'this resource';

  const switchResource = async (nextId: string) => {
    if (nextId === resourceId) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Switch without saving?',
        description: `Your unsaved changes to ${resourceName}’s hours will be lost.`,
        confirmLabel: 'Discard and switch',
        cancelLabel: 'Stay here',
        color: 'danger',
      });
      if (!ok) return;
    }
    setResourceId(nextId);
  };

  const submit = () => {
    if (!dirty || !valid || !resourceId) return;
    save.mutate(weekToWindows(draft), {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: `${resourceName}’s hours saved`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save these hours',
          description: schedulingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const refreshAll = () => {
    void windowsQuery.refetch();
    void exceptionsQuery.refetch();
    void resources.refetch();
  };

  /* ── Gates: no resources, load failure ─────────────────────────────────── */

  const noResources = !resources.isPending && resourceList.length === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Availability actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!dirty || !valid}
            loading={save.isPending}
            onClick={submit}
          >
            {dirty && !valid ? 'Fix the times' : 'Save hours'}
          </Button>
        }
        controls={
          <>
            {resourceList.length > 0 ? (
              <NativeSelect
                size="sm"
                className="max-w-60 shrink"
                aria-label="Whose hours to set"
                value={resourceId ?? ''}
                onChange={(event) => {
                  void switchResource(event.target.value);
                }}
              >
                {resourceList.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name} · {resourceKindLabel(resource.kind)}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={windowsQuery.isFetching || exceptionsQuery.isFetching}
            updatedAt={windowsQuery.data ? windowsQuery.dataUpdatedAt : undefined}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="flex items-center gap-2 text-2xl font-semibold">
              <Clock className="size-5 shrink-0" aria-hidden />
              Availability
            </Heading>
            <Text className="text-sm">
              The hours each person or thing can be booked, and the days none of it is available.
            </Text>
          </div>

          <Body
            resources={resources.isError}
            resourcesPending={resources.isPending}
            noResources={noResources}
            windowsError={windowsQuery.isError}
            windowsPending={resourceId !== null && windowsQuery.isPending}
            onRetry={refreshAll}
          >
            <FormSection
              title="Weekly hours"
              description={`The hours ${resourceName} can be booked, the same every week. Switch a day off to close it; add more than one block for a lunch break or a split shift.`}
            >
              <WeeklyHours week={draft} onChange={setWeek} />
              {dirty && !valid ? (
                <Alert color="warning">
                  <AlertContent>
                    <AlertTitle>Some hours don’t add up</AlertTitle>
                    <AlertDescription>
                      Each block needs an end time later than its start. Fix the ones marked in red
                      before saving.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}
            </FormSection>

            {resourceId && exceptionsQuery.data ? (
              <Closures
                resourceId={resourceId}
                resourceName={selected?.name ?? 'this one'}
                exceptions={exceptionsQuery.data}
              />
            ) : null}
          </Body>
        </div>
      </div>
    </div>
  );
}

/** The gated middle: a load failure or an empty account replaces the editor
 *  rather than rendering an empty week beside a dead Save. */
function Body({
  resources,
  resourcesPending,
  noResources,
  windowsError,
  windowsPending,
  onRetry,
  children,
}: {
  resources: boolean;
  resourcesPending: boolean;
  noResources: boolean;
  windowsError: boolean;
  windowsPending: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (resourcesPending) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  if (resources) {
    return (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not load your people & equipment</AlertTitle>
          <AlertDescription>
            This is a problem reaching the server. Your hours are unaffected.
          </AlertDescription>
        </AlertContent>
        <Button size="sm" color="error" variant="soft" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    );
  }

  if (noResources) {
    return (
      <Card className="p-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <Users className="size-6" aria-hidden />
          <Heading level={2} className="text-lg font-semibold">
            Add someone or something first
          </Heading>
          <Text className="text-sm">
            Availability is set per person or thing. Add your staff, rooms or equipment under People
            &amp; equipment, then come back to set the hours each one can be booked.
          </Text>
        </div>
      </Card>
    );
  }

  if (windowsError) {
    return (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not load these hours</AlertTitle>
          <AlertDescription>
            This is a problem reaching the server. Nothing about the hours has changed.
          </AlertDescription>
        </AlertContent>
        <Button size="sm" color="error" variant="soft" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    );
  }

  if (windowsPending) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading hours…
      </p>
    );
  }

  return <>{children}</>;
}
