'use client';

// CONFIGURATOR — the questions a shopper answers when this product is built to
// order, what each answer adds to the price, and the rules between them.
//
// A product-scoped facet pane, implementing the contract in product-scope.tsx
// verbatim.
//
// ── What this pane is FOR ────────────────────────────────────────────────
//
// A build is three things and this pane is all three: the QUESTIONS (with their
// answers and prices), the RULES that relate one question to another, and — the
// part that makes the other two checkable — the ability to answer the questions
// yourself and see exactly what a shopper would get. A rule engine you can only
// read as a list of rules cannot actually be verified: the way a configurator
// fails is a combination nobody tried, and the only honest way to find those is
// to try them. `POST /v1/commerce/configurator/preview` exists for that.
//
// ── Keys are machinery and never appear on screen ────────────────────────
//
// Every question and answer carries a `key` the rules refer to. It is derived
// once from the label and then frozen — renaming "Color" to "Finish" must not
// silently break every rule pointing at it. Nobody is ever shown or asked for
// one; the audience owns a business, not a schema.
//
// ── What this pane deliberately does NOT edit ────────────────────────────
//
// Two things are shown in full and preserved byte-for-byte on save, but not
// editable here, and both boundaries are real rather than unfinished work:
//
//   • ADD-ON EXTRAS pull in a DIFFERENT product's variant. Choosing one needs a
//     catalog-wide variant picker, which is a cross-product surface and not a
//     thing a product-scoped pane should grow its own copy of.
//   • COLOR-SWATCH and IMAGE answers need to paint an arbitrary shopper-chosen
//     color or image into a control, which cannot be done without an inline
//     style or an uploaded asset. Existing ones keep their type and are fully
//     editable in every other respect.
//
// Neither is dropped on save: the draft carries whole rule and option objects
// and sends them back untouched. Editing a subset must never silently delete
// the rest.

import { shownInPlace } from '@wizeworks/query';
import { useCallback, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsTab,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faArrowDown,
  faArrowUp,
  faCubes,
  faFlask,
  faFloppyDisk,
  faPlus,
  faRotateLeft,
  faSliders,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { FormSection } from '../../components/form-section';
import { MoneyTextInput, moneyCents } from '../../components/money-input';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  FollowingNotice,
  ProductScopeFallback,
  useProductScope,
  type ProductScope,
} from './product-scope';
import {
  formatCents,
  productErrorMessage,
  useConfiguratorPreview,
  useConfiguratorTemplate,
  useCreateConfiguratorTemplate,
  useDeleteConfiguratorTemplate,
  useProductBundles,
  useProductTemplates,
  useUpdateConfiguratorTemplate,
  type Bundle,
  type ConfiguratorChoice,
  type ConfiguratorOption,
  type ConfiguratorOptionType,
  type ConfiguratorPreview,
  type ConfiguratorRule,
  type ConfiguratorTemplate,
  type Tone,
} from './products-data';
import { PaneEmpty } from '../../components/pane-empty';
import { PaneLoadError } from '../../components/pane-load-error';

const LABEL = 'Configurator';
/** Registry module for this pane, so the brand draws Sell's own picture rather
 *  than the generic one. */
const MODULE = 'commerce';
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

type ReadyScope = Extract<ProductScope, { state: 'ready' }>;

/** The id a not-yet-created build carries, so create and manage are ONE editor
 *  in two states rather than two forms kept in sync forever. */
const NEW = 'new';

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

/** How a question is asked, in the words of someone setting one up. The stored
 *  values are `single_choice` and friends; nobody is ever shown those. */
const QUESTION_KINDS: Record<string, string> = {
  single_choice: 'Pick one of several',
  multi_choice: 'Pick any number of them',
  toggle: 'Yes or no',
  quantity: 'A quantity',
  text: 'Something they type',
  color_swatch: 'Pick a color',
  image_picker: 'Pick a picture',
};

/** The kinds this editor can create. The other two need to paint an arbitrary
 *  color or image into a control, which is a design decision beyond this pane —
 *  existing questions of those kinds keep working and stay editable. */
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

/** Whether a question is answered by choosing from a list. */
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
      'Saved but not in use — shoppers buy this product the ordinary way until you make this build live.',
  };
}

/** A price difference in the words a shopper would read. */
function deltaLabel(cents: number | undefined, currency: string): string | null {
  if (cents === undefined || cents === 0) return null;
  return cents > 0 ? `+${formatCents(cents, currency)}` : `−${formatCents(-cents, currency)}`;
}

/* ── Rules, said out loud ───────────────────────────────────────────────── */

/**
 * One rule as a sentence.
 *
 * A rule stored as `{optionKey, op, value}` is unreadable to the person who
 * wrote it, let alone a colleague. Every rule in this pane is rendered as
 * English against the question and answer LABELS, never the keys.
 */
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

interface TemplateDraft {
  /** The template being edited, or NEW while it does not exist yet. */
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  options: ConfiguratorOption[];
  /** Carried whole and returned whole — including rule kinds this editor does
   *  not build, which must survive a save made from here. */
  rules: ConfiguratorRule[];
}

function toDraft(template: ConfiguratorTemplate): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? '',
    status:
      template.status === 'active' || template.status === 'archived' ? template.status : 'draft',
    options: template.options,
    rules: template.rules,
  };
}

function emptyDraft(productTitle: string): TemplateDraft {
  return {
    id: NEW,
    name: `How to build ${productTitle}`,
    description: '',
    status: 'draft',
    options: [],
    rules: [],
  };
}

/** A stable machine name for a label, unique within the set it joins. Derived
 *  once and then frozen — renaming a question must not break the rules that
 *  point at it. */
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

function fingerprint(draft: TemplateDraft): string {
  return JSON.stringify(draft);
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
              <MoneyTextInput
                color="module"
                size="sm"
                aria-label="Adds to price"
                text={deltaText}
                onTextChange={(text) => {
                  onChange({ ...choice, priceDeltaCents: moneyCents(text) ?? undefined });
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
        <Icon glyph={faTrashCan} className="size-4" aria-hidden />
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
  // The stored type is always offered, even when this editor cannot create it —
  // otherwise opening an existing color question and saving would quietly
  // change what it is.
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
            shape="square"
            disabled={index === 0}
            aria-label="Ask this question earlier"
            title="Ask this earlier"
            onClick={() => {
              onMove(-1);
            }}
          >
            <Icon glyph={faArrowUp} className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            disabled={index === total - 1}
            aria-label="Ask this question later"
            title="Ask this later"
            onClick={() => {
              onMove(1);
            }}
          >
            <Icon glyph={faArrowDown} className="size-4" aria-hidden />
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
            <Icon glyph={faTrashCan} className="size-4" aria-hidden />
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
                    // A default pointing at an answer that no longer exists is a
                    // build that fails on the shopper rather than here.
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
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Add an answer
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* ── Trying it ──────────────────────────────────────────────────────────── */

type Selections = Record<string, string | string[] | number | boolean>;

/**
 * Answer the questions yourself and see what a shopper would get.
 *
 * Runs the real engine over the SAVED build, which is why it says so plainly
 * when there are unsaved changes: previewing a draft would be answering
 * questions that do not exist yet and reporting a price nobody could be charged.
 */
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
    // The answer changed, so the last result is about a different question set.
    // Leaving it on screen would be a price for something nobody asked for.
    setResult(null);
  }, []);

  const run = () => {
    preview.mutate(
      { templateId: template.id, selections },
      {
        onSuccess: (next) => {
          setResult(next);
        },
        onError: shownInPlace,
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
        <Icon glyph={faFlask} className="size-4" aria-hidden />
        See what they would get
      </Button>

      {/* ONE message. A generic "something went wrong" above a specific refusal
          would say the same thing twice, less usefully. */}
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

/* ── Bundles ────────────────────────────────────────────────────────────── */

/** What this product is made of, when it is sold as a set of other products.
 *  Read-only here: a bundle's contents are other products, and picking them is a
 *  catalog-wide job rather than a product-scoped one. */
function BundleSection({ bundles }: { bundles: Bundle[] }) {
  if (bundles.length === 0) return null;
  return (
    <>
      {bundles.map((bundle) => (
        <FormSection
          key={bundle.id}
          title="Sold as a set"
          description="This product is a bundle — buying it buys several other products together."
        >
          <Text>
            {bundle.componentCount === 1
              ? 'It contains 1 product.'
              : `It contains ${String(bundle.componentCount)} products.`}{' '}
            {bundle.pricingMode === 'fixed'
              ? `The set costs a flat ${
                  bundle.fixedPriceCents === null ? 'price you have set' : ''
                }${bundle.fixedPriceCents === null ? '' : formatCents(bundle.fixedPriceCents)}, whatever the parts add up to.`
              : bundle.pricingMode === 'percent_off_sum'
                ? `The set costs ${String(bundle.percentOffSum ?? 0)}% less than buying the parts separately.`
                : 'The set costs whatever its parts add up to.'}
          </Text>
          <Text className="text-sm">
            {bundle.inventoryMode === 'decrement_bundle_sku'
              ? 'Stock is counted against the set itself, not against each part.'
              : 'Selling one takes a unit of each part out of stock.'}
          </Text>
        </FormSection>
      ))}
    </>
  );
}

/* ── The editor ─────────────────────────────────────────────────────────── */

/**
 * What is stopping this build being saved, in one sentence.
 *
 * Returned as a single most-specific message rather than a list: three
 * complaints stacked above a form is a wall, and the first one is the only one
 * anyone acts on anyway.
 */
function blockingReason(draft: TemplateDraft): string | null {
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
  // Caught here rather than left to the server. An answer with no wording is
  // rejected by the API, and a save that fails on a rule the screen could have
  // stated up front is a worse experience than a disabled button that says why.
  const blankAnswer = draft.options.find(
    (option) =>
      hasChoices(option.type) && option.choices.some((choice) => choice.label.trim() === '')
  );
  if (blankAnswer) {
    return `One of the answers under “${blankAnswer.label.trim() || 'a question'}” has no wording, so it would appear on your website as a blank option.`;
  }
  return null;
}

function TemplateEditor({
  productId,
  productTitle,
  currency,
  draft,
  setDraft,
  saved,
  dirty,
  onDeleted,
}: {
  productId: string;
  productTitle: string;
  currency: string;
  draft: TemplateDraft;
  setDraft: (next: TemplateDraft | null) => void;
  /** The server's copy, or null while this build does not exist yet. */
  saved: ConfiguratorTemplate | null;
  dirty: boolean;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const remove = useDeleteConfiguratorTemplate(productId);

  const isNew = draft.id === NEW;
  const status = statusMeaning(draft.status);
  const blocked = blockingReason(draft);

  const set = (patch: Partial<TemplateDraft>) => {
    setDraft({ ...draft, ...patch });
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      description: `Every question, answer and rule in this build goes with it, and ${productTitle} goes back to being bought the ordinary way. Orders already placed keep their record of what was chosen. This cannot be undone — make it not live instead if you might use it again.`,
      confirmLabel: 'Delete this build',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(draft.id, {
      onSuccess: () => {
        setDraft(null);
        onDeleted();
        afterPaneChange(() => {
          toast.add({ title: `“${draft.name}” deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this build',
          description: productErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <>
      {/* Why the Save it refers to is NOT here: this pane's primary action lives
          in the pane toolbar. A Save floating above a form in a dock is
          ambiguous about which of the two things around it it belongs to. */}
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
                rows={3}
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
                set({ status: next as TemplateDraft['status'] });
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
        <Button
          size="sm"
          variant="outline"
          color="module"
          onClick={() => {
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
          }}
        >
          <Icon glyph={faPlus} className="size-4" aria-hidden />
          Add a question
        </Button>
      </div>

      {draft.options.length === 0 ? (
        <Text>
          A build is a list of questions. Add the first one — “what size?”, “what finish?”, “do you
          want it engraved?” — and the answers a customer can give.
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
                // A rule pointing at a question that no longer exists is
                // rejected by the server, so the removal takes them with it
                // rather than producing a save that cannot succeed.
                rules: draft.rules.filter(
                  (rule) =>
                    !rule.conditions.some((condition) => condition.optionKey === option.key) &&
                    !rule.actions.some(
                      (action) => 'optionKey' in action && action.optionKey === option.key
                    )
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
          description="These run as soon as a customer answers, before anything reaches their basket."
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
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </FormSection>
      ) : null}

      {saved === null ? null : <TryItPanel template={saved} currency={currency} stale={dirty} />}

      {/* Rare and permanent, so a plain row after the work rather than a card
          competing with the questions someone came here to change. */}
      {isNew ? null : (
        <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Text className="text-sm">
            Deleting removes this build and every question in it for good. Making it not live is the
            reversible version.
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
            Delete this build
          </Button>
        </div>
      )}
    </>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

function ConfiguratorBody({
  scope,
  draft,
  setDraft,
  selectedId,
  setSelectedId,
}: {
  scope: ReadyScope;
  draft: TemplateDraft | null;
  setDraft: (next: TemplateDraft | null) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const productId = scope.productId;
  const toast = useToast();
  const templates = useProductTemplates(productId);
  const bundles = useProductBundles(productId);

  const rows = templates.data ?? [];
  const activeId = draft?.id === NEW ? null : (selectedId ?? rows[0]?.id ?? null);
  const detail = useConfiguratorTemplate(activeId);
  const currency = 'USD';

  const editing = draft ?? (detail.data ? toDraft(detail.data) : null);
  const savedTemplate = draft?.id === NEW ? null : (detail.data ?? null);
  const dirty =
    draft !== null &&
    (savedTemplate === null || fingerprint(draft) !== fingerprint(toDraft(savedTemplate)));

  useDirtySource(draft !== null, 'This build has changes that have not been saved. Close anyway?');

  // The write lives up here with the toolbar that triggers it, rather than in
  // the editor — a Save button and the mutation it fires belong to the same
  // component, or the button ends up as a prop-drilled callback nobody can trace.
  const create = useCreateConfiguratorTemplate(productId);
  const update = useUpdateConfiguratorTemplate(productId, draft?.id ?? NEW);
  const blocked = draft === null ? null : blockingReason(draft);

  const save = () => {
    if (draft === null || blocked !== null) return;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      status: draft.status,
      options: draft.options.map((option, index) => ({ ...option, position: index })),
      rules: draft.rules,
    };
    if (draft.id === NEW) {
      create.mutate(
        { name: payload.name, options: payload.options },
        {
          onSuccess: (created) => {
            // Drop the draft FIRST, announce after, one tick apart — clearing it
            // unmounts the create-state editor and swaps in the manage-state
            // one, so the toast describes a settled pane. (It does not silence
            // Base UI's flushSync warning on toast mount; that is app-wide and
            // fires for every invalidate-then-toast save here.)
            setDraft(null);
            setSelectedId(created.id);
            afterPaneChange(() => {
              toast.add({ title: 'Build set up', type: 'success' });
            });
          },
          onError: (error) => {
            toast.add({
              title: 'Could not set that build up',
              description: productErrorMessage(error, 'Nothing was saved.'),
              type: 'error',
            });
          },
        }
      );
      return;
    }
    update.mutate(payload, {
      onSuccess: () => {
        setDraft(null);
        afterPaneChange(() => {
          toast.add({ title: 'Build saved', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save this build',
          description: productErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  // Every branch returns card(s): the ready one is a stack of FormSections, so a
  // state that skipped the card sat on the pane's recessed surface and the pane
  // jumped as the data arrived.
  const body = () => {
    if (templates.isError) {
      // A failed FIRST load leaves nothing behind the message, so it takes the
      // empty-state shape rather than an Alert banner over absent content.
      return (
        <Card>
          <PaneLoadError
            module={MODULE}
            icon={<Icon glyph={faSliders} className="size-6" aria-hidden />}
            title="Could not load this product’s builds"
            description="This is a problem reaching the server. Nothing about the product has changed — it just could not be read just now."
            onRetry={() => {
              void templates.refetch();
            }}
          />
        </Card>
      );
    }

    if (templates.isPending) {
      return (
        <Card>
          <PaneWaiting module={MODULE} />
        </Card>
      );
    }

    if (rows.length === 0 && draft === null) {
      return (
        <>
          <BundleSection bundles={bundles.data?.items ?? []} />
          <Card>
            <PaneEmpty
              module={MODULE}
              icon={<Icon glyph={faSliders} className="size-6" aria-hidden />}
              title="This product is bought as it comes"
              description="Nobody is asked anything when they buy it. Set up a build if it is made to order — if a customer picks a size, a finish, an engraving, or anything else that changes what they get or what it costs."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    setDraft(emptyDraft(scope.product.title));
                  }}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Set up a build
                </Button>
              }
            />
          </Card>
        </>
      );
    }

    return (
      <>
        <BundleSection bundles={bundles.data?.items ?? []} />

        {/* Only when there is genuinely a choice to make. One build is the
            normal case, and a strip with one tab on it is furniture. */}
        {rows.length > 1 && draft?.id !== NEW ? (
          <Tabs
            variant="pills"
            color="module"
            value={activeId ?? ''}
            onValueChange={(next) => {
              setSelectedId(next as string);
              setDraft(null);
            }}
          >
            <div className="bg-base-300 shrink-0 rounded-full px-4 py-2">
              <TabsList scrollable scrollLabel="steps">
                {rows.map((row) => (
                  <TabsTab key={row.id} value={row.id}>
                    {row.name}
                  </TabsTab>
                ))}
              </TabsList>
            </div>
          </Tabs>
        ) : null}

        {draft?.id === NEW ? null : detail.isError ? (
          <Alert color="danger" variant="soft">
            <AlertContent>
              <AlertTitle>Could not load this build</AlertTitle>
              <AlertDescription>
                This is a problem reaching the server. The build itself is unaffected.
              </AlertDescription>
            </AlertContent>
            <Button
              size="sm"
              color="danger"
              variant="soft"
              onClick={() => {
                void detail.refetch();
              }}
            >
              Try again
            </Button>
          </Alert>
        ) : detail.isPending ? (
          <Card className="min-h-0 flex-1 items-center justify-center">
            <PaneWaiting />
          </Card>
        ) : null}

        {editing === null ? null : (
          <TemplateEditor
            key={editing.id}
            productId={productId}
            productTitle={scope.product.title}
            currency={currency}
            draft={editing}
            setDraft={setDraft}
            saved={savedTemplate}
            dirty={dirty}
            onDeleted={() => {
              setSelectedId(null);
            }}
          />
        )}

        {draft?.id === NEW ? null : (
          <Button
            size="sm"
            variant="ghost"
            color="module"
            className="self-start"
            onClick={() => {
              setDraft(emptyDraft(scope.product.title));
            }}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Set up another build
          </Button>
        )}
      </>
    );
  };

  const liveCount = rows.filter((row) => row.status === 'active').length;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Configurator actions"
        status={
          <>
            {scope.isFollowing ? (
              <Badge color="info" variant="soft" size="sm">
                Following
              </Badge>
            ) : null}
            {liveCount > 0 ? (
              <Badge color="success" variant="soft" size="sm">
                <Icon glyph={faCubes} className="size-3" aria-hidden />
                <span className="hidden @md:inline">Built to order</span>
              </Badge>
            ) : null}
          </>
        }
        primary={
          /* This pane's Save, in this pane's own toolbar. It is here and not
                      above the form for the same reason the detail pane's moved: a
                      primary action anchored to nothing is ambiguous about what it acts
                      on, and in a dock it competes with whatever is in the pane beside
                      it. Discard sits beside it because they are one decision. */
          draft !== null ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => {
                  setDraft(null);
                }}
              >
                <Icon glyph={faRotateLeft} className="size-4" aria-hidden />
                <span className="hidden @md:inline">Discard</span>
              </Button>
              <Button
                size="sm"
                color="module"
                disabled={blocked !== null || !dirty}
                loading={create.isPending || update.isPending}
                onClick={save}
              >
                <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
                {draft.id === NEW ? (
                  <>
                    <span className="hidden @md:inline">Set this build up</span>
                    <span className="@md:hidden">Create</span>
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </>
          ) : null
        }
        refresh={
          <RefreshButton
            isFetching={templates.isFetching || detail.isFetching}
            updatedAt={templates.dataUpdatedAt}
            onRefresh={() => {
              void templates.refetch();
              void detail.refetch();
              void bundles.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <FollowingNotice scope={scope} />
          {draft !== null ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Not saved yet</AlertTitle>
                <AlertDescription>
                  Your website still offers the previous version until you save.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
          {body()}
        </div>
      </div>
    </div>
  );
}

export function ProductConfiguratorSurface({ ctx }: { ctx: SurfaceContext }) {
  // Both pieces of state live above `useProductScope` so `hold` can be answered:
  // a FOLLOWING pane holding a half-written build must not re-point underneath
  // it, and the body is keyed on the product, so a re-point would have wiped the
  // draft before anyone could be asked about it.
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scope = useProductScope(ctx, { label: LABEL, hold: draft !== null });

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} module={MODULE} />;
  }
  return (
    <ConfiguratorBody
      key={scope.productId}
      scope={scope}
      draft={draft}
      setDraft={setDraft}
      selectedId={selectedId}
      setSelectedId={setSelectedId}
    />
  );
}
