'use client';

// One email sequence — build a new one, or open one to change it. Create and
// edit are the SAME surface in two states (`{id:'new'}` → `{id}`), because a
// sequence is a durable, addressable thing you come back to, not a
// fire-and-forget dialog.
//
// A sequence is an ordered list of email STEPS, each a delay ("wait two days")
// and an email to send. Explicit save, last write wins — one Save button, like
// every other editor in the app. Turning it ON is a separate control in the
// header: a draft never sends anything; once it is on, anyone enrolled starts
// receiving the emails on their own clock.
//
// The audience owns a business, not a mail platform. Nothing here says "delay
// seconds", "re-entry policy" or "builder email id" without saying what it means
// in the same breath.

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
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Clock, Mail, Plus, Power, Trash2, Users } from 'lucide-react';
import type { SequenceStep } from '@wizeworks/email-sequences/schemas';
import { useActiveSiteId, useSites } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  formatDelay,
  joinDuration,
  sequenceErrorMessage,
  sequenceState,
  splitDuration,
  useBuilderEmails,
  useCreateSequence,
  useDeleteSequence,
  useSequence,
  useUpdateSequence,
  type SequenceRow,
  type SequenceStatus,
} from './sequences-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';
const EVERY_SITE = '__all__';

// Stable per-step ids for React keys + reorder. A random base keeps them globally
// unique across editor instances / HMR (the builder's node-id rule).
const ID_BASE = Math.random().toString(36).slice(2, 8);
let STEP_UID = 0;
const newStepId = () => `step-${ID_BASE}-${String(STEP_UID++)}`;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/* ── The authoring document ───────────────────────────────────────────────── */

interface DocFields {
  name: string;
  description: string;
  propertyId: string | null;
  reentryPolicy: 'once' | 'always';
  exitOnPurchase: boolean;
  steps: SequenceStep[];
}

const EMPTY_FIELDS: DocFields = {
  name: '',
  description: '',
  propertyId: null,
  reentryPolicy: 'once',
  exitOnPurchase: false,
  steps: [],
};

function docFieldsFrom(sequence: SequenceRow): DocFields {
  return {
    name: sequence.name,
    description: sequence.description ?? '',
    propertyId: sequence.propertyId,
    reentryPolicy: sequence.reentryPolicy,
    exitOnPurchase: sequence.exitOnPurchase,
    // Give every server step a fresh client id so React keys + reorder stay
    // stable even if the server ever omits one.
    steps: sequence.steps.map((step) => ({ ...step, id: step.id || newStepId() })),
  };
}

/** Strip a step to the clean shape the API wants — empty overrides omitted. */
function cleanStep(step: SequenceStep): SequenceStep {
  const out: SequenceStep = {
    id: step.id,
    delaySeconds: step.delaySeconds,
    emailType: step.emailType,
    source: step.source,
  };
  if (step.name?.trim()) out.name = step.name.trim();
  if (step.subject?.trim()) out.subject = step.subject.trim();
  if (step.preheader?.trim()) out.preheader = step.preheader.trim();
  return out;
}

function serializeDoc(f: DocFields): string {
  return JSON.stringify({
    name: f.name.trim(),
    description: f.description.trim() ? f.description.trim() : null,
    propertyId: f.propertyId,
    reentryPolicy: f.reentryPolicy,
    exitOnPurchase: f.exitOnPurchase,
    steps: f.steps.map(cleanStep),
  });
}

function makeStep(isFirst: boolean): SequenceStep {
  return {
    id: newStepId(),
    // The first touch usually goes out the moment someone enrols; later touches
    // default to a day's gap, which the operator then adjusts.
    delaySeconds: isFirst ? 0 : 86_400,
    emailType: 'marketing',
    source: { kind: 'builder', builderEmailId: '' },
  };
}

/* ── The pane router ──────────────────────────────────────────────────────── */

export function SequenceDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  if (id === 'new') return <SequenceEditor ctx={ctx} />;
  return <LoadSequence ctx={ctx} id={id} />;
}

function LoadSequence({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: sequence, isPending, isError, error, refetch } = useSequence(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="sequence"
        title="Could not load this sequence"
        description="This is a problem reaching the server, or the sequence no longer exists. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !sequence) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <SequenceEditor ctx={ctx} sequence={sequence} />;
}

/* ── The editor ───────────────────────────────────────────────────────────── */

function SequenceEditor({ ctx, sequence }: { ctx: SurfaceContext; sequence?: SequenceRow }) {
  const isNew = !sequence;
  const toast = useToast();
  const confirm = useConfirm();

  const { data: sites } = useSites();
  const { data: active } = useActiveSiteId();
  const builderEmails = useBuilderEmails();
  const defaultSite = active?.propertyId ?? sites?.find((s) => s.isPrimary)?.id ?? null;

  const create = useCreateSequence();
  const update = useUpdateSequence(sequence?.id ?? 'new');
  const statusMut = useUpdateSequence(sequence?.id ?? 'new');
  const remove = useDeleteSequence(sequence?.id ?? 'new');

  // ── Document state (seeded once; owned locally after mount) ──
  const initial = useMemo(
    () => (sequence ? docFieldsFrom(sequence) : EMPTY_FIELDS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [propertyId, setPropertyId] = useState<string | null>(initial.propertyId);
  const [reentryPolicy, setReentryPolicy] = useState(initial.reentryPolicy);
  const [exitOnPurchase, setExitOnPurchase] = useState(initial.exitOnPurchase);
  const [steps, setSteps] = useState<SequenceStep[]>(initial.steps);

  const [status, setStatus] = useState<SequenceStatus>(sequence?.status ?? 'draft');
  const [baseline, setBaseline] = useState(() => serializeDoc(initial));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create defaults the site scope to the business being worked in, once it
  // resolves, unless the operator has already chosen one.
  const scopeSet = useRef(false);
  useEffect(() => {
    if (isNew && !scopeSet.current && defaultSite) {
      scopeSet.current = true;
      setPropertyId(defaultSite);
    }
  }, [isNew, defaultSite]);

  const currentDoc = useMemo(
    () => serializeDoc({ name, description, propertyId, reentryPolicy, exitOnPurchase, steps }),
    [name, description, propertyId, reentryPolicy, exitOnPurchase, steps]
  );
  const dirty = currentDoc !== baseline;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This sequence has not been created yet. Close anyway?'
      : 'This sequence has unsaved changes. Close anyway?'
  );

  useEffect(() => {
    ctx.setTitle(name.trim() || (isNew ? 'New sequence' : 'Sequence'));
  }, [ctx, name, isNew]);

  const busy = create.isPending || update.isPending || statusMut.isPending || remove.isPending;

  // ── Step operations ──
  function addStep() {
    setSteps((prev) => [...prev, makeStep(prev.length === 0)]);
  }
  function updateStep(id: string, next: SequenceStep) {
    setSteps((prev) => prev.map((s) => (s.id === id ? next : s)));
  }
  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }
  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const to = index + dir;
      const moved = prev[index];
      if (to < 0 || to >= prev.length || !moved) return prev;
      const next = prev.filter((_, i) => i !== index);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // ── Validation ──
  function validate(): string | null {
    if (!name.trim()) return 'Give this sequence a name.';
    for (const [i, step] of steps.entries()) {
      const n = i + 1;
      if (step.source.kind === 'builder' && !step.source.builderEmailId.trim()) {
        return `Step ${String(n)}: choose which email to send.`;
      }
      if (step.source.kind === 'builtin' && !step.source.builderEmailKey.trim()) {
        return `Step ${String(n)}: enter the built-in email key to send.`;
      }
    }
    return null;
  }

  function checkValid(): boolean {
    setSubmitted(true);
    const message = validate();
    if (message) {
      setError(message);
      return false;
    }
    setError(null);
    return true;
  }

  function docPayload() {
    return {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      propertyId,
      reentryPolicy,
      exitOnPurchase,
      steps: steps.map(cleanStep),
    };
  }

  // ── Save / create / lifecycle ──
  const onCreate = () => {
    if (!checkValid()) return;
    create.mutate(docPayload(), {
      onSuccess: (created) => {
        ctx.open('email.sequences.detail', { id: created.id }, { target: 'replace' });
        afterPaneChange(() => {
          toast.add({
            title: `${created.name} created`,
            description: 'It is saved as a draft. Turn it on when you are ready.',
            type: 'success',
          });
        });
      },
      onError: (e) => {
        setError(sequenceErrorMessage(e, 'Could not create this sequence. Nothing was changed.'));
      },
    });
  };

  const onSave = () => {
    if (!sequence || !checkValid()) return;
    const snapshot = currentDoc;
    update.mutate(docPayload(), {
      onSuccess: () => {
        setBaseline(snapshot);
        toast.add({ title: 'Saved', type: 'success' });
      },
      onError: (e) => {
        setError(sequenceErrorMessage(e, 'Could not save this sequence. Nothing was changed.'));
      },
    });
  };

  const onToggleStatus = () => {
    if (!sequence) return;
    const turnOn = status !== 'active';
    if (dirty) {
      toast.add({
        title: 'Save your changes first',
        description: 'Save, then turn the sequence on so the latest emails are the ones that send.',
        type: 'warning',
      });
      return;
    }
    if (turnOn && steps.length === 0) {
      toast.add({
        title: 'Add an email first',
        description: 'A sequence needs at least one email before it can start sending.',
        type: 'warning',
      });
      return;
    }
    const next: SequenceStatus = turnOn ? 'active' : 'draft';
    statusMut.mutate(
      { status: next },
      {
        onSuccess: () => {
          setStatus(next);
          toast.add({
            title: turnOn ? `${name} is on` : `${name} paused`,
            description: turnOn
              ? 'People enrolled from now on will start receiving the emails.'
              : 'It stops enrolling new people. Turn it back on any time.',
            type: 'success',
          });
        },
        onError: (e) => {
          toast.add({
            title: 'Could not change whether it is on',
            description: sequenceErrorMessage(e, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    if (!sequence) return;
    const enrolled = sequence.counts.total;
    const ok = await confirm({
      title: `Delete ${name}?`,
      description:
        enrolled > 0
          ? `${String(enrolled)} ${enrolled === 1 ? 'person has' : 'people have'} been through this sequence. Deleting it stops it for good and no more emails will be sent. This cannot be undone.`
          : 'This permanently removes the sequence. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: (result) => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({
            title: result.archived ? `${name} stopped` : `${name} deleted`,
            description: result.archived
              ? 'It had people in it, so it is kept as a record but will send nothing more.'
              : undefined,
            type: 'success',
          });
        });
      },
      onError: (e) => {
        toast.add({
          title: 'Could not delete this sequence',
          description: sequenceErrorMessage(e, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const state = sequenceState(status);
  const siteItems: Record<string, string> = { [EVERY_SITE]: 'Every business on this account' };
  for (const site of sites ?? []) siteItems[site.id] = site.name;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Sequence actions"
        controls={
          <>
            {!isNew ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : null}
            {dirty && !isNew ? (
              <Badge color="info" variant="soft" size="sm">
                Unsaved changes
              </Badge>
            ) : null}
            {sequence ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  className="ml-auto shrink-0"
                  title="See who is enrolled"
                  onClick={(event) => {
                    ctx.open(
                      'email.sequences.enrollments',
                      { sequenceId: sequence.id },
                      { target: targetFor(event) }
                    );
                  }}
                >
                  <Users className="size-4" aria-hidden />
                  <span className="hidden @md:inline">Enrolled</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color={status === 'active' ? 'neutral' : 'module'}
                  className="shrink-0"
                  loading={statusMut.isPending}
                  onClick={onToggleStatus}
                >
                  <Power className="size-4" aria-hidden />
                  {status === 'active' ? 'Pause' : 'Turn on'}
                </Button>
                <Button
                  size="sm"
                  color="module"
                  className="shrink-0"
                  loading={update.isPending && !statusMut.isPending}
                  disabled={!dirty || busy}
                  onClick={onSave}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  className="shrink-0"
                  aria-label="Delete this sequence"
                  title="Delete this sequence"
                  loading={remove.isPending}
                  onClick={() => {
                    void onDelete();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                color="module"
                className="ml-auto shrink-0"
                loading={create.isPending}
                disabled={busy}
                onClick={onCreate}
              >
                Create
              </Button>
            )}
          </>
        }
      />

      {error ? (
        <Alert color="error" className="shrink-0">
          <AlertContent>
            <AlertTitle>{isNew ? 'Cannot create this yet' : 'Cannot save this yet'}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {status === 'active' ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>This sequence is on</AlertTitle>
                <AlertDescription>
                  It is sending to people as they are enrolled. Any changes you save apply to people
                  who enrol from then on.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection
            title="Basics"
            description="Name it and, if you like, jot down what it is for."
          >
            <Field>
              <FieldLabel>What is this sequence called?</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={!name.trim() && submitted ? 'error' : 'module'}
                    value={name}
                    placeholder="e.g. Welcome new customers"
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>For you — so you can tell your sequences apart.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Description (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={description}
                    placeholder="A note on what this sequence is for."
                    onChange={(event) => {
                      setDescription(event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="Who it is for"
            description="Where this runs and how it treats people."
          >
            <Field>
              <FieldLabel>Which business this is for</FieldLabel>
              <Select
                color="module"
                aria-label="Which business this is for"
                value={propertyId ?? EVERY_SITE}
                items={siteItems}
                onValueChange={(next) => {
                  const chosen = next as string;
                  setPropertyId(chosen === EVERY_SITE ? null : chosen);
                }}
              />
              <FieldDescription>
                Choosing every business is wider — a sequence set to one business only ever emails
                that business’s people.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>If someone has been through it before</FieldLabel>
              <Select
                color="module"
                aria-label="If someone has been through it before"
                value={reentryPolicy}
                items={{
                  once: 'Only ever send it to a person once',
                  always: 'Let people go through it again',
                }}
                onValueChange={(next) => {
                  setReentryPolicy(next as 'once' | 'always');
                }}
              />
              <FieldDescription>
                Either way, the same person is never in it twice at the same time.
              </FieldDescription>
            </Field>

            <Field>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <FieldLabel>Stop emailing someone once they buy</FieldLabel>
                  <FieldDescription>
                    If a person places an order partway through, they stop getting the rest of the
                    emails.
                  </FieldDescription>
                </div>
                <Switch
                  color="module"
                  aria-label="Stop emailing someone once they buy"
                  checked={exitOnPurchase}
                  onCheckedChange={(next: boolean) => {
                    setExitOnPurchase(next);
                  }}
                />
              </div>
            </Field>
          </FormSection>

          <StepEditor
            steps={steps}
            emails={builderEmails.data ?? []}
            emailsUnavailable={builderEmails.isError}
            submitted={submitted}
            onAdd={addStep}
            onUpdate={updateStep}
            onRemove={removeStep}
            onMove={moveStep}
          />
        </div>
      </div>
    </div>
  );
}

/* ── The step editor ──────────────────────────────────────────────────────── */

function StepEditor({
  steps,
  emails,
  emailsUnavailable,
  submitted,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  steps: SequenceStep[];
  emails: { id: string; name: string }[];
  emailsUnavailable: boolean;
  submitted: boolean;
  onAdd: () => void;
  onUpdate: (id: string, next: SequenceStep) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <FormSection
      title="The emails"
      description="Each step waits a while, then sends one email. They run in order, top to bottom."
      action={
        <Button size="sm" color="module" variant="soft" onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
          Add an email
        </Button>
      }
    >
      {steps.length === 0 ? (
        <div className="border-base-300 flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <Mail className="size-6" aria-hidden />
          <Text className="text-sm">
            No emails yet. Add the first one — it usually goes out the moment someone is enrolled.
          </Text>
          <Button size="sm" color="module" variant="soft" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            Add an email
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <li key={step.id}>
              <StepCard
                step={step}
                index={index}
                total={steps.length}
                emails={emails}
                emailsUnavailable={emailsUnavailable}
                submitted={submitted}
                onChange={(next) => {
                  onUpdate(step.id, next);
                }}
                onRemove={() => {
                  onRemove(step.id);
                }}
                onMove={(dir) => {
                  onMove(index, dir);
                }}
              />
            </li>
          ))}
        </ol>
      )}
    </FormSection>
  );
}

function StepCard({
  step,
  index,
  total,
  emails,
  emailsUnavailable,
  submitted,
  onChange,
  onRemove,
  onMove,
}: {
  step: SequenceStep;
  index: number;
  total: number;
  emails: { id: string; name: string }[];
  emailsUnavailable: boolean;
  submitted: boolean;
  onChange: (next: SequenceStep) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const sourceKind = step.source.kind === 'builtin' ? 'builtin' : 'builder';
  const builderEmailId = step.source.kind === 'builder' ? step.source.builderEmailId : '';
  const builtinKey = step.source.kind === 'builtin' ? step.source.builderEmailKey : '';
  const emailItems: Record<string, string> = {};
  for (const email of emails) emailItems[email.id] = email.name;

  const missingSource =
    submitted &&
    ((step.source.kind === 'builder' && !builderEmailId.trim()) ||
      (step.source.kind === 'builtin' && !builtinKey.trim()));

  return (
    <div className="card bg-base-100 border-base-300 flex flex-col gap-4 border p-4">
      <div className="border-base-300 flex items-center gap-2 border-b pb-3">
        <span className="bg-module/10 text-module inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-col">
          <Heading level={3} className="text-base font-semibold">
            {index === 0 ? 'First email' : `Email ${String(index + 1)}`}
          </Heading>
          <span className="inline-flex items-center gap-1 text-sm">
            <Clock className="size-3.5" aria-hidden />
            {formatDelay(step.delaySeconds)}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label="Move this email earlier"
            disabled={index === 0}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label="Move this email later"
            disabled={index === total - 1}
            onClick={() => {
              onMove(1);
            }}
          >
            <ArrowDown className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            aria-label="Remove this email"
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <DurationInput
        seconds={step.delaySeconds}
        isFirst={index === 0}
        onChange={(seconds) => {
          onChange({ ...step, delaySeconds: seconds });
        }}
      />

      <Field>
        <FieldLabel>Which email to send</FieldLabel>
        <div className="flex flex-col gap-2 @md:flex-row">
          <div className="w-full @md:w-56 @md:shrink-0">
            <Select
              color="module"
              aria-label="Where this email comes from"
              value={sourceKind}
              items={{
                builder: 'A designed email',
                builtin: 'Advanced: a built-in email',
              }}
              onValueChange={(next) => {
                onChange({
                  ...step,
                  source:
                    next === 'builtin'
                      ? { kind: 'builtin', builderEmailKey: builtinKey }
                      : { kind: 'builder', builderEmailId },
                });
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            {sourceKind === 'builder' ? (
              emailsUnavailable || emails.length === 0 ? (
                <Input color="module" value="" disabled placeholder="No designed emails yet" />
              ) : (
                <Select
                  color={missingSource ? 'error' : 'module'}
                  aria-label="Which designed email to send"
                  value={builderEmailId}
                  items={emailItems}
                  placeholder="Choose a designed email…"
                  onValueChange={(next) => {
                    onChange({
                      ...step,
                      source: { kind: 'builder', builderEmailId: next as string },
                    });
                  }}
                />
              )
            ) : (
              <Input
                color={missingSource ? 'error' : 'module'}
                value={builtinKey}
                placeholder="e.g. welcome-customer"
                onChange={(event) => {
                  onChange({
                    ...step,
                    source: { kind: 'builtin', builderEmailKey: event.target.value },
                  });
                }}
              />
            )}
          </div>
        </div>
        {sourceKind === 'builder' && (emailsUnavailable || emails.length === 0) ? (
          <FieldDescription>
            You have no designed emails to choose from yet. Design one under Email, or use the
            advanced option to name a built-in email by its key.
          </FieldDescription>
        ) : sourceKind === 'builtin' ? (
          <FieldDescription>
            The key of a built-in email set up for your account. Only use this if you know the key.
          </FieldDescription>
        ) : null}
      </Field>

      <Field>
        <FieldLabel>What kind of email is this?</FieldLabel>
        <Select
          color="module"
          aria-label="What kind of email is this"
          value={step.emailType}
          items={{
            marketing: 'Marketing — a promotion or offer',
            transactional: 'Transactional — about something they did (a receipt, a reminder)',
          }}
          onValueChange={(next) => {
            onChange({ ...step, emailType: next as 'marketing' | 'transactional' });
          }}
        />
        <FieldDescription>
          Marketing emails respect “do not email” choices and unsubscribes; transactional emails are
          for things a person is expecting.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Subject line (optional)</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={step.subject ?? ''}
              placeholder="Leave blank to use the email’s own subject"
              onChange={(event) => {
                onChange({ ...step, subject: event.target.value });
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
              value={step.preheader ?? ''}
              placeholder="The little line shown after the subject in an inbox"
              onChange={(event) => {
                onChange({ ...step, preheader: event.target.value });
              }}
            />
          }
        />
      </Field>
    </div>
  );
}

/** The friendly "wait this long before this email" control — days, hours,
 *  minutes as three small number inputs. Zero everywhere means "send straight
 *  away", which is the natural default for the first email. */
function DurationInput({
  seconds,
  isFirst,
  onChange,
}: {
  seconds: number;
  isFirst: boolean;
  onChange: (seconds: number) => void;
}) {
  const parts = splitDuration(seconds);
  const set = (key: 'days' | 'hours' | 'minutes', value: number) => {
    onChange(joinDuration({ ...parts, [key]: Math.max(0, value) }));
  };

  const box = (key: 'days' | 'hours' | 'minutes', label: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={`${key}-${String(seconds)}`}>
        {label}
      </label>
      <Input
        id={`${key}-${String(seconds)}`}
        color="module"
        type="number"
        min={0}
        className="w-20"
        value={String(parts[key])}
        onChange={(event) => {
          set(key, Math.floor(Number(event.target.value) || 0));
        }}
      />
    </div>
  );

  return (
    <Field>
      <FieldLabel>Before sending this email, wait</FieldLabel>
      <div className="flex flex-wrap items-end gap-3">
        {box('days', 'Days')}
        {box('hours', 'Hours')}
        {box('minutes', 'Minutes')}
      </div>
      <FieldDescription>
        {seconds <= 0
          ? isFirst
            ? 'Sends the moment someone is enrolled.'
            : 'Sends as soon as the email before it has gone out.'
          : `${formatDelay(seconds)} ${isFirst ? 'after someone is enrolled' : 'after the email before it'}.`}
      </FieldDescription>
    </Field>
  );
}
