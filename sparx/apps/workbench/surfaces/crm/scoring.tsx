'use client';

// Scoring — how this business decides who is worth calling first (docs/144 §10).
//
// ══════════════════════════════════════════════════════════════════════════
// ONE SURFACE, NOT A LIST AND AN EDITOR
// ══════════════════════════════════════════════════════════════════════════
//
// A business has ONE way of scoring customers and ONE way of scoring deals. A
// list of models with an editor behind each would be two screens for something
// that is really a pair of settings — and it would present "which of my six
// scoring models is live" as a question anybody wanted to answer. So this is a
// single surface with a tab per object, editing the active model in place.
//
// THE PREVIEW IS WHY THIS IS USABLE. A list of rules is abstract; the same rules
// landing on a customer whose name you recognise is not. So the surface picks a
// real record and shows what the rules make of them, live, while they are being
// written — the same code path the evaluator runs, so what an author sees is
// what they will get.
//
// EVERY RULE IS INDEPENDENT AND THEY ALL ADD UP. That is stated on screen, not
// just in the schema, because it is the one thing somebody has to understand
// before they write the second rule.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Combobox,
  Field,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Gauge, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { customerName, useCustomers } from './customers-data';
import {
  SCOREABLE,
  useCreateScoringModel,
  useRecomputeScores,
  useScorePreview,
  useScoringFields,
  useScoringModels,
  useUpdateScoringModel,
  type ScoringField,
  type ScoringModel,
  type ScoringRule,
} from './scoring-data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/** A blank rule. Starts with an empty condition so the first thing an author
 *  does is answer "what question", which is the decision that matters. */
function emptyRule(): ScoringRule {
  return { condition: { logic: 'AND', conditions: [] }, points: 10, label: '' };
}

/** The operators a scoring rule offers, in the words a business owner uses. The
 *  set is deliberately smaller than the engine's: `contains` on a list and the
 *  presence checks cover what scoring rules actually ask, and offering twelve
 *  would make the common case harder to find. */
const OPERATORS = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'gt', label: 'is more than' },
  { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is less than' },
  { value: 'lte', label: 'is at most' },
  { value: 'contains', label: 'includes' },
  { value: 'is_set', label: 'is filled in' },
  { value: 'is_not_set', label: 'is empty' },
] as const;

/** Operators that take no right-hand value — the input hides for these. */
const VALUELESS = new Set(['is_set', 'is_not_set']);

/**
 * A stored comparison value as editable text.
 *
 * The value is typed `unknown` because it comes back from JSONB, but a scoring
 * rule only ever compares against a scalar — the editor writes strings and
 * numbers and nothing else. Anything other than a scalar is a row somebody
 * hand-edited, and showing it as `[object Object]` in a text box would invite
 * them to save that back over whatever was really there.
 */
function scalarText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Which operators make sense for a field's kind. A "more than" on a name is a
 *  question with no answer, so it is not offered rather than failing later. */
function operatorsFor(kind: ScoringField['kind'] | undefined): (typeof OPERATORS)[number][] {
  if (kind === 'number' || kind === 'currency' || kind === 'date') {
    return OPERATORS.filter((o) => o.value !== 'contains');
  }
  if (kind === 'boolean') {
    return OPERATORS.filter((o) => o.value === 'eq' || o.value === 'neq');
  }
  if (kind === 'list') {
    return OPERATORS.filter(
      (o) => o.value === 'contains' || o.value === 'is_set' || o.value === 'is_not_set'
    );
  }
  return OPERATORS.filter((o) => !['gt', 'gte', 'lt', 'lte'].includes(o.value));
}

/* ── One rule row ───────────────────────────────────────────────────────── */

function RuleRow({
  rule,
  fields,
  onChange,
  onRemove,
}: {
  rule: ScoringRule;
  fields: readonly ScoringField[];
  onChange: (next: ScoringRule) => void;
  onRemove: () => void;
}) {
  // A scoring rule is ONE question — an AND/OR tree here would be a second
  // condition builder for a job that does not need one, and the sum-of-rules
  // design already covers "several things matter" by writing several rules.
  const leaf = rule.condition.conditions[0] as
    { field: string; operator: string; value?: unknown } | undefined;
  const field = leaf?.field ?? '';
  const operator = leaf?.operator ?? 'eq';
  const value = leaf?.value;

  const kind = fields.find((f) => f.path === field)?.kind;
  const needsValue = !VALUELESS.has(operator);

  function setLeaf(patch: { field?: string; operator?: string; value?: unknown }) {
    const next = {
      field: patch.field ?? field,
      operator: patch.operator ?? operator,
      ...(patch.value === undefined && !('value' in patch) ? { value } : { value: patch.value }),
    };
    onChange({
      ...rule,
      condition: {
        logic: 'AND',
        conditions: VALUELESS.has(next.operator)
          ? [{ field: next.field, operator: next.operator }]
          : [next],
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A COMBOBOX'S VALUE MUST BE AN ELEMENT OF ITS OWN `items`, NOT AN EQUAL COPY
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Both lists are memoized and both selections are looked up BY IDENTITY out of
  // the memoized array. That is not tidiness — it is the whole fix for a bug that
  // made a SAVED MODEL UNREADABLE: the operator list used to be built inline
  // (`items={operators.map(…)}`) with an equal-but-separate object for `value`,
  // and since the Combobox resolves the selected item by reference, nothing ever
  // matched. It looked right while an author was clicking, because the component
  // was holding the very object they had picked — and then went blank the moment
  // the state was re-seeded from the server, which is every time anybody reopens
  // their own scoring rules. The rules underneath were always intact; the screen
  // simply stopped being able to say what they were.
  //
  // The field picker was correct by accident of being written this way. Copy the
  // shape, not the inline version.
  const fieldOptions = useMemo(
    () => fields.map((f) => ({ value: f.path, label: f.label })),
    [fields]
  );
  const operatorOptions = useMemo(
    () => operatorsFor(kind).map((o) => ({ value: o.value, label: o.label })),
    [kind]
  );
  const selectedField = fieldOptions.find((o) => o.value === field) ?? null;
  const selectedOperator =
    operatorOptions.find((o) => o.value === operator) ?? operatorOptions[0] ?? null;

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
        <Combobox
          color="module"
          aria-label="Which detail"
          placeholder="Pick something about them"
          items={fieldOptions}
          value={selectedField}
          onValueChange={(next) => {
            const chosen = next as { value: string } | null;
            if (chosen) setLeaf({ field: chosen.value });
          }}
        />
        <Combobox
          color="module"
          aria-label="How to compare it"
          items={operatorOptions}
          value={selectedOperator}
          onValueChange={(next) => {
            const chosen = next as { value: string } | null;
            if (chosen) setLeaf({ operator: chosen.value });
          }}
        />
        {needsValue ? (
          <Input
            color="module"
            aria-label="Compared to"
            placeholder="e.g. 500"
            value={scalarText(value)}
            onChange={(e) => {
              const raw = e.target.value;
              // Keep numbers as numbers. A "$500 or more" rule stored as the
              // string "500" still works — the evaluator coerces — but it reads
              // wrong in the API and in an export.
              const asNumber = Number(raw);
              setLeaf({ value: raw !== '' && Number.isFinite(asNumber) ? asNumber : raw });
            }}
          />
        ) : (
          <Text className="self-center text-sm">Nothing to compare — this just checks it.</Text>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <Input
          color="module"
          aria-label="What to call this rule"
          placeholder="Say why it matters, e.g. “Spends a lot with us”"
          value={rule.label}
          onChange={(e) => {
            onChange({ ...rule, label: e.target.value });
          }}
        />
        <Input
          color="module"
          type="number"
          aria-label="Points"
          min={-1000}
          max={1000}
          value={rule.points}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...rule, points: Number.isFinite(n) ? Math.round(n) : 0 });
          }}
        />
        <Button
          variant="ghost"
          color="danger"
          size="sm"
          onClick={onRemove}
          aria-label="Remove rule"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      {rule.points < 0 ? (
        <Badge color="warning" variant="soft" size="sm">
          Takes {Math.abs(rule.points)} points away
        </Badge>
      ) : null}
    </Card>
  );
}

/* ── The surface ────────────────────────────────────────────────────────── */

export function ScoringSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [objectKey, setObjectKey] = useState<string>(
    typeof ctx.params.objectKey === 'string' ? ctx.params.objectKey : 'contact'
  );

  const { data: modelPage } = useScoringModels(objectKey);
  const { data: fieldsResponse } = useScoringFields();

  // The ACTIVE model is the one being edited. Two active models cannot exist —
  // the database refuses — so "the model" is a well-defined thing here.
  const model = useMemo(
    () => (modelPage?.items ?? []).find((m) => m.isActive) ?? (modelPage?.items ?? [])[0] ?? null,
    [modelPage]
  );

  const fields = useMemo(
    () => fieldsResponse?.objects.find((o) => o.objectKey === objectKey)?.fields ?? [],
    [fieldsResponse, objectKey]
  );

  const [name, setName] = useState('');
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [decayPerDay, setDecayPerDay] = useState<number | null>(null);
  const [maxScore, setMaxScore] = useState(100);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed from the saved model whenever the object tab changes or the model
  // arrives. Keyed on the model id + object so switching tabs loads the other
  // model rather than carrying this one's rules across.
  useEffect(() => {
    const next = {
      name: model?.name ?? (objectKey === 'deal' ? 'Deal health' : 'Lead score'),
      rules: model?.rules ?? [],
      decayPerDay:
        model?.decayPerDay === null || model?.decayPerDay === undefined
          ? null
          : Number(model.decayPerDay),
      maxScore: model?.maxScore ?? 100,
    };
    setName(next.name);
    setRules(next.rules);
    setDecayPerDay(next.decayPerDay);
    setMaxScore(next.maxScore);
    setBaseline(JSON.stringify(next));
  }, [model, objectKey]);

  const current = JSON.stringify({ name, rules, decayPerDay, maxScore });
  const dirty = current !== baseline && baseline !== '';
  useDirtySource(dirty, 'This scoring has unsaved changes. Close anyway?');

  const create = useCreateScoringModel();
  const update = useUpdateScoringModel(model?.id ?? 'new');
  const recompute = useRecomputeScores();

  const saving = create.isPending || update.isPending;

  function onSave() {
    setError(null);
    const unnamed = rules.findIndex((r) => r.label.trim() === '');
    if (unnamed >= 0) {
      setError(
        `Rule ${String(unnamed + 1)} needs a short description — it is what people see when they ask why somebody has the score they have.`
      );
      return;
    }
    const unanswered = rules.findIndex((r) => r.condition.conditions.length === 0);
    if (unanswered >= 0) {
      setError(`Rule ${String(unanswered + 1)} does not ask anything yet.`);
      return;
    }

    const payload = {
      name: name.trim(),
      objectKey,
      rules,
      decayPerDay,
      maxScore,
      isActive: true,
    };

    const onDone = () => {
      setBaseline(current);
      toast.add({ title: 'Scoring saved', type: 'success' });
    };
    const onFail = (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Could not save this. Nothing was changed.');
    };

    if (model) update.mutate(payload, { onSuccess: onDone, onError: onFail });
    else create.mutate(payload, { onSuccess: onDone, onError: onFail });
  }

  async function onRecompute() {
    const ok = await confirm({
      title: 'Re-score everyone?',
      // Says what it leaves alone, not just what it changes. This is the exact
      // moment somebody who nudged a customer last week wonders whether they
      // are about to lose it, and the answer is no.
      description:
        'This works through every record and updates any score your rules would now put differently. Anything you changed by hand is kept and added on top. It can take a minute on a big list, and every change is recorded so you can see what moved.',
      confirmLabel: 'Re-score them',
      cancelLabel: 'Not now',
      color: 'module',
    });
    if (!ok) return;
    recompute.mutate(objectKey, {
      onSuccess: (result) => {
        toast.add({
          title:
            result.changed === 0
              ? 'Nothing moved — every score already matched your rules'
              : `${String(result.changed)} of ${String(result.scanned)} scores changed`,
          type: 'success',
        });
      },
      onError: () => {
        setError('Could not finish re-scoring. Some records may already have been updated.');
      },
    });
  }

  const label = SCOREABLE.find((s) => s.objectKey === objectKey);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Scoring controls"
        primary={
          <Button size="sm" color="module" disabled={!dirty || saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        }
        controls={
          <>
            <Gauge className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              Scoring
            </Heading>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {SCOREABLE.map((s) => (
                <Button
                  key={s.objectKey}
                  size="sm"
                  variant={objectKey === s.objectKey ? 'soft' : 'ghost'}
                  color={objectKey === s.objectKey ? 'module' : 'neutral'}
                  onClick={() => {
                    setObjectKey(s.objectKey);
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              disabled={recompute.isPending || rules.length === 0}
              onClick={() => {
                void onRecompute();
              }}
            >
              <RefreshCw
                className={`size-4 ${recompute.isPending ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Re-score everyone
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <div className={COLUMN}>
          {error ? (
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertTitle>Cannot save this yet</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection
            title={`How you score ${label?.label.toLowerCase() ?? 'records'}`}
            description="Every rule that fits adds its points up. Write them one at a time — the order does not matter, and each one stands on its own."
            action={
              <Button
                size="sm"
                variant="soft"
                color="module"
                onClick={() => {
                  setRules((prev) => [...prev, emptyRule()]);
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add a rule
              </Button>
            }
          >
            {rules.length === 0 ? (
              <Text className="text-base">
                Nothing scores yet, so everybody sits at zero. Add a rule — something like “has
                bought before: +20” — and the number starts meaning something.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {rules.map((rule, i) => (
                  <RuleRow
                    key={i}
                    rule={rule}
                    fields={fields}
                    onChange={(next) => {
                      setRules((prev) => prev.map((r, idx) => (idx === i ? next : r)));
                    }}
                    onRemove={() => {
                      setRules((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                  />
                ))}
              </div>
            )}
          </FormSection>

          <FormSection
            title="The details"
            description="What to call this, the highest a score can go, and whether points fade when somebody goes quiet."
          >
            <Field>
              <FieldLabel>What to call it</FieldLabel>
              <Input
                color="module"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
              <FieldDescription>For you — it shows on the record’s score panel.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Highest score</FieldLabel>
              <Input
                color="module"
                type="number"
                min={1}
                max={1000}
                className="max-w-[10rem]"
                value={maxScore}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setMaxScore(
                    Number.isFinite(n) ? Math.min(1000, Math.max(1, Math.round(n))) : 100
                  );
                }}
              />
              <FieldDescription>
                Scores stop here, so the number means the same thing on every record. 100 is the
                usual choice.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Points lost per quiet day</FieldLabel>
              <Input
                color="module"
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="max-w-[10rem]"
                placeholder="0"
                value={decayPerDay ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setDecayPerDay(null);
                    return;
                  }
                  const n = Number(raw);
                  setDecayPerDay(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null);
                }}
              />
              <FieldDescription>
                Leave blank for none. Without it a score is a lifetime total, so somebody who was
                keen a year ago outranks somebody who replied this morning — and the top of your
                list slowly stops changing.
              </FieldDescription>
            </Field>
          </FormSection>

          <PreviewSection
            objectKey={objectKey}
            rules={rules}
            decayPerDay={decayPerDay}
            maxScore={maxScore}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Live preview ───────────────────────────────────────────────────────── */

/**
 * What these rules make of one real record.
 *
 * Contacts only, and deliberately: the preview needs a record picker, the
 * customer list already has search, and a deal picker would be a second one for
 * a screen that is mostly about the rules. A deal model still previews — the
 * scores land on the board — this panel just does not draw one.
 */
function PreviewSection({
  objectKey,
  rules,
  decayPerDay,
  maxScore,
}: {
  objectKey: string;
  rules: ScoringRule[];
  decayPerDay: number | null;
  maxScore: number;
}) {
  const [recordId, setRecordId] = useState<string | null>(null);
  const { data: customers } = useCustomers({});

  const options = useMemo(
    () => (customers?.items ?? []).map((c) => ({ value: c.id, label: customerName(c) })),
    [customers]
  );

  const preview = useScorePreview({
    objectKey,
    recordId,
    rules,
    decayPerDay,
    maxScore,
  });

  if (objectKey !== 'contact') {
    return (
      <FormSection title="Trying it out">
        <Text className="text-base">
          Save this, then open any deal — its score shows on the board, with the reasons behind it.
        </Text>
      </FormSection>
    );
  }

  const breakdown = preview.data;

  return (
    <FormSection
      title="Try it on somebody"
      description="Pick a real customer and see what these rules make of them. Nothing is saved."
    >
      <Combobox
        color="module"
        aria-label="Which customer"
        placeholder="Pick a customer"
        items={options}
        value={options.find((o) => o.value === recordId) ?? null}
        onValueChange={(next) => {
          const chosen = next as { value: string } | null;
          setRecordId(chosen?.value ?? null);
        }}
      />

      {recordId === null ? (
        <Text className="text-base">Pick somebody to see how they score.</Text>
      ) : breakdown === null || breakdown === undefined ? (
        <Text className="text-base">Working it out…</Text>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <span className="text-module text-5xl font-semibold">{breakdown.score}</span>
            <Text className="text-base">out of {maxScore}</Text>
          </div>

          {breakdown.reasons.length === 0 ? (
            <Text className="text-base">
              None of your rules fit this person, so they score zero. That is a real answer — but if
              it is true of everybody you try, the rules are asking about things your records do not
              hold.
            </Text>
          ) : (
            <ul className="flex flex-col gap-1">
              {breakdown.reasons.map((reason, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-base">{reason.label}</span>
                  <Badge
                    color={reason.points >= 0 ? 'success' : 'warning'}
                    variant="soft"
                    size="sm"
                  >
                    {reason.points >= 0 ? '+' : ''}
                    {reason.points}
                  </Badge>
                </li>
              ))}
              {breakdown.decayed > 0 ? (
                <li className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-base">Has gone quiet</span>
                  <Badge color="warning" variant="soft" size="sm">
                    −{breakdown.decayed}
                  </Badge>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      )}
    </FormSection>
  );
}

export type { ScoringModel };
