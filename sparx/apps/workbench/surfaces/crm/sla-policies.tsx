'use client';

// Response times — what this business promises, and when it is open to keep it
// (docs/144 §7.3).
//
// ONE SURFACE, NOT A LIST AND A DETAIL. A business has one promise, or one per
// site; a list of them with an editor behind each would be two screens for
// something that fits on one, and the hours are the part people actually come
// here to change.
//
// THE HOURS ARE THE POINT, and are stated in the sentence that makes them make
// sense: "four hours" means four WORKING hours, so a message arriving at five in
// the afternoon is not late the next morning. That single fact is why this
// screen exists rather than a plain "reply within N hours" number field.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Combobox,
  Field,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Select,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Clock } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { timezoneOptions, type TimezoneOption } from '../../lib/timezones';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { api } from '../../lib/api/client';
import { useMutation, useQueryClient } from '@wizeworks/query';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  describeHours,
  priorityLabel,
  priorityTone,
  ticketErrorMessage,
  ticketKeys,
  useSlaPolicies,
  type SlaPolicy,
  type TicketPriority,
} from './tickets-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PRIORITIES: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];

/* ── minutes ⇄ HH:MM ────────────────────────────────────────────────────── */

function toHhMm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function fromHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 24 || mins > 59) return null;
  const total = hours * 60 + mins;
  return total > 1440 ? null : total;
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface DayDraft {
  open: boolean;
  from: string;
  to: string;
}

interface TargetDraft {
  firstResponse: string;
  resolution: string;
}

interface Draft {
  name: string;
  timezone: string;
  warnAtPercent: string;
  days: DayDraft[];
  targets: Record<TicketPriority, TargetDraft>;
}

function toDraft(policy: SlaPolicy): Draft {
  const days: DayDraft[] = DAYS.map((_, index) => {
    const window = policy.businessHours.find((w) => w.day === index);
    return window
      ? { open: true, from: toHhMm(window.startMinute), to: toHhMm(window.endMinute) }
      : { open: false, from: '09:00', to: '17:00' };
  });
  const targets = {} as Record<TicketPriority, TargetDraft>;
  for (const priority of PRIORITIES) {
    const target = policy.targets.find((t) => t.priority === priority);
    targets[priority] = {
      firstResponse: target?.firstResponseMinutes ? String(target.firstResponseMinutes) : '',
      resolution: target?.resolutionMinutes ? String(target.resolutionMinutes) : '',
    };
  }
  return {
    name: policy.name,
    timezone: policy.timezone,
    warnAtPercent: String(policy.warnAtPercent),
    days,
    targets,
  };
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function SlaPoliciesSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isError, refetch } = useSlaPolicies();
  // Memoised because the `?? []` would otherwise mint a new array every render,
  // which is enough to re-run the lookup below on every keystroke elsewhere in
  // the pane.
  const policies = useMemo(() => data?.items ?? [], [data]);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    ctx.setTitle('Response times');
  }, [ctx]);

  const policy = useMemo(
    () => policies.find((p) => p.id === selectedId) ?? policies[0],
    [policies, selectedId]
  );

  if (isError) {
    return (
      <PaneLoadError
        title="Could not load your response times"
        description="Something went wrong reaching the server. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  if (!policy) {
    return (
      <div className={PANE_SHELL}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            <Heading level={1} className="text-2xl font-semibold">
              No response times set up yet
            </Heading>
            <Text>
              A response time is your promise about how quickly you will get back to someone — and
              it is counted only during the hours you are open, so a message that arrives on a
              Sunday night is not late on Monday morning. One is created for you the first time a
              support request comes in.
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PolicyEditor key={policy.id} policy={policy} policies={policies} onSelect={setSelectedId} />
  );
}

function PolicyEditor({
  policy,
  policies,
  onSelect,
}: {
  policy: SlaPolicy;
  policies: SlaPolicy[];
  onSelect: (id: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<SlaPolicy>(`/v1/crm/sla-policies/${policy.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ticketKeys.policies });
      // Every open request's clock was measured against this. New promises only
      // apply from here on — but the queue re-reads so nobody is looking at a
      // screen that disagrees with what was just saved.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });

  const saved = useMemo(() => toDraft(policy), [policy]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  useDirtySource(dirty, 'Your response times have unsaved changes. Close anyway?');

  // The saved zone is passed in so a policy written before this was a picker —
  // or by the API, or by an older sparx — still finds its own value in the list
  // and shows a city rather than looking blank and inviting a re-pick.
  const zones = useMemo(() => timezoneOptions(draft.timezone || null), [draft.timezone]);
  const selectedZone = useMemo(
    () => zones.find((zone) => zone.value === draft.timezone) ?? null,
    [zones, draft.timezone]
  );

  const setDay = (index: number, patch: Partial<DayDraft>) => {
    setTouched(true);
    setDraft((cur) => ({
      ...cur,
      days: cur.days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  };

  const setTarget = (priority: TicketPriority, patch: Partial<TargetDraft>) => {
    setTouched(true);
    setDraft((cur) => ({
      ...cur,
      targets: { ...cur.targets, [priority]: { ...cur.targets[priority], ...patch } },
    }));
  };

  /* ── Validation ───────────────────────────────────────────────────────── */

  const badDay = draft.days.findIndex((d) => {
    if (!d.open) return false;
    const from = fromHhMm(d.from);
    const to = fromHhMm(d.to);
    return from === null || to === null || to <= from;
  });
  const dayError =
    badDay >= 0
      ? `${DAYS[badDay] ?? 'A day'} needs a closing time later than its opening time, both as HH:MM.`
      : null;

  const warn = Number(draft.warnAtPercent);
  const warnError =
    !Number.isInteger(warn) || warn < 1 || warn > 99
      ? 'The early warning has to be between 1 and 99 per cent.'
      : null;

  const blocked = dayError ?? warnError;

  /* ── Submit ───────────────────────────────────────────────────────────── */

  const submit = () => {
    if (blocked) return;
    const businessHours = draft.days.flatMap((d, index) => {
      if (!d.open) return [];
      const from = fromHhMm(d.from);
      const to = fromHhMm(d.to);
      if (from === null || to === null) return [];
      return [{ day: index, startMinute: from, endMinute: to }];
    });
    const targets = PRIORITIES.map((priority) => ({
      priority,
      // An empty box means "we make no promise at this level", which is a real
      // answer and different from zero — so it is sent as null, not dropped.
      firstResponseMinutes:
        draft.targets[priority].firstResponse.trim() === ''
          ? null
          : Number(draft.targets[priority].firstResponse),
      resolutionMinutes:
        draft.targets[priority].resolution.trim() === ''
          ? null
          : Number(draft.targets[priority].resolution),
    }));

    save.mutate(
      {
        name: draft.name.trim(),
        timezone: draft.timezone,
        warnAtPercent: warn,
        businessHours,
        targets,
      },
      {
        onSuccess: () => {
          setTouched(false);
          toast.add({ title: 'Response times saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save your response times',
            description: ticketErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const policyItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const p of policies) items[p.id] = p.name;
    return items;
  }, [policies]);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Response time actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={save.isPending}
            disabled={Boolean(blocked) || !dirty}
            onClick={submit}
          >
            Save
          </Button>
        }
        controls={
          <>
            {policy.isDefault ? (
              <Badge color="module" variant="soft" size="sm">
                Used by default
              </Badge>
            ) : null}
            {policies.length > 1 ? (
              <div className="w-52">
                <Select
                  color="module"
                  size="sm"
                  aria-label="Which set of response times"
                  value={policy.id}
                  items={policyItems}
                  onValueChange={(next) => {
                    onSelect(next as string);
                  }}
                />
              </div>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Response times
            </Heading>
            <Text>
              How quickly you promise to get back to someone, and when you are open to do it. The
              clock only runs during your opening hours — so if you promise a reply within four
              hours and a message arrives at half past four in the afternoon, it is due at half past
              nine the next morning, not overnight.
            </Text>
          </div>

          <Alert color="info">
            <AlertContent>
              <AlertTitle>Right now</AlertTitle>
              <AlertDescription>{describeHours(policy)}</AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection title="What to call it">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                color="module"
                value={draft.name}
                onChange={(event) => {
                  setTouched(true);
                  setDraft((cur) => ({ ...cur, name: event.target.value }));
                }}
              />
            </Field>
          </FormSection>

          <FormSection
            title="When you are open"
            description="Untick a day to say you are shut. Tick every day and set 00:00 to 24:00 if you answer around the clock."
          >
            {dayError ? (
              <Alert color="error">
                <AlertContent>
                  <AlertDescription>{dayError}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            <Card className="p-0">
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="w-28">Open</th>
                    <th className="w-32">From</th>
                    <th className="w-32">To</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.days.map((day, index) => (
                    <tr key={DAYS[index]}>
                      <td className="font-medium">{DAYS[index]}</td>
                      <td>
                        <Checkbox
                          color="module"
                          aria-label={`Open on ${DAYS[index] ?? 'this day'}`}
                          checked={day.open}
                          onChange={(event) => {
                            setDay(index, { open: event.target.checked });
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          size="sm"
                          color="module"
                          type="time"
                          aria-label={`Opening time on ${DAYS[index] ?? 'this day'}`}
                          disabled={!day.open}
                          value={day.from}
                          onChange={(event) => {
                            setDay(index, { from: event.target.value });
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          size="sm"
                          color="module"
                          type="time"
                          aria-label={`Closing time on ${DAYS[index] ?? 'this day'}`}
                          disabled={!day.open}
                          value={day.to}
                          onChange={(event) => {
                            setDay(index, { to: event.target.value });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            {/* A PICKER, NOT A TEXT BOX. "America/Denver" is a developer's
                spelling of a place, and everything downstream formats through
                `Intl`, which takes canonical IANA identifiers and nothing else —
                so a typed "Mountain Time" or "MST" is not a near miss, it is a
                value that throws when the clock is next read. The list comes
                from the same runtime that will consume it, labelled by city, so
                choosing is the validation. Same control as the entity profile. */}
            <Field>
              <FieldLabel>Your timezone</FieldLabel>
              <Combobox
                color="module"
                items={zones}
                value={selectedZone}
                onValueChange={(next) => {
                  setTouched(true);
                  // Base UI hands back the ITEM, not its value; clearing gives
                  // null, and a promise always needs a zone, so a cleared box
                  // keeps what was there rather than saving an empty string the
                  // server would reject.
                  setDraft((cur) => ({
                    ...cur,
                    timezone: next ? (next as TimezoneOption).value : cur.timezone,
                  }));
                }}
                placeholder="Search for your city…"
                emptyMessage="No timezone matches that city."
                aria-label="Your timezone"
              />
              <FieldDescription>
                The hours above are counted in this timezone — the one your team actually works in.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="What you promise"
            description="In working minutes, counted only while you are open. Leave a box empty to make no promise at that level — better than a number you cannot keep."
          >
            <Card className="p-0">
              <Table size="sm">
                <thead>
                  <tr>
                    <th>How urgent</th>
                    <th className="w-40">Reply within</th>
                    <th className="w-40">Sorted within</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORITIES.map((priority) => (
                    <tr key={priority}>
                      <td>
                        <Badge color={priorityTone(priority)} variant="soft" size="sm">
                          {priorityLabel(priority)}
                        </Badge>
                      </td>
                      <td>
                        <Input
                          size="sm"
                          color="module"
                          type="number"
                          min={1}
                          aria-label={`Reply time for ${priority} requests, in working minutes`}
                          placeholder="No promise"
                          value={draft.targets[priority].firstResponse}
                          onChange={(event) => {
                            setTarget(priority, { firstResponse: event.target.value });
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          size="sm"
                          color="module"
                          type="number"
                          min={1}
                          aria-label={`Resolution time for ${priority} requests, in working minutes`}
                          placeholder="No promise"
                          value={draft.targets[priority].resolution}
                          onChange={(event) => {
                            setTarget(priority, { resolution: event.target.value });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </FormSection>

          <FormSection
            title="Early warning"
            description="How far through the time a request goes amber, so somebody can still do something about it."
          >
            {warnError ? (
              <Alert color="error">
                <AlertContent>
                  <AlertDescription>{warnError}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel>Warn at</FieldLabel>
              <div className="flex items-center gap-2">
                <div className="w-24">
                  <Input
                    color={warnError ? 'error' : 'module'}
                    type="number"
                    min={1}
                    max={99}
                    value={draft.warnAtPercent}
                    onChange={(event) => {
                      setTouched(true);
                      setDraft((cur) => ({ ...cur, warnAtPercent: event.target.value }));
                    }}
                  />
                </div>
                <Clock className="size-4" aria-hidden />
                <Text>
                  per cent of the time used — so an hour’s promise goes amber at{' '}
                  {Number.isFinite(warn) ? Math.max(1, Math.floor((60 * warn) / 100)) : 48} minutes.
                </Text>
              </div>
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}
