'use client';

// One compatibility list — create it, then manage its shape and its entries.
//
// Create and manage are the SAME surface: `{ id: 'new' }` builds it, `{ id }`
// manages it, so the form is written once. That is the whole reason this is a
// pane and not a create modal (docs/123 "Pane or modal?").
//
// The pane holds two kinds of work, and they are deliberately not the same:
//
//   • The list's SHAPE — its name, picture, and the levels/ranges it narrows
//     down through — is a DRAFT with one Save. It is a small set of related
//     fields you change together, exactly like a settings form.
//
//   • The list's ENTRIES — the actual Fords and F-250s — commit immediately as
//     you add / rename / reorder / delete them (see FitmentNodeManager). A tree
//     of thousands of values is not a form field, and pretending it were one
//     would put a destructive act inside an ambient "save".
//
// Entries need the list to exist first (they hang off its id), so on a brand-new
// list the entries manager appears only after the first Save lands the pane on
// the real record.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { faPlus, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { FITMENT_ICONS, resolveFitmentIcon } from './fitment-icons';
import { FitmentNodeManager } from './fitment-nodes';
import { SaveFailure } from '@/components/save-failure';
import {
  dimensionKeyFrom,
  fitmentErrorMessage,
  levelDimensions,
  rangeDimensions,
  rootCountLabel,
  slugifyDomain,
  useCreateFitmentDomain,
  useDeleteFitmentDomain,
  useFitmentDomain,
  useUpdateFitmentDomain,
  type FitmentDimension,
  type FitmentDomain,
} from './fitment-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── Draft ──────────────────────────────────────────────────────────────── */

/** One dimension as the form edits it. `key` is the machine id: null for a
 *  dimension the operator just added (derived on save), set for an existing one
 *  (preserved, so nodes that reference it stay valid). */
interface DimDraft {
  key: string | null;
  label: string;
  unit: string;
}

interface Draft {
  displayName: string;
  description: string;
  iconKey: string | null;
  levels: DimDraft[];
  ranges: DimDraft[];
}

function emptyDraft(): Draft {
  return {
    displayName: '',
    description: '',
    iconKey: null,
    levels: [{ key: null, label: '', unit: '' }],
    ranges: [],
  };
}

function toDraft(domain: FitmentDomain): Draft {
  return {
    displayName: domain.displayName,
    description: domain.description ?? '',
    iconKey: domain.iconKey,
    levels: levelDimensions(domain).map((d) => ({ key: d.key, label: d.label, unit: '' })),
    ranges: rangeDimensions(domain).map((d) => ({
      key: d.key,
      label: d.label,
      unit: d.unit ?? '',
    })),
  };
}

/**
 * Fold the two edited dimension lists back into the API's ordered array —
 * levels first (their order IS the tree depth), then ranges. Existing keys are
 * kept; new ones derive from the label and are de-duplicated so two levels
 * called the same thing cannot collide.
 */
function composeDimensions(draft: Draft): FitmentDimension[] {
  const dims: FitmentDimension[] = [];
  const used = new Set<string>();
  const keyFor = (dim: DimDraft, fallback: string): string => {
    let base = dim.key ?? dimensionKeyFrom(dim.label);
    if (base === '') base = fallback;
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${String(n++)}`.slice(0, 40);
    }
    used.add(candidate);
    return candidate;
  };
  for (const level of draft.levels) {
    const label = level.label.trim();
    if (label === '') continue;
    dims.push({ key: keyFor(level, 'level'), label, kind: 'level' });
  }
  for (const range of draft.ranges) {
    const label = range.label.trim();
    if (label === '') continue;
    const unit = range.unit.trim();
    dims.push({ key: keyFor(range, 'range'), label, kind: 'range', ...(unit ? { unit } : {}) });
  }
  return dims;
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function FitmentDomainDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <DomainEditor ctx={ctx} id="new" /> : <DomainLoader ctx={ctx} id={id} />;
}

function DomainLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: domain,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useFitmentDomain(id);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="list"
            title="Could not load this list"
            description="This is a problem reaching the server. The list itself is unaffected — nothing has been lost."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !domain) {
    return <PaneWaiting />;
  }

  return (
    <DomainEditor
      ctx={ctx}
      id={id}
      domain={domain}
      isFetching={isFetching}
      updatedAt={domain ? dataUpdatedAt : undefined}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

function DomainEditor({
  ctx,
  id,
  domain,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  domain?: FitmentDomain;
  /** Only the saved-list state has a query behind it; "new" has none. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateFitmentDomain();
  const update = useUpdateFitmentDomain(id);
  const remove = useDeleteFitmentDomain(id);

  const saved = useMemo(() => (domain ? toDraft(domain) : emptyDraft()), [domain]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New list' : (domain?.displayName ?? 'Compatibility list'));
  }, [ctx, isNew, domain]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setLevel = (index: number, patch: Partial<DimDraft>) => {
    set(
      'levels',
      draft.levels.map((level, i) => (i === index ? { ...level, ...patch } : level))
    );
  };
  const setRange = (index: number, patch: Partial<DimDraft>) => {
    set(
      'ranges',
      draft.ranges.map((range, i) => (i === index ? { ...range, ...patch } : range))
    );
  };

  const nameError = draft.displayName.trim() === '' ? 'Give this list a name.' : null;
  const hasLevel = draft.levels.some((level) => level.label.trim() !== '');
  const levelError = hasLevel ? null : 'Add at least one level — for example “Make”.';

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This list has not been created yet. Close anyway?'
      : 'This list has unsaved changes to its name or shape. Close anyway?'
  );

  const failure =
    create.isError || update.isError
      ? fitmentErrorMessage(
          create.error ?? update.error,
          'Could not save this list. Nothing was changed.'
        )
      : null;

  /* ── Save ─────────────────────────────────────────────────────────────── */

  const submit = () => {
    if (nameError || levelError) return;
    const dimensions = composeDimensions(draft);
    const description = draft.description.trim();

    if (isNew) {
      const slug = slugifyDomain(draft.displayName) || 'list';
      create.mutate(
        {
          slug,
          displayName: draft.displayName.trim(),
          ...(description ? { description } : {}),
          ...(draft.iconKey ? { iconKey: draft.iconKey } : {}),
          dimensions,
        },
        {
          onSuccess: (created) => {
            ctx.open('commerce.fitment.domain.detail', { id: created.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({ title: `${draft.displayName.trim()} created`, type: 'success' });
            });
          },
          onError: shownInPlace,
        }
      );
      return;
    }

    void (async () => {
      try {
        await update.mutateAsync(
          {
            displayName: draft.displayName.trim(),
            description: description === '' ? null : description,
            iconKey: draft.iconKey,
            dimensions,
          },
          { onError: shownInPlace }
        );
        setTouched(false);
        toast.add({ title: 'List saved', type: 'success' });
      } catch {
        // The alert in the body reports it; the draft still holds everything.
      }
    })();
  };

  const onDelete = async () => {
    if (!domain) return;
    const count = domain.rootCount;
    const ok = await confirm({
      title: `Delete ${domain.displayName}?`,
      description: `This removes the whole list — its ${String(count)} top-level ${count === 1 ? 'entry' : 'entries'} and everything under them — and takes it off every product marked as fitting something in it. The products themselves are kept. This cannot be undone.`,
      confirmLabel: 'Delete this list',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${domain.displayName} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this list',
          description: fitmentErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const HeaderIcon = resolveFitmentIcon(domain?.iconKey ?? draft.iconKey);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Compatibility list actions"
        status={
          <>
            <Icon glyph={HeaderIcon} className="size-4 shrink-0" aria-hidden />
            {!isNew && domain ? (
              <Badge color="neutral" variant="soft" size="sm">
                {rootCountLabel(domain)}
              </Badge>
            ) : null}
          </>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(nameError) || Boolean(levelError) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create list' : 'Save'}
          </Button>
        }
        refresh={
          onRefresh ? (
            <RefreshButton
              isFetching={isFetching ?? false}
              updatedAt={updatedAt}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <Text>
              A compatibility list is how your website answers “does this fit what I have?”. You
              describe the kinds of things your products fit — vehicles, phones, machines — and
              shoppers can filter to just the parts that work for them.
            </Text>
          ) : null}

          <SaveFailure title="Could not save this list" message={failure} />

          <FormSection title="Name and picture">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.displayName}
                    placeholder="Vehicles"
                    onChange={(event) => {
                      set('displayName', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>
                  What your team calls this list — “Vehicles”, “Phone models”, “Machines”.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Picture</FieldLabel>
              <FieldDescription>Shown beside the list. Optional.</FieldDescription>
              <div className="grid grid-cols-3 gap-2 @md:grid-cols-4">
                {FITMENT_ICONS.map((choice) => {
                  const selected = draft.iconKey === choice.key;
                  return (
                    <Button
                      key={choice.key}
                      type="button"
                      size="sm"
                      color={selected ? 'module' : 'neutral'}
                      variant={selected ? 'soft' : 'outline'}
                      aria-pressed={selected}
                      className="h-auto flex-col gap-1 py-2"
                      onClick={() => {
                        set('iconKey', selected ? null : choice.key);
                      }}
                    >
                      <Icon glyph={choice.Icon} className="size-5" aria-hidden />
                      <span className="text-xs font-normal">{choice.label}</span>
                    </Button>
                  );
                })}
              </div>
            </Field>

            <Field>
              <FieldLabel>Note</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    placeholder="A line for your team on what this list covers."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>Optional. Only your team sees this.</FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="How it narrows down"
            description="A shopper picks their way down these, step by step — for vehicles that is the make, then the model, then the engine. Add one level for each step, from broadest to most specific."
          >
            <div className="flex flex-col gap-2">
              {draft.levels.map((level, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-sm tabular-nums" aria-hidden>
                    {index + 1}.
                  </span>
                  <Input
                    color="module"
                    size="sm"
                    className="min-w-0 flex-1"
                    value={level.label}
                    aria-label={`Level ${String(index + 1)} name`}
                    placeholder={index === 0 ? 'Make' : index === 1 ? 'Model' : 'Engine'}
                    onChange={(event) => {
                      setLevel(index, { label: event.target.value });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    color="danger"
                    shape="square"
                    disabled={draft.levels.length === 1}
                    aria-label={`Remove level ${String(index + 1)}`}
                    title={
                      draft.levels.length === 1
                        ? 'A list needs at least one level'
                        : 'Remove this level'
                    }
                    onClick={() => {
                      set(
                        'levels',
                        draft.levels.filter((_, i) => i !== index)
                      );
                    }}
                  >
                    <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            {levelError && touched ? <p className="text-error text-sm">{levelError}</p> : null}
            {!isNew ? (
              <Text className="text-sm">
                Removing a level that already has entries is not allowed — clear those entries
                first.
              </Text>
            ) : null}
            <div>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                onClick={() => {
                  set('levels', [...draft.levels, { key: null, label: '', unit: '' }]);
                }}
              >
                <Icon glyph={faPlus} className="size-4" aria-hidden />
                Add another level
              </Button>
            </div>
          </FormSection>

          <FormSection
            title="Number ranges"
            description="Optional. Some things are narrowed by a span of numbers rather than a fixed choice — a range of years, a weight limit. Add one for each."
          >
            {draft.ranges.length === 0 ? (
              <Text className="text-sm">
                None yet. Most lists do not need any — add one only if a product fits, say, a range
                of model years.
              </Text>
            ) : (
              <div className="flex flex-col gap-2">
                {draft.ranges.map((range, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      color="module"
                      size="sm"
                      className="min-w-0 flex-1"
                      value={range.label}
                      aria-label={`Range ${String(index + 1)} name`}
                      placeholder="Year"
                      onChange={(event) => {
                        setRange(index, { label: event.target.value });
                      }}
                    />
                    <Input
                      color="module"
                      size="sm"
                      className="w-28 shrink-0"
                      value={range.unit}
                      aria-label={`Range ${String(index + 1)} unit`}
                      placeholder="Unit (year)"
                      onChange={(event) => {
                        setRange(index, { unit: event.target.value });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      color="danger"
                      shape="square"
                      aria-label={`Remove range ${String(index + 1)}`}
                      title="Remove this range"
                      onClick={() => {
                        set(
                          'ranges',
                          draft.ranges.filter((_, i) => i !== index)
                        );
                      }}
                    >
                      <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                onClick={() => {
                  set('ranges', [...draft.ranges, { key: null, label: '', unit: '' }]);
                }}
              >
                <Icon glyph={faPlus} className="size-4" aria-hidden />
                Add a number range
              </Button>
            </div>
          </FormSection>

          {isNew ? (
            <Text className="text-sm">
              Create the list and you can start adding its entries — the makes, models and engines
              shoppers pick from.
            </Text>
          ) : domain ? (
            <FitmentNodeManager domain={domain} />
          ) : null}

          {!isNew && domain ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting removes this whole list and takes it off every product using it.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                loading={remove.isPending}
                onClick={() => {
                  void onDelete();
                }}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                Delete this list
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
