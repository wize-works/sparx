'use client';

// One instruction — write it, then manage it.
//
// Writing and managing are the same surface: `{ id: 'new' }` writes one, `{ id }`
// manages it. An instruction is a durable, addressable thing you come back to and
// edit, so it is a PANE in two states, never a create modal — and while you are
// writing it, the unsaved-work net treats it like every other editor here.
//
// Explicit-save only: one Save, and an edit registers as unsaved work so leaving
// with changes asks first. The instruction's NAME is its editable field, not also
// a read-only heading. Deleting it is a plain row after the work, behind a confirm
// that names it — never a card with equal weight beside the wording someone came
// to change.
//
// One centred column, not EditorLayout: this is a form with no running summary to
// put in a rail.

import { useEffect, useMemo, useState } from 'react';
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
  FieldStatus,
  Heading,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Bot, Plus, Save, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { useViewer } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  aiErrorMessage,
  canEditPrompts,
  categoryHint,
  categoryLabel,
  PROMPT_CATEGORIES,
  slugify,
  useCreatePromptTemplate,
  useDeletePromptTemplate,
  usePromptTemplate,
  useUpdatePromptTemplate,
  type PromptCategory,
  type PromptTemplateDto,
  type PromptVariable,
} from './data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const VAR_KEY_RE = /^[a-zA-Z0-9_.]+$/;

interface Draft {
  name: string;
  key: string;
  category: PromptCategory;
  description: string;
  body: string;
  model: string;
  enabled: boolean;
  variables: PromptVariable[];
}

function emptyDraft(): Draft {
  return {
    name: '',
    key: '',
    category: 'persona',
    description: '',
    body: '',
    model: '',
    enabled: true,
    variables: [],
  };
}

function toDraft(prompt: PromptTemplateDto): Draft {
  return {
    name: prompt.name,
    key: prompt.key,
    category: prompt.category,
    description: prompt.description ?? '',
    body: prompt.body,
    model: prompt.model ?? '',
    enabled: prompt.enabled,
    variables: prompt.variables.map((v) => ({ ...v })),
  };
}

/* ── Surface ────────────────────────────────────────────────────────────────── */

export function AiPromptEditorSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <WriteInstruction ctx={ctx} /> : <ManageInstruction ctx={ctx} id={id} />;
}

/* ── Write (create) ───────────────────────────────────────────────────────────── */

function WriteInstruction({ ctx }: { ctx: SurfaceContext }) {
  useEffect(() => {
    ctx.setTitle('New instruction');
  }, [ctx]);
  return <InstructionEditor ctx={ctx} mode="new" />;
}

/* ── Manage (edit) ────────────────────────────────────────────────────────────── */

function ManageInstruction({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: prompt,
    isPending,
    isError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = usePromptTemplate(id);

  useEffect(() => {
    if (prompt) ctx.setTitle(prompt.name);
  }, [ctx, prompt]);

  if (isError) {
    return (
      <LoadError
        title="Could not load this instruction"
        description="This is a problem reaching the server, or the instruction has been deleted. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (isPending || !prompt) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return (
    <InstructionEditor
      ctx={ctx}
      mode="edit"
      prompt={prompt}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

/* ── The shared editor ────────────────────────────────────────────────────────── */

function InstructionEditor({
  ctx,
  mode,
  prompt,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  mode: 'new' | 'edit';
  prompt?: PromptTemplateDto;
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = mode === 'new';
  const toast = useToast();
  const confirm = useConfirm();
  const { data: viewer } = useViewer();
  const canEdit = canEditPrompts(viewer?.role);

  const create = useCreatePromptTemplate();
  const update = useUpdatePromptTemplate(prompt?.id ?? 'new');
  const remove = useDeletePromptTemplate();

  const saved = useMemo(() => (prompt ? toDraft(prompt) : emptyDraft()), [prompt]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  // On create the key mirrors the name until the operator edits it by hand.
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setName = (value: string) => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      name: value,
      key: isNew && !keyTouched ? slugify(value) : current.key,
    }));
  };

  const setVariable = (index: number, patch: Partial<PromptVariable>) => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      variables: current.variables.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  };
  const addVariable = () => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      variables: [...current.variables, { key: '', label: '' }],
    }));
  };
  const removeVariable = (index: number) => {
    setTouched(true);
    setDraft((current) => ({
      ...current,
      variables: current.variables.filter((_, i) => i !== index),
    }));
  };

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    canEdit && dirty && !create.isSuccess,
    isNew
      ? "You've started an instruction but haven't saved it yet. Close anyway?"
      : 'This instruction has unsaved changes. Close anyway?'
  );

  /* ── Validation ─────────────────────────────────────────────────────────── */

  const nameError = draft.name.trim() === '' ? 'Give this instruction a name.' : null;
  const keyError =
    isNew && !KEY_RE.test(draft.key)
      ? draft.key.trim() === ''
        ? 'An id is needed — it is created from the name.'
        : 'The id can use lowercase letters, numbers and dashes only.'
      : null;
  const bodyError = draft.body.trim() === '' ? 'Write the instruction itself.' : null;

  const badVariable = draft.variables.findIndex(
    (v) => v.label.trim() === '' || !VAR_KEY_RE.test(v.key)
  );
  const variableError =
    badVariable >= 0
      ? 'Every placeholder needs a name (letters, numbers, dot or underscore) and a description.'
      : null;

  const blocked = nameError ?? keyError ?? bodyError ?? variableError;

  const failure =
    create.isError || update.isError
      ? aiErrorMessage(
          create.error ?? update.error,
          'Could not save this instruction. Nothing was changed.'
        )
      : null;

  /* ── Save ───────────────────────────────────────────────────────────────── */

  const cleanVariables = (): PromptVariable[] =>
    draft.variables.map((v) => ({
      key: v.key.trim(),
      label: v.label.trim(),
      ...(v.example && v.example.trim() !== '' ? { example: v.example.trim() } : {}),
    }));

  const submit = () => {
    if (blocked || !canEdit) return;
    const description = draft.description.trim() === '' ? null : draft.description.trim();
    const model = draft.model.trim() === '' ? null : draft.model.trim();

    if (isNew) {
      create.mutate(
        {
          key: draft.key.trim(),
          name: draft.name.trim(),
          category: draft.category,
          description,
          body: draft.body,
          model,
          enabled: draft.enabled,
          variables: cleanVariables(),
        },
        {
          onSuccess: (created) => {
            ctx.open('ai.prompts.edit', { id: created.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({ title: `“${created.name}” saved`, type: 'success' });
            });
          },
        }
      );
      return;
    }

    update.mutate(
      {
        name: draft.name.trim(),
        category: draft.category,
        description,
        body: draft.body,
        model,
        enabled: draft.enabled,
        variables: cleanVariables(),
      },
      {
        onSuccess: () => {
          setTouched(false);
          toast.add({ title: 'Instruction saved', type: 'success' });
        },
      }
    );
  };

  const onDelete = async () => {
    if (!prompt) return;
    const ok = await confirm({
      title: `Delete “${prompt.name}”?`,
      description:
        'sparx will stop following this instruction when it writes for you. This cannot be undone, but you can always write it again.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(prompt.id, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `“${prompt.name}” deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this instruction',
          description: aiErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Instruction actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={saving}
            disabled={!canEdit || Boolean(blocked) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? (
              <>
                <Save className="size-4" aria-hidden />
                Save instruction
              </>
            ) : (
              <>
                <Save className="size-4" aria-hidden />
                Save
              </>
            )}
          </Button>
        }
        controls={
          <>
            {dirty ? (
              <Badge color="warning" variant="soft" size="sm">
                Unsaved changes
              </Badge>
            ) : !isNew && prompt && !prompt.enabled ? (
              <Badge color="neutral" variant="outline" size="sm">
                Turned off
              </Badge>
            ) : null}
          </>
        }
        refresh={
          !isNew && onRefresh ? (
            <RefreshButton
              isFetching={isFetching ?? false}
              updatedAt={updatedAt}
              onRefresh={onRefresh}
            />
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                New instruction
              </Heading>
              <Text>
                Tell sparx something about your business for when it writes using your own AI
                account — how to sound, what to say, or what to avoid. You can turn it on or off any
                time.
              </Text>
            </div>
          ) : null}

          {!canEdit ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>You can read this but not change it</AlertTitle>
                <AlertDescription>
                  Only an editor, admin or owner can change how sparx writes with your AI account.
                  Ask one of them if something here needs changing.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* One message, the most specific one — the server names the exact field
              it rejected, which beats a generic banner. */}
          <SaveFailure title="Could not save this instruction" message={failure} />

          <FormSection title="What it is for">
            <Field>
              <FieldLabel>What kind of instruction is this?</FieldLabel>
              <Select
                color="module"
                aria-label="What this instruction is for"
                value={draft.category}
                disabled={!canEdit}
                items={Object.fromEntries(PROMPT_CATEGORIES.map((c) => [c, categoryLabel(c)]))}
                onValueChange={(next) => {
                  set('category', next as PromptCategory);
                }}
              />
              <FieldDescription>{categoryHint(draft.category)}</FieldDescription>
            </Field>

            {draft.category === 'persona' ? (
              <Alert color="info">
                <Bot className="size-5" aria-hidden />
                <AlertContent>
                  <AlertTitle>This is your live chat’s personality</AlertTitle>
                  <AlertDescription>
                    When it is turned on, the assistant that answers on your website uses this as
                    its personality — how it introduces itself, its tone, and what it will and won’t
                    do.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    maxLength={160}
                    disabled={!canEdit}
                    placeholder="e.g. Friendly support voice"
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>
                  How you will recognise it in the list — your customers never see this.
                </FieldDescription>
              )}
            </Field>

            {isNew ? (
              <Field>
                <FieldLabel>Id</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color={keyError && touched ? 'error' : 'module'}
                      value={draft.key}
                      maxLength={120}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="friendly-support-voice"
                      onChange={(event) => {
                        setKeyTouched(true);
                        set('key', event.target.value);
                      }}
                    />
                  }
                />
                {keyError && touched ? (
                  <FieldStatus status="error">{keyError}</FieldStatus>
                ) : (
                  <FieldDescription>
                    A short, permanent tag used behind the scenes. It is filled in from the name and
                    cannot be changed once saved.
                  </FieldDescription>
                )}
              </Field>
            ) : prompt ? (
              <Field>
                <FieldLabel>Id</FieldLabel>
                <Text className="font-mono text-sm">{prompt.key}</Text>
                <FieldDescription>
                  The permanent tag for this instruction. It cannot be changed.
                </FieldDescription>
              </Field>
            ) : null}
          </FormSection>

          <FormSection
            title="The instruction"
            description="The actual wording your assistant reads. Write it as if you were briefing a new team member."
          >
            <Field>
              <FieldLabel>What to tell the assistant</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color={bodyError && touched ? 'error' : 'module'}
                    value={draft.body}
                    rows={10}
                    maxLength={20000}
                    disabled={!canEdit}
                    placeholder="You are the friendly voice of our shop. Keep replies short and warm, never promise a delivery date, and always offer to help further…"
                    onChange={(event) => {
                      set('body', event.target.value);
                    }}
                  />
                }
              />
              {bodyError && touched ? (
                <FieldStatus status="error">{bodyError}</FieldStatus>
              ) : (
                <FieldDescription>
                  You can leave gaps for the assistant to fill in by writing a placeholder in double
                  braces, like {'{{customer_name}}'}. List the ones you use below so they are easy
                  to spot.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Summary (optional)</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    value={draft.description}
                    rows={2}
                    maxLength={2000}
                    disabled={!canEdit}
                    placeholder="A one-line reminder of what this instruction does."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>Shown under the name in your list, just for you.</FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Placeholders"
            description="The gaps the assistant fills in each time it uses this instruction — the things in double braces above."
            action={
              canEdit ? (
                <Button size="sm" variant="outline" color="module" onClick={addVariable}>
                  <Plus className="size-4" aria-hidden />
                  Add
                </Button>
              ) : undefined
            }
          >
            {draft.variables.length === 0 ? (
              <Text className="text-sm">
                None yet. Add one for anything the assistant should slot in — a customer’s name, an
                order number, a product.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {draft.variables.map((variable, index) => {
                  const invalidKey = touched && !VAR_KEY_RE.test(variable.key);
                  const invalidLabel = touched && variable.label.trim() === '';
                  return (
                    <div
                      key={index}
                      className="border-base-300 flex flex-col gap-2 rounded-lg border p-3 @md:flex-row @md:items-start"
                    >
                      <div className="grid flex-1 gap-2 @md:grid-cols-3">
                        <Field>
                          <FieldLabel>Placeholder</FieldLabel>
                          <FieldControl
                            render={
                              <Input
                                color={invalidKey ? 'error' : 'module'}
                                value={variable.key}
                                maxLength={60}
                                autoComplete="off"
                                spellCheck={false}
                                disabled={!canEdit}
                                placeholder="customer_name"
                                onChange={(event) => {
                                  setVariable(index, { key: event.target.value });
                                }}
                              />
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel>What it means</FieldLabel>
                          <FieldControl
                            render={
                              <Input
                                color={invalidLabel ? 'error' : 'module'}
                                value={variable.label}
                                maxLength={120}
                                disabled={!canEdit}
                                placeholder="The customer’s first name"
                                onChange={(event) => {
                                  setVariable(index, { label: event.target.value });
                                }}
                              />
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Example (optional)</FieldLabel>
                          <FieldControl
                            render={
                              <Input
                                color="module"
                                value={variable.example ?? ''}
                                maxLength={240}
                                disabled={!canEdit}
                                placeholder="Sam"
                                onChange={(event) => {
                                  setVariable(index, { example: event.target.value });
                                }}
                              />
                            }
                          />
                        </Field>
                      </div>
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          color="danger"
                          shape="square"
                          className="@md:mt-6"
                          aria-label={`Remove placeholder ${variable.key || String(index + 1)}`}
                          title="Remove this placeholder"
                          onClick={() => {
                            removeVariable(index);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </FormSection>

          <FormSection title="Settings">
            <Field>
              <FieldLabel>Turned on</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.enabled}
                    disabled={!canEdit}
                    onCheckedChange={(next: boolean) => {
                      set('enabled', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                {draft.enabled
                  ? 'sparx follows this when it writes with your AI account.'
                  : 'Kept in your library but ignored until you turn it back on.'}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Specific AI model (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.model}
                    maxLength={64}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!canEdit}
                    placeholder="Leave blank to use your usual model"
                    onChange={(event) => {
                      set('model', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Advanced — only set this if you want this one instruction to run on a particular AI
                model. Most people leave it blank.
              </FieldDescription>
            </Field>
          </FormSection>

          {!isNew && prompt && canEdit ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting this instruction removes it for good. Your assistant stops following it
                straight away.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                className="shrink-0"
                loading={remove.isPending}
                onClick={() => {
                  void onDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Alert color="error" className="max-w-md">
        <AlertContent>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            {description ?? 'This is a problem reaching the server. Please try again.'}
          </AlertDescription>
        </AlertContent>
        <Button size="sm" color="error" variant="soft" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    </div>
  );
}
