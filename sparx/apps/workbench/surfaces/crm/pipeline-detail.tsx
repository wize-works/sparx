'use client';

// One pipeline — create it, then shape its stages.
//
// Create and manage are the SAME surface: `{ id: 'new' }` builds a pipeline (its
// name and short id), `{ id }` manages it and its stages. Stages are edited in
// place — added, renamed, retyped, reordered — and each edit is applied straight
// away rather than held in the pane's draft, because a stage change is a discrete
// action like the ones on the web-address pane. The pipeline's own name is the
// one held-and-saved field. Archiving is behind a confirm.
//
// Removing a stage is behind a confirm, and — because a deal on it needs a home —
// the operator first picks the stage its deals move to; the server moves them in
// one transaction and refuses to remove a pipeline's last stage.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
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
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Archive, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SLUG_RE, slugify } from './segment-rules';
import { SaveFailure } from '@/components/save-failure';
import {
  stageTypesFor,
  pipelineErrorMessage,
  stageTypeMeta,
  useArchivePipeline,
  useCreatePipeline,
  useCreateStage,
  useDeleteStage,
  usePipeline,
  useReorderStages,
  useUpdatePipeline,
  useUpdateStage,
  type Pipeline,
  type PipelineStage,
  type StageType,
} from './pipelines-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── Surface ────────────────────────────────────────────────────────────── */

export function PipelineDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? (
    <PipelineEditor ctx={ctx} id="new" />
  ) : (
    <PipelineLoader ctx={ctx} id={id} />
  );
}

function PipelineLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: pipeline, isPending, isError, error, refetch } = usePipeline(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="pipeline"
        title="Could not load this pipeline"
        description="This is a problem reaching the server, or the pipeline has been removed. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !pipeline) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <PipelineEditor ctx={ctx} id={id} pipeline={pipeline} />;
}

interface Identity {
  name: string;
  slug: string;
}

function PipelineEditor({
  ctx,
  id,
  pipeline,
}: {
  ctx: SurfaceContext;
  id: string;
  pipeline?: Pipeline;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreatePipeline();
  const update = useUpdatePipeline(id);
  const archive = useArchivePipeline(id);
  const addStage = useCreateStage(id);
  const reorder = useReorderStages(id);

  const savedIdentity = useMemo<Identity>(
    () => ({ name: pipeline?.name ?? '', slug: pipeline?.slug ?? '' }),
    [pipeline]
  );
  const [identity, setIdentity] = useState<Identity>(savedIdentity);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setIdentity(savedIdentity);
  }, [savedIdentity, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New pipeline' : pipeline ? pipeline.name : 'Pipeline');
  }, [ctx, isNew, pipeline]);

  const setName = (name: string) => {
    setTouched(true);
    setIdentity((cur) => ({ ...cur, name, slug: slugTouched ? cur.slug : slugify(name) }));
  };
  const setSlug = (slug: string) => {
    setTouched(true);
    setSlugTouched(true);
    setIdentity((cur) => ({ ...cur, slug: slug.toLowerCase() }));
  };

  const nameError = identity.name.trim() === '' ? 'Give the pipeline a name.' : null;
  const slugError =
    identity.slug.trim() === ''
      ? 'Give the pipeline a short id.'
      : !SLUG_RE.test(identity.slug.trim())
        ? 'The id can use lowercase letters, numbers and dashes, and must start with a letter.'
        : null;
  const blocked = nameError ?? slugError;

  const dirty =
    touched && (identity.name !== savedIdentity.name || identity.slug !== savedIdentity.slug);
  const saving = create.isPending || update.isPending;
  const isArchived = pipeline?.archivedAt != null;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This pipeline has not been created yet. Close anyway?'
      : 'This pipeline has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError
      ? pipelineErrorMessage(
          create.error ?? update.error,
          'The server did not answer. Nothing was changed and your work is still on screen — try again in a moment.'
        )
      : null;

  const submit = () => {
    if (blocked) return;
    const input = { name: identity.name.trim(), slug: identity.slug.trim() };
    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('crm.pipeline.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${created.name} created`,
              description: 'Now add the stages a deal moves through.',
              type: 'success',
            });
          });
        },
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Pipeline saved', type: 'success' });
      },
    });
  };

  const onAddStage = () => {
    if (!pipeline) return;
    addStage.mutate(
      { name: 'New stage', sortOrder: pipeline.stages.length, stageType: 'open', probability: 0 },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not add a stage',
            description: pipelineErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    if (!pipeline) return;
    const ids = pipeline.stages.map((s) => s.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    reorder.mutate(next, {
      onError: (error) => {
        toast.add({
          title: 'Could not reorder the stages',
          description: pipelineErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onArchive = async () => {
    if (!pipeline) return;
    const ok = await confirm({
      title: `Archive ${pipeline.name}?`,
      description:
        'This hides the pipeline from the list and from the deal editor. Deals already on it are kept. You can find it again by including archived pipelines in the list.',
      confirmLabel: 'Archive this pipeline',
      cancelLabel: 'Keep it',
      color: 'warning',
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${pipeline.name} archived`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not archive this pipeline',
          description: pipelineErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const stages = pipeline?.stages ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Pipeline actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={saving}
            disabled={Boolean(blocked) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create pipeline' : 'Save'}
          </Button>
        }
        controls={
          <>
            {pipeline?.isDefault ? (
              <Badge color="module" variant="soft" size="sm">
                Default
              </Badge>
            ) : null}
            {isArchived ? (
              <Badge color="neutral" variant="soft" size="sm">
                Archived
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Create a pipeline
              </Heading>
              <Text>
                A pipeline is your own set of stages a deal moves through. Name it, then add the
                stages — from first contact to won or lost.
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this pipeline" message={failure} />

          <FormSection title="Name">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={identity.name}
                    placeholder="New B2B acquisition"
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? <FieldStatus status="error">{nameError}</FieldStatus> : null}
            </Field>
            <Field>
              <FieldLabel>Short id</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={slugError && touched ? 'error' : 'module'}
                    value={identity.slug}
                    placeholder="new-b2b-acquisition"
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono"
                    onChange={(event) => {
                      setSlug(event.target.value);
                    }}
                  />
                }
              />
              {slugError && touched ? (
                <FieldStatus status="error">{slugError}</FieldStatus>
              ) : (
                <FieldDescription>A short, lowercase id used behind the scenes.</FieldDescription>
              )}
            </Field>
          </FormSection>

          {isNew ? (
            <Alert color="info">
              <AlertContent>
                <AlertDescription>
                  Create the pipeline first, then its stages appear here to add and arrange.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <FormSection
              title="Stages"
              description="The steps a deal moves through, top to bottom. Mark the ones that mean the deal is won or lost."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  loading={addStage.isPending}
                  onClick={onAddStage}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a stage
                </Button>
              }
            >
              {stages.length === 0 ? (
                <Text className="text-sm">
                  No stages yet. Add the first step a deal goes through, like “New lead”.
                </Text>
              ) : (
                <div className="flex flex-col gap-2">
                  {stages.map((stage, index) => (
                    <StageRow
                      key={stage.id}
                      pipelineId={id}
                      // `deal` while the pipeline is still loading: the stage
                      // list is empty then, so this maps over nothing and the
                      // fallback never actually renders — it just keeps the
                      // picker from ever being handed `undefined`.
                      objectKey={pipeline?.objectKey ?? 'deal'}
                      stage={stage}
                      isFirst={index === 0}
                      isLast={index === stages.length - 1}
                      isOnlyStage={stages.length <= 1}
                      otherStages={stages.filter((s) => s.id !== stage.id)}
                      reordering={reorder.isPending}
                      onMoveUp={() => {
                        moveStage(index, -1);
                      }}
                      onMoveDown={() => {
                        moveStage(index, 1);
                      }}
                    />
                  ))}
                </div>
              )}
            </FormSection>
          )}

          {!isNew && pipeline && !isArchived ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Archiving hides this pipeline. Deals already on it are kept.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="warning"
                loading={archive.isPending}
                onClick={() => {
                  void onArchive();
                }}
              >
                <Archive className="size-4" aria-hidden />
                Archive this pipeline
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── One stage row — edits apply straight away ──────────────────────────── */

function StageRow({
  pipelineId,
  objectKey,
  stage,
  isFirst,
  isLast,
  isOnlyStage,
  otherStages,
  reordering,
  onMoveUp,
  onMoveDown,
}: {
  pipelineId: string;
  /** What this pipeline moves (docs/144 §7.2). Decides which terminal words the
   *  "Means" picker offers: a sales stage cannot be "Sorted out", and a support
   *  stage cannot be "Won" — the server refuses both, so offering them here
   *  would only be a slower way to find that out. */
  objectKey: string;
  stage: PipelineStage;
  isFirst: boolean;
  isLast: boolean;
  /** The last stage cannot be removed — a deal needs somewhere to live. */
  isOnlyStage: boolean;
  /** Where this stage's deals can be moved on removal. */
  otherStages: PipelineStage[];
  reordering: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateStage(pipelineId);
  const remove = useDeleteStage(pipelineId);

  const [name, setName] = useState(stage.name);
  const [probability, setProbability] = useState(
    Number(stage.probability) > 0 ? String(Number(stage.probability)) : ''
  );
  const [removing, setRemoving] = useState(false);
  const [reassignTo, setReassignTo] = useState(otherStages[0]?.id ?? '');

  // Re-sync when the server copy changes (after a save invalidates the pipeline).
  useEffect(() => {
    setName(stage.name);
  }, [stage.name]);
  useEffect(() => {
    setProbability(Number(stage.probability) > 0 ? String(Number(stage.probability)) : '');
  }, [stage.probability]);
  useEffect(() => {
    setReassignTo((cur) =>
      otherStages.some((s) => s.id === cur) ? cur : (otherStages[0]?.id ?? '')
    );
  }, [otherStages]);

  const patch = (body: { name?: string; probability?: number; stageType?: StageType }) => {
    update.mutate(
      { stageId: stage.id, patch: body },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not save the stage',
            description: pipelineErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === stage.name) {
      setName(stage.name);
      return;
    }
    patch({ name: trimmed });
  };

  const commitProbability = () => {
    const next = probability.trim() === '' ? 0 : Number(probability);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      setProbability(Number(stage.probability) > 0 ? String(Number(stage.probability)) : '');
      return;
    }
    if (next === Number(stage.probability)) return;
    patch({ probability: next });
  };

  const onConfirmRemove = async () => {
    const targetName = otherStages.find((s) => s.id === reassignTo)?.name ?? 'another stage';
    const ok = await confirm({
      title: `Remove ${stage.name}?`,
      description: `Any deals still on this stage move to “${targetName}”. This cannot be undone — but no deal is lost.`,
      confirmLabel: 'Remove stage',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(
      { stageId: stage.id, ...(reassignTo ? { reassignToStageId: reassignTo } : {}) },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not remove the stage',
            description: pipelineErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const meta = stageTypeMeta(stage.stageType);

  return (
    <div className="border-base-300 bg-base-100 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label="Move stage up"
            title="Move up"
            disabled={isFirst || reordering}
            onClick={onMoveUp}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label="Move stage down"
            title="Move down"
            disabled={isLast || reordering}
            onClick={onMoveDown}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </div>

        <Field className="min-w-[10rem] flex-1">
          <FieldLabel>Stage name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                onBlur={commitName}
              />
            }
          />
        </Field>

        <Field className="min-w-[9rem]">
          <FieldLabel>Means</FieldLabel>
          <Select
            color="module"
            aria-label="What this stage means"
            value={stage.stageType}
            items={Object.fromEntries(stageTypesFor(objectKey).map((t) => [t.value, t.label]))}
            onValueChange={(next) => {
              patch({ stageType: next as StageType });
            }}
          />
        </Field>

        <Field className="w-24">
          <FieldLabel>Chance</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={probability}
                placeholder="%"
                onChange={(event) => {
                  setProbability(event.target.value);
                }}
                onBlur={commitProbability}
              />
            }
          />
        </Field>

        <Badge color={meta.tone} variant="soft" size="sm">
          {meta.label}
        </Badge>

        <Button
          size="sm"
          variant="ghost"
          color="danger"
          shape="square"
          aria-label={isOnlyStage ? 'A pipeline must keep at least one stage' : 'Remove this stage'}
          title={isOnlyStage ? 'A pipeline must keep at least one stage' : 'Remove this stage'}
          disabled={isOnlyStage}
          onClick={() => {
            setRemoving((cur) => !cur);
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      {/* The reassignment picker only appears once Remove is pressed. A deal on
          this stage needs a new home, and the server requires one — so it is
          chosen here before the confirm rather than guessed. */}
      {removing && !isOnlyStage ? (
        <div className="border-base-300 flex flex-wrap items-end gap-2 border-t pt-3">
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel>If it has any deals, move them to</FieldLabel>
            <Select
              color="module"
              aria-label="Move any deals to"
              value={reassignTo}
              items={Object.fromEntries(otherStages.map((s) => [s.id, s.name]))}
              onValueChange={(next) => {
                setReassignTo(next as string);
              }}
            />
          </Field>
          <Button
            size="sm"
            color="danger"
            loading={remove.isPending}
            onClick={() => {
              void onConfirmRemove();
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove stage
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            onClick={() => {
              setRemoving(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
