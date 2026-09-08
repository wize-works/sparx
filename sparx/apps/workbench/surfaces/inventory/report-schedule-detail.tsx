'use client';

// ONE STANDING INSTRUCTION — create or edit (docs/146 Phase 10.4).
//
// A pane, not a modal, because create and edit are the same form: `{id:'new'}`
// renders exactly what `{id}` renders, so there is one form rather than two that
// drift.
//
// ── What the form has to get right ───────────────────────────────────────
//
// The report picker is served from the API's registry rather than a list typed
// here — a report added to the platform must appear in this dropdown without
// anybody remembering to come and add it (that forgetting is precisely why the
// registry exists).
//
// The window question only appears for reports that HAVE a window. Asking "over
// what period?" about a valuation is a question with no answer, and a form that
// asks it teaches people the form does not know what it is doing.
//
// The delivery history is below the form rather than on another screen, because
// the question the form raises — did it actually go? — is answered by it.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Switch,
  Table,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Save, Send, Trash2 } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useConfirm } from '../../lib/confirm';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import {
  cadenceSentence,
  deliveryStatusLabel,
  deliveryStatusTone,
  useCreateReportSchedule,
  useDeleteReportSchedule,
  useReportCatalog,
  useReportSchedule,
  useRunReportSchedule,
  useUpdateReportSchedule,
  type ReportScheduleInput,
} from './reporting-data';

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'am' : 'pm'}`,
}));

const WINDOWS = [
  { days: 7, label: 'The last week' },
  { days: 30, label: 'The last month' },
  { days: 90, label: 'The last quarter' },
  { days: 365, label: 'The last year' },
];

interface FormState {
  reportKey: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  timezone: string;
  recipients: string;
  format: 'csv' | 'summary';
  days: number;
  warehouseId: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  reportKey: '',
  name: '',
  cadence: 'weekly',
  dayOfWeek: 1,
  dayOfMonth: 1,
  hour: 7,
  timezone: 'UTC',
  recipients: '',
  format: 'csv',
  days: 30,
  warehouseId: '',
  isActive: true,
};

function splitRecipients(raw: string): string[] {
  return raw
    .split(/[,\n;]+/)
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

export function ReportScheduleDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const catalog = useReportCatalog();
  const existing = useReportSchedule(id);
  const create = useCreateReportSchedule();
  const update = useUpdateReportSchedule(isNew ? '' : id);
  const remove = useDeleteReportSchedule();
  const run = useRunReportSchedule(isNew ? '' : id);
  const locations = useStockLocations();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);

  // Seed the form from the server ONCE the row arrives. Guarded on `dirty` so a
  // background refetch cannot throw away half-typed work.
  useEffect(() => {
    const row = existing.data;
    if (!row || dirty) return;
    setForm({
      reportKey: row.reportKey,
      name: row.name,
      cadence: row.cadence,
      dayOfWeek: row.dayOfWeek ?? 1,
      dayOfMonth: row.dayOfMonth ?? 1,
      hour: row.hour,
      timezone: row.timezone,
      recipients: row.recipients.join(', '),
      format: row.format,
      days: row.filters.days ?? 30,
      warehouseId: row.filters.warehouseId ?? '',
      isActive: row.isActive,
    });
  }, [existing.data, dirty]);

  const patch = (next: Partial<FormState>): void => {
    setForm((current) => ({ ...current, ...next }));
    setDirty(true);
  };

  const reports = catalog.data?.reports ?? [];
  const selected = reports.find((report) => report.key === form.reportKey);
  const recipients = splitRecipients(form.recipients);
  const canSave = form.reportKey !== '' && form.name.trim() !== '' && recipients.length > 0;

  const toInput = (): ReportScheduleInput => ({
    reportKey: form.reportKey,
    name: form.name.trim(),
    cadence: form.cadence,
    ...(form.cadence === 'weekly' ? { dayOfWeek: form.dayOfWeek } : {}),
    ...(form.cadence === 'monthly' ? { dayOfMonth: form.dayOfMonth } : {}),
    hour: form.hour,
    timezone: form.timezone,
    recipients,
    format: form.format,
    filters: {
      ...(selected?.windowed ? { days: form.days } : {}),
      ...(form.warehouseId ? { warehouseId: form.warehouseId } : {}),
    },
    isActive: form.isActive,
  });

  const save = (): void => {
    const input = toInput();
    const onFail = (error: unknown): void => {
      afterCommit(() => {
        toast.add({
          title: 'Could not save it',
          description: stockErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      });
    };
    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          setDirty(false);
          afterCommit(() => {
            toast.add({ title: `${created.name} will be sent`, type: 'success' });
          });
          ctx.open('inventory.reports.schedule', { id: created.id }, { target: 'replace' });
        },
        onError: onFail,
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setDirty(false);
        afterCommit(() => {
          toast.add({ title: 'Saved', type: 'success' });
        });
      },
      onError: onFail,
    });
  };

  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const saving = create.isPending || update.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Scheduled report actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!canSave || saving}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            {isNew ? 'Start sending it' : 'Save'}
          </Button>
        }
        controls={
          <>
            {!isNew && existing.data ? (
              <Badge
                color={
                  existing.data.pausedByFailures ? 'danger' : form.isActive ? 'success' : 'neutral'
                }
                variant="soft"
                size="sm"
              >
                {existing.data.pausedByFailures
                  ? 'Stopped after repeated failures'
                  : form.isActive
                    ? 'Sending'
                    : 'Switched off'}
              </Badge>
            ) : null}
            {!isNew ? (
              <>
                <Button
                  color="neutral"
                  variant="outline"
                  size="sm"
                  disabled={run.isPending}
                  onClick={() => {
                    run.mutate(undefined, {
                      onSuccess: (result) => {
                        afterCommit(() => {
                          toast.add({
                            title:
                              result.status === 'skipped'
                                ? 'Nothing to send'
                                : result.status === 'failed'
                                  ? 'Could not send it'
                                  : `Sent to ${plural(result.recipients, 'person', 'people')}`,
                            ...(result.error ? { description: result.error } : {}),
                            type:
                              result.status === 'failed'
                                ? 'error'
                                : result.status === 'skipped'
                                  ? 'info'
                                  : 'success',
                          });
                        });
                      },
                    });
                  }}
                >
                  <Send className="size-4" aria-hidden />
                  Send now
                </Button>
                <Button
                  color="danger"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: `Stop sending "${form.name}"?`,
                        description: `Nobody will receive this report again. The ${plural(
                          existing.data?.deliveries.length ?? 0,
                          'record',
                          'records'
                        )} of what was already sent will go with it.`,
                        confirmLabel: 'Delete it',
                        cancelLabel: 'Keep it',
                        color: 'danger',
                      });
                      if (!ok) return;
                      remove.mutate(id, {
                        onSuccess: () => {
                          afterCommit(() => {
                            toast.add({ title: 'Deleted', type: 'success' });
                          });
                          ctx.close();
                        },
                      });
                    })();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {existing.data?.pausedByFailures ? (
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertTitle>This stopped sending</AlertTitle>
                <AlertDescription>
                  It failed {existing.data.consecutiveFailures} times in a row, so it was paused
                  rather than left retrying into a mailbox that is not there. The history below says
                  what went wrong. Switching it back on clears the count.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection
            title="What gets sent"
            description="Pick the report and give this a name you will recognise in your inbox."
          >
            <Field>
              <FieldLabel>Report</FieldLabel>
              <NativeSelect
                color="module"
                value={form.reportKey}
                disabled={!isNew}
                onChange={(event) => {
                  const key = event.target.value;
                  const report = reports.find((r) => r.key === key);
                  patch({
                    reportKey: key,
                    ...(form.name.trim() === '' && report ? { name: report.label } : {}),
                  });
                }}
              >
                <option value="">Choose a report…</option>
                {reports.map((report) => (
                  <option key={report.key} value={report.key}>
                    {report.label}
                  </option>
                ))}
              </NativeSelect>
              {selected ? <Text className="text-sm">{selected.description}</Text> : null}
              {!isNew ? (
                <Text className="text-sm">
                  The report cannot be swapped after the fact — the delivery history below is about
                  this one. Make a new schedule for a different report.
                </Text>
              ) : null}
            </Field>

            <Field>
              <FieldLabel>Call it</FieldLabel>
              <Input
                color="module"
                value={form.name}
                placeholder="Monday morning stock check"
                onChange={(event) => {
                  patch({ name: event.target.value });
                }}
              />
              <Text className="text-sm">This is the subject line of the email.</Text>
            </Field>

            {selected?.windowed ? (
              <Field>
                <FieldLabel>Covering</FieldLabel>
                <NativeSelect
                  color="module"
                  value={String(form.days)}
                  onChange={(event) => {
                    patch({ days: Number(event.target.value) });
                  }}
                >
                  {WINDOWS.map((window) => (
                    <option key={window.days} value={window.days}>
                      {window.label}
                    </option>
                  ))}
                </NativeSelect>
                <Text className="text-sm">
                  Counted back from the day it is sent, so each delivery covers the period since the
                  last one rather than a fixed calendar span.
                </Text>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>Location</FieldLabel>
              <NativeSelect
                color="module"
                value={form.warehouseId}
                onChange={(event) => {
                  patch({ warehouseId: event.target.value });
                }}
              >
                <option value="">Every location</option>
                {activeLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FormSection>

          <FormSection
            title="When"
            description={`Sent ${cadenceSentence({
              cadence: form.cadence,
              dayOfWeek: form.dayOfWeek,
              dayOfMonth: form.dayOfMonth,
              hour: form.hour,
              timezone: form.timezone,
            }).toLowerCase()}.`}
          >
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel>How often</FieldLabel>
                <NativeSelect
                  color="module"
                  value={form.cadence}
                  onChange={(event) => {
                    patch({ cadence: event.target.value as FormState['cadence'] });
                  }}
                >
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </NativeSelect>
              </Field>

              {form.cadence === 'weekly' ? (
                <Field>
                  <FieldLabel>On</FieldLabel>
                  <NativeSelect
                    color="module"
                    value={String(form.dayOfWeek)}
                    onChange={(event) => {
                      patch({ dayOfWeek: Number(event.target.value) });
                    }}
                  >
                    {WEEKDAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}

              {form.cadence === 'monthly' ? (
                <Field>
                  <FieldLabel>On the</FieldLabel>
                  <NativeSelect
                    color="module"
                    value={String(form.dayOfMonth)}
                    onChange={(event) => {
                      patch({ dayOfMonth: Number(event.target.value) });
                    }}
                  >
                    {/* 1–28 only. The 29th, 30th and 31st would skip February,
                        and a monthly report that silently misses a month is
                        exactly what a schedule exists to prevent. */}
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}

              <Field>
                <FieldLabel>At</FieldLabel>
                <NativeSelect
                  color="module"
                  value={String(form.hour)}
                  onChange={(event) => {
                    patch({ hour: Number(event.target.value) });
                  }}
                >
                  {HOURS.map((hour) => (
                    <option key={hour.value} value={hour.value}>
                      {hour.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel>Time zone</FieldLabel>
              <Input
                color="module"
                value={form.timezone}
                placeholder="Europe/London"
                onChange={(event) => {
                  patch({ timezone: event.target.value });
                }}
              />
              <Text className="text-sm">
                The hour above is local to this zone, and it follows the clocks — a 7am report stays
                a 7am report through the summer.
              </Text>
            </Field>

            <Field>
              <FieldLabel>Sending</FieldLabel>
              <Switch
                color="module"
                checked={form.isActive}
                onCheckedChange={(checked) => {
                  patch({ isActive: checked });
                }}
              />
              <Text className="text-sm">
                Switch it off to pause without losing the setup or the history.
              </Text>
            </Field>
          </FormSection>

          <FormSection
            title="Who gets it"
            description="One address per line, or separated by commas. They do not need a sparx login."
          >
            <Field>
              <FieldLabel>Email addresses</FieldLabel>
              <Textarea
                color="module"
                rows={3}
                value={form.recipients}
                placeholder={'owner@example.com\naccountant@example.com'}
                onChange={(event) => {
                  patch({ recipients: event.target.value });
                }}
              />
              <Text className="text-sm">
                {recipients.length === 0
                  ? 'Nobody yet — a report with no recipient is not a schedule.'
                  : `${plural(recipients.length, 'person', 'people')} will get this.`}
              </Text>
            </Field>

            <Field>
              <FieldLabel>What lands in the inbox</FieldLabel>
              <NativeSelect
                color="module"
                value={form.format}
                onChange={(event) => {
                  patch({ format: event.target.value as FormState['format'] });
                }}
              >
                <option value="csv">The figures, with the spreadsheet attached</option>
                <option value="summary">Just the figures, nothing to download</option>
              </NativeSelect>
              <Text className="text-sm">
                Either way the headline numbers are in the body of the email, readable without
                opening anything.
              </Text>
            </Field>
          </FormSection>

          {!isNew && existing.data ? (
            <FormSection
              title="What has been sent"
              description="Every attempt, including the ones with nothing to say."
            >
              {existing.data.deliveries.length === 0 ? (
                <Text className="text-sm">
                  Nothing has gone out yet.{' '}
                  {existing.data.nextRunAt ? (
                    <>
                      The first one is due{' '}
                      <Timestamp value={existing.data.nextRunAt} format="relative" />.
                    </>
                  ) : (
                    'Switch it on to start.'
                  )}
                </Text>
              ) : (
                <Table size="sm">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Outcome</th>
                      <th className="hidden @md:table-cell">To</th>
                      <th className="text-right">Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existing.data.deliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td className="whitespace-nowrap">
                          <Timestamp value={delivery.sentAt} format="relative" />
                          {delivery.trigger === 'manual' ? (
                            <Badge color="neutral" variant="soft" size="sm" className="ml-2">
                              By hand
                            </Badge>
                          ) : null}
                        </td>
                        <td>
                          <span className="flex flex-col gap-0.5">
                            <Badge
                              color={deliveryStatusTone(delivery.status)}
                              variant="soft"
                              size="sm"
                            >
                              {deliveryStatusLabel(delivery.status)}
                            </Badge>
                            {delivery.error ? (
                              <Text className="text-sm">{delivery.error}</Text>
                            ) : null}
                          </span>
                        </td>
                        <td className="hidden max-w-48 truncate @md:table-cell">
                          {delivery.recipients.join(', ')}
                        </td>
                        <td className="text-right tabular-nums">{delivery.rowCount ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}
