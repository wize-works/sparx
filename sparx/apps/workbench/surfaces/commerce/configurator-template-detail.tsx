'use client';

// One build-to-order template — set it up, then manage it. Catalog-wide.
//
// Create and manage are the same surface: `{ id: 'new' }` sets one up (starting
// by choosing the product it is for), `{ id }` manages it. A build is the
// QUESTIONS a shopper answers, the price each answer adds, the RULES between the
// questions, and — the part that makes the rest checkable — the ability to answer
// the questions yourself and see exactly what a shopper would get.
//
// This is the standalone counterpart to the product-scoped configurator pane. It
// shares its data shapes so the two never drift; what differs is that this one
// opens on ANY product, chosen at creation.
//
// Two things are shown but not edited here, and both boundaries are real: the
// RULES (created with a visual builder that is a job of its own — they are shown
// as plain English and can be removed) and a choice's linked product VARIANT or
// color SWATCH (a cross-product concern). Neither is dropped on save — whole
// objects are carried through untouched, so editing a subset never deletes the
// rest.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  SearchInput,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ArrowDown, ArrowUp, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  formatCents,
  productErrorMessage,
  useConfiguratorPreview,
  type ConfiguratorChoice,
  type ConfiguratorOption,
  type ConfiguratorOptionType,
  type ConfiguratorPreview,
  type ConfiguratorRule,
  type ConfiguratorTemplate,
  type ProductRow,
  type Tone,
} from './products-data';
import {
  templateErrorMessage,
  useConfiguratorTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useUpdateTemplate,
  type ConfiguratorAddOnInput,
} from './configurator-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';
const NEW = 'new';

const QUESTION_KINDS: Record<string, string> = {
  single_choice: 'Pick one of several',
  multi_choice: 'Pick any number of them',
  toggle: 'Yes or no',
  quantity: 'A quantity',
  text: 'Something they type',
  color_swatch: 'Pick a color',
  image_picker: 'Pick a picture',
};

const CREATABLE_KINDS: ConfiguratorOptionType[] = [
  'single_choice',
  'multi_choice',
  'toggle',
  'quantity',
  'text',
];

function kindLabel(type: string): string {
  return QUESTION_KINDS[type] ?? type;
}

function hasChoices(type: string): boolean {
  return (
    type === 'single_choice' ||
    type === 'multi_choice' ||
    type === 'color_swatch' ||
    type === 'image_picker'
  );
}

function statusMeaning(status: string): { label: string; tone: Tone; detail: string } {
  if (status === 'active') {
    return {
      label: 'Live',
      tone: 'success',
      detail: 'Shoppers are asked these questions when they buy this product.',
    };
  }
  if (status === 'archived') {
    return {
      label: 'Retired',
      tone: 'neutral',
      detail:
        'Nobody is asked these questions any more. Past orders that used this build keep their record of what was chosen.',
    };
  }
  return {
    label: 'Not live',
    tone: 'info',
    detail:
      'Saved but not in use — shoppers buy this product the ordinary way until you make it live.',
  };
}

function deltaLabel(cents: number | undefined, currency: string): string | null {
  if (cents === undefined || cents === 0) return null;
  return cents > 0 ? `+${formatCents(cents, currency)}` : `−${formatCents(-cents, currency)}`;
}

function mintKey(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'item';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${String(n)}`)) n += 1;
  return `${base}_${String(n)}`;
}

/** One rule as a plain-English sentence, against the LABELS not the keys. */
function ruleSentence(
  rule: ConfiguratorRule,
  options: ConfiguratorOption[],
  currency: string
): string {
  const labelOf = (key: string) => options.find((o) => o.key === key)?.label ?? key;
  const answerOf = (optionKey: string, choiceKey: string) =>
    options.find((o) => o.key === optionKey)?.choices.find((c) => c.key === choiceKey)?.label ??
    choiceKey;

  const conditions = rule.conditions.map((condition) => {
    const question = labelOf(condition.optionKey);
    const values = Array.isArray(condition.value)
      ? condition.value.map((v) => answerOf(condition.optionKey, v)).join(' or ')
      : answerOf(condition.optionKey, String(condition.value));
    switch (condition.op) {
      case 'not_in':
        return `${question} is not ${values}`;
      case 'gt':
        return `${question} is more than ${values}`;
      case 'lt':
        return `${question} is less than ${values}`;
      default:
        return `${question} is ${values}`;
    }
  });

  const actions = rule.actions.map((action) => {
    switch (action.kind) {
      case 'require':
        return `${labelOf(action.optionKey)} must be answered`;
      case 'hide':
        return `${labelOf(action.optionKey)} is not asked`;
      case 'show_only_choices':
        return `${labelOf(action.optionKey)} only offers ${action.choiceKeys
          .map((key) => answerOf(action.optionKey, key))
          .join(', ')}`;
      case 'price_adjust':
        return `the price changes by ${deltaLabel(action.deltaCents, currency) ?? 'nothing'}${
          action.label ? ` (${action.label})` : ''
        }`;
      case 'add_addon':
        return `an extra is added to the order`;
      default:
        return `it is refused: “${action.message}”`;
    }
  });

  const joiner = rule.match === 'any' ? ' or ' : ' and ';
  return `When ${conditions.join(joiner)}, ${actions.join(' and ')}.`;
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  id: string;
  productId: string;
  productTitle: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  options: ConfiguratorOption[];
  rules: ConfiguratorRule[];
  /** Carried whole and sent back untouched — this editor does not build add-ons. */
  addOns: ConfiguratorAddOnInput[];
}

function toDraft(template: ConfiguratorTemplate): Draft {
  return {
    id: template.id,
    productId: template.productId,
    productTitle: template.productTitle,
    name: template.name,
    description: template.description ?? '',
    status:
      template.status === 'active' || template.status === 'archived' ? template.status : 'draft',
    options: template.options,
    rules: template.rules,
    addOns: template.addOns.map((a) => ({
      variantId: a.variantId,
      defaultIncluded: a.defaultIncluded,
      ...(a.priceOverrideCents === undefined ? {} : { priceOverrideCents: a.priceOverrideCents }),
    })),
  };
}

function newDraft(productId: string, productTitle: string): Draft {
  return {
    id: NEW,
    productId,
    productTitle,
    name: `How to build ${productTitle}`,
    description: '',
    status: 'draft',
    options: [],
    rules: [],
    addOns: [],
  };
}

function fingerprint(draft: Draft): string {
  return JSON.stringify(draft);
}

function blockingReason(draft: Draft): string | null {
  if (draft.productId === '') return 'Choose the product this build is for.';
  if (draft.name.trim() === '') return 'Give this build a name before saving it.';
  if (draft.options.length === 0) {
    return 'Add at least one question — a build with nothing to answer is not a build.';
  }
  if (draft.options.some((option) => option.label.trim() === '')) {
    return 'One of your questions has no wording yet, so a shopper would be asked a blank question.';
  }
  if (draft.options.some((option) => hasChoices(option.type) && option.choices.length === 0)) {
    return 'One of your questions offers nothing to choose from, so nobody could answer it.';
  }
  const blankAnswer = draft.options.find(
    (option) =>
      hasChoices(option.type) && option.choices.some((choice) => choice.label.trim() === '')
  );
  if (blankAnswer) {
    return `One of the answers under “${blankAnswer.label.trim() || 'a question'}” has no wording, so it would appear on your website as a blank option.`;
  }
  return null;
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function ConfiguratorTemplateDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : NEW;
  return id === NEW ? <CreateFlow ctx={ctx} /> : <ManageFlow ctx={ctx} id={id} />;
}

/* ── Create: pick a product, then edit ──────────────────────────────────── */

function CreateFlow({ ctx }: { ctx: SurfaceContext }) {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    ctx.setTitle('New build');
  }, [ctx]);

  if (draft === null) {
    return (
      <div className={PANE_SHELL}>
        <PaneToolbar label="Build actions">
          <span className="ml-auto" />
        </PaneToolbar>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Set up a build
              </Heading>
              <Text>
                A build turns a product into something a shopper makes to order. Start by choosing
                the product it is for.
              </Text>
            </div>
            <FormSection title="Which product">
              <ProductPicker
                onPick={(product) => {
                  setDraft(newDraft(product.id, product.title));
                }}
              />
            </FormSection>
          </div>
        </div>
      </div>
    );
  }

  return <Editor ctx={ctx} draft={draft} setDraft={setDraft} saved={null} />;
}

/* ── Manage: load then edit ─────────────────────────────────────────────── */

function ManageFlow({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: template, isPending, isError, error, refetch } = useConfiguratorTemplate(id);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    ctx.setTitle(template ? template.name : 'Build');
  }, [ctx, template]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="build"
        title="Could not load this build"
        description="This is a problem reaching the server. The build itself is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !template) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const editing = draft ?? toDraft(template);
  return <Editor ctx={ctx} draft={editing} setDraft={setDraft} saved={template} />;
}

/* ── The editor ─────────────────────────────────────────────────────────── */

function Editor({
  ctx,
  draft,
  setDraft,
  saved,
}: {
  ctx: SurfaceContext;
  draft: Draft;
  setDraft: (next: Draft | null) => void;
  saved: ConfiguratorTemplate | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const currency = 'USD';

  const create = useCreateTemplate();
  const update = useUpdateTemplate(draft.id === NEW ? '' : draft.id);
  const remove = useDeleteTemplate(draft.id === NEW ? '' : draft.id);

  const isNew = draft.id === NEW;
  const status = statusMeaning(draft.status);
  const blocked = blockingReason(draft);
  const dirty = isNew || saved === null || fingerprint(draft) !== fingerprint(toDraft(saved));
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This build has not been set up yet. Close anyway?'
      : 'This build has unsaved changes. Close anyway?'
  );

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
  };

  const failure =
    create.isError || update.isError
      ? templateErrorMessage(
          create.error ?? update.error,
          'Could not save this build. Nothing was changed.'
        )
      : null;

  const save = () => {
    if (blocked !== null) return;
    const options = draft.options.map((option, index) => ({ ...option, position: index }));
    if (isNew) {
      create.mutate(
        {
          productId: draft.productId,
          name: draft.name.trim(),
          description: draft.description.trim() === '' ? null : draft.description.trim(),
          options,
          rules: draft.rules,
          addOns: draft.addOns,
        },
        {
          onSuccess: (created) => {
            ctx.open(
              'commerce.configurator-template.detail',
              { id: created.id },
              { target: 'replace' }
            );
            afterPaneChange(() => {
              toast.add({ title: 'Build set up', type: 'success' });
            });
          },
        }
      );
      return;
    }
    update.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        status: draft.status,
        options,
        rules: draft.rules,
        addOns: draft.addOns,
      },
      {
        onSuccess: () => {
          setDraft(null);
          afterPaneChange(() => {
            toast.add({ title: 'Build saved', type: 'success' });
          });
        },
      }
    );
  };

  const onDelete = async () => {
    if (saved === null) return;
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      description: `Every question, answer and rule in this build goes with it, and ${draft.productTitle} goes back to being bought the ordinary way. Orders already placed keep their record of what was chosen. This cannot be undone — make it not live instead if you might use it again.`,
      confirmLabel: 'Delete this build',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `“${draft.name}” deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this build',
          description: templateErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const addQuestion = () => {
    const key = mintKey(
      `question ${String(draft.options.length + 1)}`,
      draft.options.map((option) => option.key)
    );
    set({
      options: [
        ...draft.options,
        {
          key,
          label: '',
          type: 'single_choice',
          required: false,
          defaultChoiceKeys: [],
          position: draft.options.length,
          choices: [],
        },
      ],
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar label="Build actions">
        <Badge color={status.tone} variant="soft" size="sm">
          {status.label}
        </Badge>
        <Button
          color="module"
          size="sm"
          className="ml-auto"
          loading={saving}
          disabled={blocked !== null || (!isNew && !dirty)}
          onClick={save}
        >
          {isNew ? 'Set up build' : 'Save'}
        </Button>
      </PaneToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {isNew ? draft.name || 'New build' : draft.name}
            </Heading>
            <Text>
              For {draft.productTitle}. {status.detail}
            </Text>
          </div>

          <SaveFailure title="Could not save this build" message={failure} />

          {blocked !== null && dirty ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Not ready to save</AlertTitle>
                <AlertDescription>{blocked}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="About this build">
            <Field>
              <FieldLabel>What you call it</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    onChange={(event) => {
                      set({ name: event.target.value });
                    }}
                  />
                }
              />
              <FieldDescription>
                For you, not for shoppers — it is how you tell one build from another.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Notes (optional)</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    onChange={(event) => {
                      set({ description: event.target.value });
                    }}
                  />
                }
              />
            </Field>

            {isNew ? null : (
              <Field>
                <FieldLabel>Is it in use?</FieldLabel>
                <Select
                  color="module"
                  items={{
                    draft: 'Not live — nobody is asked these questions',
                    active: 'Live — shoppers answer these when they buy',
                    archived: 'Retired — kept for the record only',
                  }}
                  value={draft.status}
                  aria-label="Is it in use?"
                  onValueChange={(next) => {
                    set({ status: next as Draft['status'] });
                  }}
                />
                <FieldDescription>{status.detail}</FieldDescription>
              </Field>
            )}
          </FormSection>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading level={2} className="text-lg font-semibold">
              What you ask them
            </Heading>
            <Button size="sm" variant="outline" color="module" onClick={addQuestion}>
              <Plus className="size-4" aria-hidden />
              Add a question
            </Button>
          </div>

          {draft.options.length === 0 ? (
            <Text>
              A build is a list of questions. Add the first one — “what size?”, “what finish?”, “do
              you want it engraved?” — and the answers a customer can give.
            </Text>
          ) : (
            draft.options.map((option, index) => (
              <QuestionCard
                key={option.key}
                option={option}
                index={index}
                total={draft.options.length}
                currency={currency}
                onChange={(next) => {
                  set({
                    options: draft.options.map((candidate, i) => (i === index ? next : candidate)),
                  });
                }}
                onRemove={() => {
                  set({
                    options: draft.options.filter((_, i) => i !== index),
                    rules: draft.rules.filter(
                      (rule) =>
                        !rule.conditions.some((c) => c.optionKey === option.key) &&
                        !rule.actions.some((a) => 'optionKey' in a && a.optionKey === option.key)
                    ),
                  });
                }}
                onMove={(delta) => {
                  const next = [...draft.options];
                  const target = index + delta;
                  const moved = next[index];
                  const displaced = next[target];
                  if (!moved || !displaced) return;
                  next[index] = displaced;
                  next[target] = moved;
                  set({ options: next });
                }}
              />
            ))
          )}

          {draft.rules.length > 0 ? (
            <FormSection
              title="Rules between the questions"
              description="These run as soon as a customer answers. They are set up with a visual builder elsewhere; here you can read them and remove any you no longer want."
            >
              {draft.rules.map((rule, index) => (
                <div
                  key={`${rule.name}-${String(index)}`}
                  className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b py-2 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Text className="font-semibold">{rule.name}</Text>
                    <Text className="text-sm">{ruleSentence(rule, draft.options, currency)}</Text>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="danger"
                    shape="square"
                    aria-label={`Remove the rule ${rule.name}`}
                    title="Remove this rule"
                    onClick={() => {
                      set({ rules: draft.rules.filter((_, i) => i !== index) });
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </FormSection>
          ) : null}

          {saved !== null ? (
            <TryItPanel template={saved} currency={currency} stale={dirty} />
          ) : null}

          {isNew ? null : (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting removes this build and every question in it for good. Making it not live is
                the reversible version.
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
                <Trash2 className="size-4" aria-hidden />
                Delete this build
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── One answer ─────────────────────────────────────────────────────────── */

function ChoiceRow({
  choice,
  currency,
  onChange,
  onRemove,
}: {
  choice: ConfiguratorChoice;
  currency: string;
  onChange: (next: ConfiguratorChoice) => void;
  onRemove: () => void;
}) {
  const deltaText =
    choice.priceDeltaCents === undefined ? '' : String((choice.priceDeltaCents / 100).toFixed(2));

  return (
    <div className="border-base-300 flex flex-wrap items-end gap-2 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Field>
          <FieldLabel>Answer</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                size="sm"
                value={choice.label}
                placeholder="Oak"
                onChange={(event) => {
                  onChange({ ...choice, label: event.target.value });
                }}
              />
            }
          />
        </Field>
      </div>
      <div className="w-32">
        <Field>
          <FieldLabel>Adds to price</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                size="sm"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={deltaText}
                placeholder="0.00"
                onChange={(event) => {
                  const value = event.target.value;
                  const parsed = Number(value);
                  onChange({
                    ...choice,
                    priceDeltaCents:
                      value.trim() === '' || !Number.isFinite(parsed)
                        ? undefined
                        : Math.round(parsed * 100),
                  });
                }}
              />
            }
          />
        </Field>
      </div>
      <Button
        size="sm"
        variant="ghost"
        color="danger"
        shape="square"
        aria-label={`Remove the answer ${choice.label || 'without a name'}`}
        title="Remove this answer"
        onClick={onRemove}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      {deltaLabel(choice.priceDeltaCents, currency) === null ? null : (
        <Text className="w-full text-sm">
          Choosing this changes the price by {deltaLabel(choice.priceDeltaCents, currency)}.
        </Text>
      )}
    </div>
  );
}

/* ── One question ───────────────────────────────────────────────────────── */

function QuestionCard({
  option,
  index,
  total,
  currency,
  onChange,
  onRemove,
  onMove,
}: {
  option: ConfiguratorOption;
  index: number;
  total: number;
  currency: string;
  onChange: (next: ConfiguratorOption) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const kindItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const kind of CREATABLE_KINDS) items[kind] = kindLabel(kind);
    if (!CREATABLE_KINDS.includes(option.type)) items[option.type] = kindLabel(option.type);
    return items;
  }, [option.type]);

  const canChangeKind = CREATABLE_KINDS.includes(option.type);

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <Heading level={3} className="min-w-0 text-lg font-semibold">
          {option.label || 'A question with no wording yet'}
        </Heading>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            disabled={index === 0}
            aria-label="Ask this question earlier"
            title="Ask this earlier"
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
            disabled={index === total - 1}
            aria-label="Ask this question later"
            title="Ask this later"
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
            aria-label={`Remove the question ${option.label || 'without wording'}`}
            title="Remove this question"
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <Field>
        <FieldLabel>What you ask</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              size="sm"
              value={option.label}
              placeholder="What finish would you like?"
              onChange={(event) => {
                onChange({ ...option, label: event.target.value });
              }}
            />
          }
        />
        <FieldDescription>Shown to the shopper exactly as written.</FieldDescription>
      </Field>

      <div className="grid gap-3 @md:grid-cols-2">
        <Field>
          <FieldLabel>How they answer</FieldLabel>
          <Select
            color="module"
            size="sm"
            items={kindItems}
            value={option.type}
            disabled={!canChangeKind}
            aria-label="How they answer"
            onValueChange={(next) => {
              onChange({ ...option, type: next as ConfiguratorOptionType });
            }}
          />
          <FieldDescription>
            {canChangeKind
              ? 'Changing this keeps the answers you have already written.'
              : 'This kind of question is set up elsewhere, so it cannot be changed here — everything else about it can.'}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>They must answer it</FieldLabel>
          <Switch
            color="module"
            checked={option.required}
            aria-label="They must answer it"
            onCheckedChange={(next: boolean) => {
              onChange({ ...option, required: next });
            }}
          />
          <FieldDescription>
            {option.required
              ? 'They cannot add this to their basket without answering.'
              : 'They can skip it.'}
          </FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Extra explanation (optional)</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              size="sm"
              value={option.helpText ?? ''}
              placeholder="Oak takes an extra week to make"
              onChange={(event) => {
                const value = event.target.value;
                onChange({ ...option, helpText: value.trim() === '' ? undefined : value });
              }}
            />
          }
        />
        <FieldDescription>
          Shown under the question, for anything that needs saying.
        </FieldDescription>
      </Field>

      {hasChoices(option.type) ? (
        <div className="flex flex-col gap-2">
          <Text className="font-semibold">Their choices</Text>
          {option.choices.length === 0 ? (
            <Text className="text-sm">
              Nothing to choose from yet, so nobody can answer this. Add at least one.
            </Text>
          ) : (
            option.choices.map((choice, choiceIndex) => (
              <ChoiceRow
                key={choice.key}
                choice={choice}
                currency={currency}
                onChange={(next) => {
                  onChange({
                    ...option,
                    choices: option.choices.map((candidate, i) =>
                      i === choiceIndex ? next : candidate
                    ),
                  });
                }}
                onRemove={() => {
                  onChange({
                    ...option,
                    choices: option.choices.filter((_, i) => i !== choiceIndex),
                    defaultChoiceKeys: option.defaultChoiceKeys.filter((key) => key !== choice.key),
                  });
                }}
              />
            ))
          )}
          <Button
            size="sm"
            variant="outline"
            color="module"
            className="self-start"
            onClick={() => {
              const key = mintKey(
                `choice ${String(option.choices.length + 1)}`,
                option.choices.map((choice) => choice.key)
              );
              onChange({
                ...option,
                choices: [...option.choices, { key, label: '', position: option.choices.length }],
              });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add an answer
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* ── Trying it ──────────────────────────────────────────────────────────── */

type Selections = Record<string, string | string[] | number | boolean>;

function TryItPanel({
  template,
  currency,
  stale,
}: {
  template: ConfiguratorTemplate;
  currency: string;
  stale: boolean;
}) {
  const preview = useConfiguratorPreview();
  const [selections, setSelections] = useState<Selections>(() => {
    const initial: Selections = {};
    for (const option of template.options) {
      if (option.type === 'multi_choice') initial[option.key] = option.defaultChoiceKeys;
      else if (option.type === 'toggle') initial[option.key] = false;
      else if (option.type === 'quantity') initial[option.key] = 1;
      else if (option.type === 'text') initial[option.key] = '';
      else initial[option.key] = option.defaultChoiceKeys[0] ?? option.choices[0]?.key ?? '';
    }
    return initial;
  });
  const [result, setResult] = useState<ConfiguratorPreview | null>(null);

  const set = useCallback((key: string, value: Selections[string]) => {
    setSelections((current) => ({ ...current, [key]: value }));
    setResult(null);
  }, []);

  const run = () => {
    preview.mutate(
      { templateId: template.id, selections },
      {
        onSuccess: (next) => {
          setResult(next);
        },
      }
    );
  };

  return (
    <FormSection
      title="Try it yourself"
      description="Answer the questions the way a customer would. Nothing is bought and nothing is saved — this just runs your rules and shows what they produce."
    >
      {stale ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>This tries the saved version</AlertTitle>
            <AlertDescription>
              You have changes you have not saved yet, so what you see here is the build as it
              currently stands on your website — not the one on screen above.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {template.options.map((option) => (
        <Field key={option.key}>
          <FieldLabel>{option.label}</FieldLabel>
          {option.type === 'toggle' ? (
            <Switch
              color="module"
              checked={selections[option.key] === true}
              aria-label={option.label}
              onCheckedChange={(next: boolean) => {
                set(option.key, next);
              }}
            />
          ) : option.type === 'quantity' ? (
            <FieldControl
              render={
                <Input
                  color="module"
                  size="sm"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={String(selections[option.key] ?? 1)}
                  onChange={(event) => {
                    set(option.key, Number(event.target.value));
                  }}
                />
              }
            />
          ) : option.type === 'text' ? (
            <FieldControl
              render={
                <Input
                  color="module"
                  size="sm"
                  value={String(selections[option.key] ?? '')}
                  onChange={(event) => {
                    set(option.key, event.target.value);
                  }}
                />
              }
            />
          ) : option.type === 'multi_choice' ? (
            <div className="flex flex-col gap-1">
              {option.choices.map((choice) => {
                const chosen = selections[option.key];
                const list = Array.isArray(chosen) ? chosen : [];
                return (
                  <label key={choice.key} className="flex items-center gap-2">
                    <Checkbox
                      color="module"
                      checked={list.includes(choice.key)}
                      aria-label={choice.label}
                      onChange={(event) => {
                        set(
                          option.key,
                          event.target.checked
                            ? [...list, choice.key]
                            : list.filter((key) => key !== choice.key)
                        );
                      }}
                    />
                    <Text as="span">
                      {choice.label}
                      {deltaLabel(choice.priceDeltaCents, currency) === null
                        ? ''
                        : ` · ${deltaLabel(choice.priceDeltaCents, currency) ?? ''}`}
                    </Text>
                  </label>
                );
              })}
            </div>
          ) : (
            <Select
              color="module"
              size="sm"
              items={Object.fromEntries(
                option.choices.map((choice) => [
                  choice.key,
                  deltaLabel(choice.priceDeltaCents, currency) === null
                    ? choice.label
                    : `${choice.label} · ${deltaLabel(choice.priceDeltaCents, currency) ?? ''}`,
                ])
              )}
              value={String(selections[option.key] ?? '')}
              aria-label={option.label}
              onValueChange={(next) => {
                set(option.key, next as string);
              }}
            />
          )}
          {option.helpText ? <FieldDescription>{option.helpText}</FieldDescription> : null}
        </Field>
      ))}

      <Button
        size="sm"
        color="module"
        className="self-start"
        loading={preview.isPending}
        onClick={run}
      >
        <FlaskConical className="size-4" aria-hidden />
        See what they would get
      </Button>

      {preview.isError ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>Could not work that out</AlertTitle>
            <AlertDescription>
              {productErrorMessage(
                preview.error,
                'This is a problem reaching the server. Nothing has been changed.'
              )}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : result === null ? null : result.errors.length > 0 ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>A customer could not buy this combination</AlertTitle>
            <AlertDescription>
              {result.errors.join(' ')} This is what they would be told, in these words.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <div className="border-base-300 flex flex-col gap-2 rounded-lg border p-3">
          <Text className="text-2xl font-semibold">
            {formatCents(result.basePriceCents + result.totalAdjustmentCents, currency)}
          </Text>
          <Text className="text-sm">
            {formatCents(result.basePriceCents, currency)} to start
            {result.totalAdjustmentCents === 0
              ? ''
              : `, ${deltaLabel(result.totalAdjustmentCents, currency) ?? ''} from what they chose`}
            {result.resolvedSku ? ` · goes out as ${result.resolvedSku}` : ''}
          </Text>
          {result.addOnLines.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Text className="font-semibold">Also added to their order</Text>
              {result.addOnLines.map((line) => (
                <Text key={`${line.variantId}-${line.label ?? ''}`} className="text-sm">
                  {line.quantity} × {line.label ?? line.variantId} ·{' '}
                  {formatCents(line.unitPriceCents, currency)} each
                </Text>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </FormSection>
  );
}

/* ── Product picker (create only) ───────────────────────────────────────── */

function ProductPicker({ onPick }: { onPick: (product: ProductRow) => void }) {
  const [search, setSearch] = useState('');
  const { data, isPending, isError } = useQuery({
    queryKey: ['commerce', 'products', 'configurator-product-search', { q: search }],
    queryFn: () =>
      api.list<ProductRow>('/v1/commerce/products', {
        ...(search.trim() ? { q: search.trim() } : {}),
        take: 30,
      }),
    staleTime: 30_000,
  });
  const results = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-sm min-w-0">
        <SearchInput
          size="sm"
          aria-label="Search products"
          placeholder="Search your products…"
          value={search}
          onValueChange={setSearch}
        />
      </div>
      {isError ? (
        <Text className="text-sm">
          Your products could not be searched just now. Try again in a moment.
        </Text>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Searching…
        </Text>
      ) : results.length === 0 ? (
        <Text className="text-sm">
          {search.trim()
            ? `No product matches “${search.trim()}”.`
            : 'Start typing to find the product this build is for.'}
        </Text>
      ) : (
        <div className="border-base-300 max-h-72 overflow-y-auto rounded border p-1">
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              className="hover:bg-base-200 flex w-full items-center gap-3 rounded px-2 py-2 text-left"
              onClick={() => {
                onPick(product);
              }}
            >
              <span className="min-w-0 flex-1 font-medium">{product.title}</span>
              {product.status === 'archived' ? (
                <Badge color="neutral" variant="soft" size="sm">
                  Retired
                </Badge>
              ) : product.status === 'draft' ? (
                <Badge color="info" variant="soft" size="sm">
                  Not on sale
                </Badge>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
