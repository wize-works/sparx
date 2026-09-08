'use client';

// One broadcast — write it, or open one to see how it did. Create and edit share
// the same shape, so this is a PANE in two states, never a create modal:
// `{ id: 'new' }` starts a new broadcast, `{ id }` opens an existing one.
//
// A broadcast is editable ONLY while it is a draft. The moment it is sent or
// scheduled it becomes read-only, so the pane has two faces:
//   · the COMPOSER — a real form: name, subject, who it goes to, what it says,
//     and when to send. One centred column, because there is a form here but no
//     running summary to justify a rail beside it.
//   · the REVIEW — a read-only summary plus, once it has gone out, how it did:
//     delivered, opened, clicked, and who dropped off.
//
// The audience owns a business, not a mailing platform. Nothing here says
// "segment", "builder email" or "verified domain" without saying what it means:
// "who it goes to", "what you're sending", "the address it comes from".

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarClock, Mail, Save, Send, Settings, X } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  broadcastErrorMessage,
  broadcastState,
  senderDisplay,
  useAudiences,
  useBroadcast,
  useBroadcastStats,
  useCancelBroadcast,
  useCreateBroadcast,
  useDesignedEmails,
  useEmailSettings,
  useRecipientEstimate,
  useScheduleBroadcast,
  useSendBroadcast,
  useUpdateBroadcast,
  type Broadcast,
  type BroadcastStats,
} from './broadcasts-data';
import { PaneLoadError } from '../../components/pane-load-error';

const DETAIL_KEY = 'email.broadcasts.detail';
const SETTINGS_KEY = 'email.settings';
const EMAIL_DESIGNER_KEY = 'builder.email';

/** One centred, capped column. A pane torn onto a second monitor is otherwise
 *  2000px of dead grey with the form pinned to the left edge. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── The draft the composer edits ─────────────────────────────────────────── */

interface Draft {
  name: string;
  subject: string;
  preheader: string;
  segmentId: string;
  builderEmailId: string;
}

function draftFrom(broadcast: Broadcast | undefined): Draft {
  return {
    name: broadcast?.name ?? '',
    subject: broadcast?.subject ?? '',
    preheader: broadcast?.preheader ?? '',
    segmentId: broadcast?.segmentId ?? '',
    builderEmailId: broadcast?.builderEmailId ?? '',
  };
}

function serialize(draft: Draft): string {
  return [draft.name, draft.subject, draft.preheader, draft.segmentId, draft.builderEmailId].join(
    '\u0000'
  );
}

/** A `datetime-local` value a few minutes ahead — the earliest sensible schedule
 *  and the default the picker opens on. Local wall-clock, not UTC, so the value
 *  matches what the operator sees on their own clock. */
function soonLocalValue(): string {
  const when = new Date(Date.now() + 15 * 60 * 1000);
  const offsetMs = when.getTimezoneOffset() * 60 * 1000;
  return new Date(when.getTime() - offsetMs).toISOString().slice(0, 16);
}

/* ── The pane router ──────────────────────────────────────────────────────── */

export function BroadcastDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  if (id === 'new') return <BroadcastComposer ctx={ctx} />;
  return <LoadBroadcast ctx={ctx} id={id} />;
}

function LoadBroadcast({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: broadcast, isPending, isError, error, refetch } = useBroadcast(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="broadcast"
        title="Could not load this broadcast"
        description="This is a problem reaching the server, or the broadcast no longer exists. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !broadcast) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  // Only a draft is editable; everything past that is read-only.
  if (broadcast.status === 'draft') return <BroadcastComposer ctx={ctx} broadcast={broadcast} />;
  return <BroadcastReview ctx={ctx} broadcast={broadcast} />;
}

/* ── The composer (new draft, or editing a draft) ─────────────────────────── */

function BroadcastComposer({ ctx, broadcast }: { ctx: SurfaceContext; broadcast?: Broadcast }) {
  const toast = useToast();

  const audiences = useAudiences();
  const designed = useDesignedEmails();
  const settings = useEmailSettings();

  const create = useCreateBroadcast();
  const update = useUpdateBroadcast();
  const send = useSendBroadcast();
  const schedule = useScheduleBroadcast();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(broadcast));
  const [baseline, setBaseline] = useState<string>(() => serialize(draftFrom(broadcast)));
  // The id becomes real after the first save of a new broadcast — tracked so a
  // retry after a failed send patches the created draft rather than making a
  // second one.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [timing, setTiming] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [serverError, setServerError] = useState<string | null>(null);
  const committing = useRef(false);

  const currentId = broadcast?.id ?? createdId;

  useEffect(() => {
    ctx.setTitle(broadcast ? broadcast.name : 'New broadcast');
  }, [ctx, broadcast]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = serialize(draft) !== baseline;
  useDirtySource(
    dirty && !committing.current,
    'This broadcast has changes you haven’t saved. Close it anyway?'
  );

  const estimate = useRecipientEstimate(draft.segmentId);
  const recipientCount = draft.segmentId ? estimate.data?.count : undefined;

  const chosenEmail = useMemo(
    () => designed.data?.find((email) => email.id === draft.builderEmailId),
    [designed.data, draft.builderEmailId]
  );
  const emailUnpublished = chosenEmail != null && !chosenEmail.published;

  const name = draft.name.trim();
  const subject = draft.subject.trim();

  // Enough to keep as a draft: the two things the server insists a broadcast has.
  const canSave = name !== '' && subject !== '';

  // Everything a real send needs. Each missing piece names itself, so the button
  // being off is never a mystery.
  const missing: string[] = [];
  if (name === '') missing.push('a name');
  if (subject === '') missing.push('a subject line');
  if (!draft.segmentId) missing.push('who it goes to');
  if (!draft.builderEmailId) missing.push('an email to send');
  if (emailUnpublished) missing.push('a published email (this one is still a draft)');
  if (draft.segmentId && recipientCount === 0) missing.push('an audience with people in it');
  const ready = missing.length === 0 && recipientCount !== undefined && recipientCount > 0;

  const scheduleValid =
    timing === 'now' || (scheduledAt !== '' && new Date(scheduledAt) > new Date());
  const busy = create.isPending || update.isPending || send.isPending || schedule.isPending;

  /** Persist the draft (create the first time, patch thereafter) and return its
   *  id. Updates the dirty baseline so the pane reads clean afterwards. */
  const persist = async (): Promise<string> => {
    if (currentId) {
      await update.mutateAsync({
        id: currentId,
        patch: {
          name,
          subject,
          preheader: draft.preheader.trim() || null,
          segmentId: draft.segmentId || null,
          builderEmailId: draft.builderEmailId || null,
        },
      });
      setBaseline(serialize(draft));
      return currentId;
    }
    const created = await create.mutateAsync({
      name,
      subject,
      ...(draft.preheader.trim() ? { preheader: draft.preheader.trim() } : {}),
      ...(draft.segmentId ? { segmentId: draft.segmentId } : {}),
      ...(draft.builderEmailId ? { builderEmailId: draft.builderEmailId } : {}),
    });
    setCreatedId(created.id);
    setBaseline(serialize(draft));
    return created.id;
  };

  const onSaveDraft = async () => {
    setServerError(null);
    committing.current = true;
    try {
      const wasNew = currentId === null;
      const id = await persist();
      if (wasNew) {
        // Become the edit view for the draft that now exists, so further edits
        // patch it instead of creating another.
        ctx.open(DETAIL_KEY, { id }, { target: 'replace' });
        afterPaneChange(() => {
          toast.add({ title: 'Draft saved', type: 'success' });
        });
      } else {
        committing.current = false;
        toast.add({ title: 'Draft saved', type: 'success' });
      }
    } catch (error) {
      committing.current = false;
      setServerError(
        broadcastErrorMessage(error, 'Could not save this draft. Nothing was changed.')
      );
    }
  };

  const onSend = async () => {
    setServerError(null);
    committing.current = true;
    try {
      const id = await persist();
      await send.mutateAsync(id);
      ctx.open(DETAIL_KEY, { id }, { target: 'replace' });
      afterPaneChange(() => {
        toast.add({
          title: 'Broadcast on its way',
          description: 'It is being sent to everyone in your audience now.',
          type: 'success',
        });
      });
    } catch (error) {
      committing.current = false;
      setServerError(
        broadcastErrorMessage(error, 'Could not send this broadcast. Nothing was changed.')
      );
    }
  };

  const onSchedule = async () => {
    setServerError(null);
    committing.current = true;
    try {
      const id = await persist();
      await schedule.mutateAsync({ id, scheduledAt: new Date(scheduledAt).toISOString() });
      ctx.open(DETAIL_KEY, { id }, { target: 'replace' });
      afterPaneChange(() => {
        toast.add({ title: 'Broadcast scheduled', type: 'success' });
      });
    } catch (error) {
      committing.current = false;
      setServerError(
        broadcastErrorMessage(error, 'Could not schedule this broadcast. Nothing was changed.')
      );
    }
  };

  const audienceItems = audiences.data ?? [];
  const designedItems = designed.data ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Broadcast composer actions"
        primary={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="ml-auto shrink-0"
            disabled={!canSave || busy || (!dirty && currentId !== null)}
            loading={
              (create.isPending || update.isPending) && !send.isPending && !schedule.isPending
            }
            onClick={() => {
              void onSaveDraft();
            }}
          >
            <Save className="size-4" aria-hidden />
            Save draft
          </Button>
        }
        controls={
          <>
            <Badge color="info" variant="soft" size="sm">
              Draft
            </Badge>
            {recipientCount !== undefined ? (
              <Text as="span" className="text-sm">
                {recipientCount.toLocaleString()} {recipientCount === 1 ? 'person' : 'people'}
              </Text>
            ) : null}
            {timing === 'now' ? (
              <Button
                size="sm"
                color="module"
                className="shrink-0"
                disabled={!ready || busy}
                loading={send.isPending}
                onClick={() => {
                  void onSend();
                }}
              >
                <Send className="size-4" aria-hidden />
                Send now
              </Button>
            ) : (
              <Button
                size="sm"
                color="module"
                className="shrink-0"
                disabled={!ready || !scheduleValid || busy}
                loading={schedule.isPending}
                onClick={() => {
                  void onSchedule();
                }}
              >
                <CalendarClock className="size-4" aria-hidden />
                Schedule
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {broadcast ? null : (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Write a broadcast
              </Heading>
              <Text>
                One email to a whole audience at once. Choose who it goes to and what it says, then
                send it now or pick a time.
              </Text>
            </div>
          )}

          <SaveFailure title="That didn’t go through" message={serverError} />

          <FormSection
            title="The email"
            description="The subject is what people see in their inbox. The name is just for you, to find this later."
          >
            <Field>
              <FieldLabel>Name (only you see this)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    placeholder="March newsletter"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Subject line</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.subject}
                    placeholder="Spring is here — 20% off everything"
                    onChange={(event) => {
                      set('subject', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Preview text (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.preheader}
                    placeholder="The one line that shows after the subject in most inboxes"
                    onChange={(event) => {
                      set('preheader', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                A short line most inboxes show next to the subject. Leave it blank and the start of
                your email is used instead.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Who it goes to"
            description="An audience is a saved group of your customers. This broadcast reaches everyone in it, apart from anyone who has unsubscribed."
          >
            {audiences.isError ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>Couldn’t load your audiences</AlertTitle>
                  <AlertDescription>
                    We couldn’t reach your saved audiences just now. Try refreshing in a moment.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : audiences.isSuccess && audienceItems.length === 0 ? (
              <div className="flex flex-col items-start gap-2">
                <Text className="text-sm">
                  You don’t have any saved audiences yet. Audiences are built from your customer
                  list — create one, then come back to send to it.
                </Text>
              </div>
            ) : (
              <Field>
                <FieldLabel>Audience</FieldLabel>
                <NativeSelect
                  color="module"
                  value={draft.segmentId}
                  aria-label="Who this broadcast goes to"
                  onChange={(event) => {
                    set('segmentId', event.target.value);
                  }}
                >
                  <option value="">Choose an audience…</option>
                  {audienceItems.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.name}
                    </option>
                  ))}
                </NativeSelect>
                {draft.segmentId ? (
                  <FieldDescription>
                    {estimate.isPending
                      ? 'Counting who this reaches…'
                      : recipientCount === undefined
                        ? ''
                        : recipientCount === 0
                          ? 'Nobody matches this audience yet, so there is no one to send to.'
                          : `About ${recipientCount.toLocaleString()} ${
                              recipientCount === 1 ? 'person' : 'people'
                            } will receive this.`}
                  </FieldDescription>
                ) : null}
              </Field>
            )}
          </FormSection>

          <FormSection
            title="What you’re sending"
            description="Pick one of your designed emails. It has to be published — a draft design has nothing to send yet."
            action={
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                onClick={() => {
                  ctx.open(EMAIL_DESIGNER_KEY, {}, { target: 'beside' });
                }}
              >
                <Mail className="size-4" aria-hidden />
                Design emails
              </Button>
            }
          >
            {designed.isError ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>Couldn’t load your designed emails</AlertTitle>
                  <AlertDescription>
                    We couldn’t reach your email designs just now. Try refreshing in a moment.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : designed.isSuccess && designedItems.length === 0 ? (
              <Text className="text-sm">
                You haven’t designed any emails yet. Use “Design emails” above to build one, publish
                it, then choose it here.
              </Text>
            ) : (
              <Field>
                <FieldLabel>Designed email</FieldLabel>
                <NativeSelect
                  color="module"
                  value={draft.builderEmailId}
                  aria-label="Which designed email to send"
                  onChange={(event) => {
                    set('builderEmailId', event.target.value);
                  }}
                >
                  <option value="">Choose an email…</option>
                  {designedItems.map((email) => (
                    <option key={email.id} value={email.id}>
                      {email.name}
                      {email.published ? '' : ' (draft — not published)'}
                    </option>
                  ))}
                </NativeSelect>
                {emailUnpublished ? (
                  <FieldDescription>
                    This design hasn’t been published yet, so it can’t be sent. Open it in the email
                    designer and publish it first.
                  </FieldDescription>
                ) : null}
              </Field>
            )}
          </FormSection>

          <FormSection
            title="The address it comes from"
            description="This is who your broadcast appears to be from. It’s the same for every email you send from this site."
            action={
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                onClick={() => {
                  ctx.open(SETTINGS_KEY, {}, { target: 'beside' });
                }}
              >
                <Settings className="size-4" aria-hidden />
                Change
              </Button>
            }
          >
            <div className="border-base-300 flex items-center gap-3 rounded-lg border p-3">
              <Mail className="size-5 shrink-0" aria-hidden />
              <Text className="min-w-0 font-medium break-all">
                {settings.isPending ? 'Loading…' : senderDisplay(settings.data)}
              </Text>
            </div>
          </FormSection>

          <FormSection
            title="When to send"
            description="Send it straight away, or pick a date and time and sparx will send it for you."
          >
            <Field>
              <FieldLabel>Timing</FieldLabel>
              <NativeSelect
                color="module"
                className="max-w-xs"
                value={timing}
                aria-label="When to send this broadcast"
                onChange={(event) => {
                  const next = event.target.value as 'now' | 'schedule';
                  setTiming(next);
                  if (next === 'schedule' && scheduledAt === '') setScheduledAt(soonLocalValue());
                }}
              >
                <option value="now">Send as soon as I press Send</option>
                <option value="schedule">Schedule for a specific time</option>
              </NativeSelect>
            </Field>

            {timing === 'schedule' ? (
              <Field>
                <FieldLabel>Date and time</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="datetime-local"
                      className="max-w-xs"
                      value={scheduledAt}
                      min={soonLocalValue()}
                      onChange={(event) => {
                        setScheduledAt(event.target.value);
                      }}
                    />
                  }
                />
                {scheduledAt !== '' && !scheduleValid ? (
                  <FieldDescription>Pick a time in the future.</FieldDescription>
                ) : (
                  <FieldDescription>Uses your own time zone.</FieldDescription>
                )}
              </Field>
            ) : null}

            {!ready ? (
              <Text className="text-sm">
                Before you can send, this still needs {formatList(missing)}.
              </Text>
            ) : null}
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/** "a, b and c" — a plain-language list for the "still needs …" hint. */
function formatList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/* ── The review (sent, scheduled, and the terminal states) ────────────────── */

function BroadcastReview({ ctx, broadcast }: { ctx: SurfaceContext; broadcast: Broadcast }) {
  const toast = useToast();
  const confirm = useConfirm();
  const cancel = useCancelBroadcast();

  const audiences = useAudiences();
  const designed = useDesignedEmails();
  const settings = useEmailSettings();

  const isSent = broadcast.status === 'sent' || broadcast.status === 'sending';
  const stats = useBroadcastStats(broadcast.id, isSent);

  const state = broadcastState(broadcast.status);

  useEffect(() => {
    ctx.setTitle(broadcast.name);
  }, [ctx, broadcast.name]);

  const audienceName = audiences.data?.find((a) => a.id === broadcast.segmentId)?.name;
  const emailName = designed.data?.find((e) => e.id === broadcast.builderEmailId)?.name;

  const onCancel = async () => {
    const ok = await confirm({
      title: 'Cancel this scheduled broadcast?',
      description: `“${broadcast.name}” is set to send ${
        broadcast.scheduledAt ? `on ${formatWhen(broadcast.scheduledAt)}` : 'later'
      }. Cancelling stops it going out for good — nobody receives it. You can always start a new broadcast later.`,
      confirmLabel: 'Cancel the send',
      cancelLabel: 'Leave it scheduled',
      color: 'danger',
    });
    if (!ok) return;
    cancel.mutate(broadcast.id, {
      onSuccess: () => {
        toast.add({ title: 'Scheduled send cancelled', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not cancel this broadcast',
          description: broadcastErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Broadcast actions"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {broadcast.status === 'scheduled' ? (
              <Button
                size="sm"
                variant="outline"
                color="danger"
                className="ml-auto shrink-0"
                loading={cancel.isPending}
                onClick={() => {
                  void onCancel();
                }}
              >
                <X className="size-4" aria-hidden />
                Cancel send
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {broadcast.name}
            </Heading>
            <Text className="text-sm">{broadcast.subject}</Text>
          </div>

          {broadcast.status === 'scheduled' && broadcast.scheduledAt ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Scheduled to send</AlertTitle>
                <AlertDescription>
                  This goes out on {formatWhen(broadcast.scheduledAt)} to everyone in your audience.
                  You can cancel it any time before then.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {broadcast.status === 'cancelled' ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>This send was cancelled</AlertTitle>
                <AlertDescription>
                  It never went out. You can start a new broadcast whenever you’re ready.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {broadcast.status === 'failed' ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>This broadcast didn’t send</AlertTitle>
                <AlertDescription>
                  Something went wrong while sending it. Check your sending address is set up, then
                  try a new broadcast.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="Summary">
            <dl className="grid gap-x-6 gap-y-3 @md:grid-cols-2">
              <SummaryRow label="Who it went to" value={audienceName ?? 'An audience'} />
              <SummaryRow label="What was sent" value={emailName ?? 'A designed email'} />
              <SummaryRow label="From" value={senderDisplay(settings.data)} />
              <SummaryRow
                label={isSent ? 'People reached' : 'Audience'}
                value={
                  broadcast.recipientCount > 0
                    ? `${broadcast.recipientCount.toLocaleString()} ${
                        broadcast.recipientCount === 1 ? 'person' : 'people'
                      }`
                    : '—'
                }
              />
              {broadcast.sentAt ? (
                <SummaryRow label="Sent" value={formatWhen(broadcast.sentAt)} />
              ) : broadcast.scheduledAt ? (
                <SummaryRow label="Scheduled for" value={formatWhen(broadcast.scheduledAt)} />
              ) : null}
            </dl>
          </FormSection>

          {isSent ? (
            <FormSection
              title="How it did"
              description="Counts update as people open and click over the hours and days after you send."
            >
              {stats.isError ? (
                <Alert color="warning">
                  <AlertContent>
                    <AlertTitle>Couldn’t load the results</AlertTitle>
                    <AlertDescription>
                      We couldn’t reach the engagement figures just now. Try refreshing in a moment.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : stats.isPending || !stats.data ? (
                <Text className="text-sm" role="status">
                  Loading results…
                </Text>
              ) : (
                <StatsGrid stats={stats.data} recipients={broadcast.recipientCount} />
              )}
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

/* ── Engagement figures ───────────────────────────────────────────────────── */

function StatsGrid({ stats, recipients }: { stats: BroadcastStats; recipients: number }) {
  // Opens and clicks are shares of what actually landed; the rest are counts on
  // their own. Fall back through delivered → accepted → recipients so an early
  // send with sparse events still reads sensibly.
  const base = stats.delivered || stats.accepted || recipients || 0;
  const pct = (part: number) => (base > 0 ? `${String(Math.round((part / base) * 100))}%` : '—');

  return (
    <div className="grid gap-3 @sm:grid-cols-2 @xl:grid-cols-3">
      <StatBlock label="Delivered" value={stats.delivered.toLocaleString()} tone="neutral" />
      <StatBlock
        label="Opened"
        value={stats.opened.toLocaleString()}
        hint={`${pct(stats.opened)} of delivered`}
        tone="success"
      />
      <StatBlock
        label="Clicked"
        value={stats.clicked.toLocaleString()}
        hint={`${pct(stats.clicked)} of delivered`}
        tone="success"
      />
      <StatBlock
        label="Bounced"
        value={stats.bounced.toLocaleString()}
        hint="Couldn’t be delivered"
        tone={stats.bounced > 0 ? 'warning' : 'neutral'}
      />
      <StatBlock
        label="Unsubscribed"
        value={stats.unsubscribed.toLocaleString()}
        hint="Opted out from this"
        tone={stats.unsubscribed > 0 ? 'warning' : 'neutral'}
      />
      <StatBlock
        label="Spam complaints"
        value={stats.complained.toLocaleString()}
        hint="Marked as spam"
        tone={stats.complained > 0 ? 'error' : 'neutral'}
      />
    </div>
  );
}

function StatBlock({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
}) {
  const accent =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'error'
          ? 'text-error'
          : '';
  return (
    <div className="border-base-300 bg-base-100 flex flex-col gap-1 rounded-lg border p-3">
      <Text className="text-sm">{label}</Text>
      <Text className={`text-2xl font-semibold tabular-nums ${accent}`}>{value}</Text>
      {hint ? <Text className="text-sm">{hint}</Text> : null}
    </div>
  );
}

/** A timestamp in full, plain words — "12 March 2026 at 9:00 am". */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
