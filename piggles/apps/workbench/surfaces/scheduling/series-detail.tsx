'use client';

// ONE REPEATING BOOKING — set up a pattern, then watch it and stop it.
//
// ── Create and manage are the SAME surface ───────────────────────────────
//
// `{id:'new'}` is the form that describes a pattern; `{id}` is the running
// pattern it becomes, replaced in place after it is set up. A pattern cannot be
// edited once it exists — every occurrence is derived from it, so changing it
// would have to unpick already-booked appointments — so the managed state is
// read-only plus the one thing you can do to a live pattern: stop it.
//
// ── Not a table of occurrences ───────────────────────────────────────────
//
// The occurrences it has created are one-line things — a date and a state — so
// they are a simple list of rows, each opening the real booking, not a second
// grid duplicating the Bookings surface.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
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
  Input,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { faCalendarRange, faFloppyDisk, faSquare } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { CustomerPicker } from './bookings-customer-picker';
import { SaveFailure } from '@/components/save-failure';
import {
  buildRrule,
  bookingStateMeta,
  bookingTypeLabel,
  formatWhen,
  fromLocalInputValue,
  humanizeRrule,
  isNotFound,
  schedulingErrorMessage,
  seriesStateMeta,
  useBookingSeries,
  useCancelSeries,
  useCreateSeries,
  useSchedulingServices,
  WEEKDAYS,
  type BookingSeriesDetail,
  type CustomerLite,
  type EndsMode,
  type Frequency,
  type RecurrenceDraft,
} from './bookings-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'DAILY', label: 'Every day' },
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'MONTHLY', label: 'Every month' },
];

/* ══════════════════════════════════════════════════════════════════════════
   THE RECURRENCE BUILDER
   ══════════════════════════════════════════════════════════════════════════ */

function RecurrenceFields({
  draft,
  onChange,
}: {
  draft: RecurrenceDraft;
  onChange: (next: RecurrenceDraft) => void;
}) {
  const set = <K extends keyof RecurrenceDraft>(key: K, value: RecurrenceDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const toggleDay = (code: string) => {
    onChange({
      ...draft,
      byDay: draft.byDay.includes(code)
        ? draft.byDay.filter((d) => d !== code)
        : [...draft.byDay, code],
    });
  };

  const unitWord = draft.freq === 'DAILY' ? 'days' : draft.freq === 'WEEKLY' ? 'weeks' : 'months';

  return (
    <>
      <div className="grid gap-4 @md:grid-cols-2">
        <Field>
          <FieldLabel>How often</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                color="module"
                aria-label="How often it repeats"
                value={draft.freq}
                onChange={(event) => {
                  set('freq', event.target.value as Frequency);
                }}
              >
                {FREQ_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            }
          />
        </Field>

        <Field>
          <FieldLabel>Repeat every</FieldLabel>
          <div className="flex items-center gap-2">
            <FieldControl
              render={
                <Input
                  color="module"
                  type="number"
                  min={1}
                  max={52}
                  className="max-w-20"
                  value={String(draft.interval)}
                  onChange={(event) => {
                    const n = Number.parseInt(event.target.value, 10);
                    set('interval', Number.isFinite(n) && n > 0 ? n : 1);
                  }}
                />
              }
            />
            <Text as="span" className="text-sm">
              {unitWord}
            </Text>
          </div>
          <FieldDescription>Set to 1 for every {unitWord.slice(0, -1)}.</FieldDescription>
        </Field>
      </div>

      {draft.freq === 'WEEKLY' ? (
        <Field>
          <FieldLabel>On these days</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const on = draft.byDay.includes(day.code);
              return (
                <Button
                  key={day.code}
                  type="button"
                  size="sm"
                  variant={on ? 'solid' : 'outline'}
                  color={on ? 'module' : 'neutral'}
                  onClick={() => {
                    toggleDay(day.code);
                  }}
                >
                  {day.short}
                </Button>
              );
            })}
          </div>
          <FieldDescription>Pick at least one day it lands on.</FieldDescription>
        </Field>
      ) : null}

      <Field>
        <FieldLabel>Ends</FieldLabel>
        <FieldControl
          render={
            <NativeSelect
              color="module"
              aria-label="When it ends"
              value={draft.ends}
              onChange={(event) => {
                set('ends', event.target.value as EndsMode);
              }}
            >
              <option value="never">Keeps going</option>
              <option value="count">After a set number</option>
              <option value="until">On a date</option>
            </NativeSelect>
          }
        />
      </Field>

      {draft.ends === 'count' ? (
        <Field>
          <FieldLabel>How many times</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="number"
                min={1}
                max={520}
                className="max-w-24"
                value={String(draft.count)}
                onChange={(event) => {
                  const n = Number.parseInt(event.target.value, 10);
                  set('count', Number.isFinite(n) && n > 0 ? n : 1);
                }}
              />
            }
          />
        </Field>
      ) : null}

      {draft.ends === 'until' ? (
        <Field>
          <FieldLabel>Last day it can happen</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="date"
                className="max-w-48"
                value={draft.until}
                onChange={(event) => {
                  set('until', event.target.value);
                }}
              />
            }
          />
        </Field>
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SET UP A NEW REPEATING BOOKING
   ══════════════════════════════════════════════════════════════════════════ */

const BLANK_RECURRENCE: RecurrenceDraft = {
  freq: 'WEEKLY',
  interval: 1,
  byDay: [],
  ends: 'count',
  count: 12,
  until: '',
};

function SeriesCreate({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateSeries();
  const services = useSchedulingServices('');

  const [serviceId, setServiceId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceDraft>(BLANK_RECURRENCE);

  useEffect(() => {
    ctx.setTitle('New repeating booking');
  }, [ctx]);

  const serviceList = services.data?.items ?? [];
  const chosenService = serviceList.find((s) => s.id === serviceId) ?? null;
  const startIso = fromLocalInputValue(startLocal);
  const rrule = buildRrule(recurrence);

  const changed =
    serviceId !== '' || startLocal !== '' || customer !== null || recurrence !== BLANK_RECURRENCE;
  const canSave =
    serviceId !== '' &&
    startIso !== null &&
    rrule !== null &&
    !create.isPending &&
    !create.isSuccess;

  useDirtySource(
    changed && !create.isSuccess,
    'This repeating booking has not been set up yet. Close anyway?'
  );

  const preview = rrule ? humanizeRrule(rrule) : null;

  const saveError = create.isError
    ? schedulingErrorMessage(create.error, 'Nothing was set up. Check the pattern and try again.')
    : null;

  const noServices = services.isSuccess && serviceList.length === 0;

  const submit = () => {
    if (!canSave || !startIso || !rrule) return;
    create.mutate(
      {
        serviceId,
        startAt: startIso,
        rrule,
        ...(customer ? { customerId: customer.id } : {}),
        resourceIds: [],
      },
      {
        onSuccess: (result) => {
          ctx.open('scheduling.series.detail', { id: result.series.id }, { target: 'replace' });
          const madeCount = result.created.length;
          const skippedCount = result.skipped.length;
          afterPaneChange(() => {
            toast.add({
              title: 'Repeating booking set up',
              description:
                skippedCount > 0
                  ? `${String(madeCount)} booked, ${String(skippedCount)} skipped where the time was already taken.`
                  : `${String(madeCount)} booking${madeCount === 1 ? '' : 's'} created.`,
              type: 'success',
            });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New repeating booking actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={create.isPending}
            onClick={submit}
          >
            <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
            Set it up
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <SaveFailure title="Could not set this up" message={saveError} />

          {noServices ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>Set up something to book first</AlertTitle>
                <AlertDescription>
                  A repeating booking creates appointments for one of your services. Add a service
                  first, then come back here.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="info"
                variant="soft"
                onClick={() => {
                  ctx.open('scheduling.services.list');
                }}
              >
                Set up a service
              </Button>
            </Alert>
          ) : null}

          <FormSection
            title="What repeats, and from when"
            description="Choose the service and the first time it happens. Everything after is worked out from the pattern below."
          >
            <Field>
              <FieldLabel>What is being booked</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    color="module"
                    aria-label="What is being booked"
                    value={serviceId}
                    disabled={services.isLoading || noServices}
                    onChange={(event) => {
                      setServiceId(event.target.value);
                    }}
                  >
                    <option value="">Choose a service…</option>
                    {serviceList.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              {chosenService ? (
                <FieldDescription>
                  {bookingTypeLabel(chosenService.bookingType)} · {chosenService.durationMinutes}{' '}
                  minutes each
                </FieldDescription>
              ) : null}
            </Field>

            <Field>
              <FieldLabel>First one starts</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="datetime-local"
                    className="max-w-xs"
                    value={startLocal}
                    onChange={(event) => {
                      setStartLocal(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                The day and time of the first occurrence, in your own time zone.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="The pattern" description="How often it repeats and when it stops.">
            <RecurrenceFields draft={recurrence} onChange={setRecurrence} />
            {preview ? (
              <Alert color="info">
                <AlertContent>
                  <AlertDescription>{preview}.</AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <Text className="text-sm">
                {recurrence.freq === 'WEEKLY' && recurrence.byDay.length === 0
                  ? 'Pick at least one day of the week for the pattern.'
                  : 'Finish the pattern to see it in words.'}
              </Text>
            )}
          </FormSection>

          <FormSection
            title="Who it is for (optional)"
            description="Link a customer if every occurrence is for the same person — a standing weekly slot for one client. Leave blank otherwise."
          >
            <CustomerPicker value={customer} onChange={setCustomer} />
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MANAGE A RUNNING PATTERN
   ══════════════════════════════════════════════════════════════════════════ */

function SeriesManage({
  ctx,
  series,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  series: BookingSeriesDetail;
  isFetching: boolean;
  updatedAt: number | undefined;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const cancel = useCancelSeries(series.id);

  const meta = seriesStateMeta(series.status);
  const stoppable = series.status === 'active';

  useEffect(() => {
    ctx.setTitle(series.serviceName ?? 'Repeating booking');
  }, [ctx, series.serviceName]);

  // Newest-first for the list an owner scans — what is coming next sits at the top.
  const occurrences = useMemo(
    () => [...series.bookings].sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [series.bookings]
  );

  const openOccurrence = (id: string) => {
    ctx.open('scheduling.bookings.detail', { id }, { target: 'beside' });
  };

  const onStop = async (scope: 'future' | 'all') => {
    const ok = await confirmDialog({
      title:
        scope === 'all' ? 'Stop and cancel every upcoming one?' : 'Stop this repeating booking?',
      description:
        scope === 'all'
          ? 'This stops the pattern and cancels every occurrence still to come, including ones already in progress. Past and completed ones are kept. Customers are told. This cannot be undone.'
          : 'This stops the pattern from creating any more, and cancels the ones not yet started. Anything already under way or completed is kept. This cannot be undone.',
      confirmLabel: scope === 'all' ? 'Stop and cancel all' : 'Stop it',
      cancelLabel: 'Keep it running',
      color: 'danger',
    });
    if (!ok) return;
    cancel.mutate(
      { scope },
      {
        onSuccess: (result) => {
          toast.add({
            title: 'Repeating booking stopped',
            description:
              result.cancelled > 0
                ? `${String(result.cancelled)} upcoming booking${result.cancelled === 1 ? '' : 's'} cancelled.`
                : undefined,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not stop it',
            description: schedulingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Repeating booking actions"
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
        }
        status={
          <Badge color={meta.tone} variant="soft" size="sm">
            {meta.label}
          </Badge>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Text className="text-base">{humanizeRrule(series.rrule)}.</Text>
            <Text className="text-sm">
              {series.totalBookings} booking{series.totalBookings === 1 ? '' : 's'} in all ·{' '}
              {series.upcomingBookings} still to come
            </Text>
          </div>

          <FormSection title="The bookings it has made">
            {occurrences.length === 0 ? (
              <Text className="text-sm">
                No occurrences yet. The next ones are created automatically as the date approaches.
              </Text>
            ) : (
              <div className="border-base-300 flex flex-col overflow-hidden rounded-md border">
                {occurrences.map((occurrence, index) => {
                  const oMeta = bookingStateMeta(occurrence.status);
                  return (
                    <button
                      key={occurrence.id}
                      type="button"
                      className={`hover:bg-base-200 flex items-center gap-3 px-3 py-2 text-left ${index > 0 ? 'border-base-200 border-t' : ''}`}
                      onClick={() => {
                        openOccurrence(occurrence.id);
                      }}
                    >
                      <Icon glyph={faCalendarRange} className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 font-medium">
                        {formatWhen(occurrence.startAt)}
                      </span>
                      <Badge color={oMeta.tone} variant="soft" size="sm">
                        {oMeta.label}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </FormSection>

          {/* Stopping is the only change you can make to a live pattern, and it is
              irreversible — so it sits after the record, under a divider. */}
          {stoppable ? (
            <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
              <Text className="text-sm">
                Stopping ends the pattern. Choose whether to keep the appointments already booked
                ahead, or cancel those too.
              </Text>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  disabled={cancel.isPending}
                  onClick={() => {
                    void onStop('future');
                  }}
                >
                  <Icon glyph={faSquare} className="size-4" aria-hidden />
                  Stop making new ones
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  disabled={cancel.isPending}
                  onClick={() => {
                    void onStop('all');
                  }}
                >
                  Stop and cancel upcoming
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PANE
   ══════════════════════════════════════════════════════════════════════════ */

export function SeriesDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const series = useBookingSeries(id);

  if (id === 'new') {
    return <SeriesCreate ctx={ctx} />;
  }

  if (series.isError) {
    const gone = isNotFound(series.error);
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            reason={gone ? 'missing' : 'unreachable'}
            title={gone ? 'This repeating booking no longer exists' : 'Could not load this'}
            description={
              gone
                ? 'It may have been removed. Any bookings it already made are unaffected.'
                : 'This is a problem reaching the server. Nothing has changed.'
            }
            onRetry={() => {
              void series.refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (series.isPending || !series.data) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  return (
    <SeriesManage
      key={series.data.id}
      ctx={ctx}
      series={series.data}
      isFetching={series.isFetching}
      updatedAt={series.dataUpdatedAt}
      onRefresh={() => {
        void series.refetch();
      }}
    />
  );
}

export default SeriesDetailSurface;
