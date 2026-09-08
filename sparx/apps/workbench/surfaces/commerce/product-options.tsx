'use client';

// The Options tab — the CHOICES a shopper makes, and nothing else.
//
// Options are the axes this product is sold along ("Size: small / medium /
// large"). The sellable versions sitting at each point of that grid are the
// Variants tab's business. The split is not tidiness: rewriting the axes is a
// schema-shaped act with a blast radius, and routine price entry is not.
//
// ── Why this screen is mostly a preview ──────────────────────────────────
//
// There is no "add one value" endpoint. `POST …/variants/options` REPLACES the
// whole lattice — the server drops every option, every value, and every
// variant-to-value assignment, then inserts the new set. Variant rows survive
// but come out unbound, which on a product with options is a corrupt state.
//
// So this tab does not save a field, it saves a RESTRUCTURING. Everything typed
// here is a draft, and the draft is continuously turned into plain sentences
// about what committing would do: how many versions keep their price, how many
// new combinations appear with no price yet, which versions lose their place and
// stop being sold. `useSaveProductLattice` then performs the whole act —
// replace, re-place, retire — so it never leaves the product half-restructured.
//
// ── Why this tab does NOT use the toolbar's Save ─────────────────────────
//
// Every other tab registers `useTabSave` and commits through the one Save in the
// pane toolbar. This one deliberately does not, and the toolbar therefore shows
// no Save while Options is open.
//
// The rule it is following is the one in product-tab-save.tsx: destructive
// actions are not saves. Committing here can take SKUs off sale and unpin
// images — it is closer to Retire than to "save my typing". A generic Save in
// the chrome is exactly the control someone presses without reading, and it
// would sit two feet from the sentences explaining what it destroys.
//
// So the commit button lives at the foot of the consequence card, attached to
// the sentences describing precisely what it will do, and it names the act
// ("Change how this is sold") rather than the mechanism. That is also the answer
// to the problem the toolbar move was solving: this button is anchored to
// something, and there is still exactly one of it.
//
// The tab still registers `useDirtySource`, so the pane's leave-guard and the
// tab strip's dirty dot both work as they do everywhere else.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
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
import { ChevronDown, ChevronUp, Plus, Shapes, Trash2, X } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { FormSection } from '../../components/form-section';
import { SwatchPicker } from '../../components/swatch-picker';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  formatCents,
  LatticeRebindError,
  productErrorMessage,
  useProductOptions,
  useProductVariants,
  useSaveProductLattice,
  type LatticeCoordinate,
  type LatticePlan,
  type OptionDisplayType,
  type Product,
  type ProductOption,
  type Variant,
} from './products-data';

/* ── The draft ──────────────────────────────────────────────────────────── */

/** A local key, because a value being TYPED has no server id yet and its text
 *  changes on every keystroke — neither is usable as a React key.
 *
 *  These keys carry more weight than identity for React. An EXISTING option or
 *  value keeps the server's id as its key, and that is what tells us a renamed
 *  "Size" is still the same axis rather than a new one — see `consequenceOf`. */
let localKeys = 0;
function nextKey(): string {
  localKeys += 1;
  return `local-${String(localKeys)}`;
}

interface ValueDraft {
  /** The server's option-value id, or a local key for a value being added. */
  key: string;
  value: string;
  /** `#RRGGBB` — the color of the THING being sold, not a design token. */
  swatchHex: string | null;
}

interface OptionDraft {
  /** The server's option id, or a local key for an axis being added. */
  key: string;
  name: string;
  displayType: OptionDisplayType;
  values: ValueDraft[];
}

function toDraft(options: ProductOption[]): OptionDraft[] {
  return options.map((option) => ({
    key: option.id,
    name: option.name,
    displayType: option.displayType,
    values: option.values.map((value) => ({
      key: value.id,
      value: value.value,
      swatchHex: value.swatchHex,
    })),
  }));
}

/** Compared as text so "did anything move" is one string equality rather than a
 *  hand-written deep compare that forgets a field the day someone adds one. */
function fingerprint(draft: OptionDraft[]): string {
  return JSON.stringify(
    draft.map((option) => [
      option.name.trim(),
      option.displayType,
      option.values.map((value) => [value.value.trim(), value.swatchHex]),
    ])
  );
}

/* ── How each display type is described to a person ─────────────────────── */

// Nobody outside this industry says "swatch". These are the words an owner would
// use for the thing their shopper actually sees.
const DISPLAY_LABELS: Record<OptionDisplayType, string> = {
  dropdown: 'A drop-down list',
  radio: 'A list to pick one from',
  segmented: 'A row of joined buttons',
  swatch: 'Color dots',
  image_swatch: 'Small pictures',
};

/** `image_swatch` needs a picture per value and there is nowhere to choose one
 *  yet — the Media tab is not built. Offering it would be offering a dead end,
 *  so it appears only on a product already using it, where hiding it would
 *  silently change how that product is sold on the next commit. */
function displayItems(current: OptionDisplayType) {
  const keys: OptionDisplayType[] = ['dropdown', 'radio', 'segmented', 'swatch'];
  if (current === 'image_swatch') keys.push('image_swatch');
  return keys.map((key) => ({ value: key, label: DISPLAY_LABELS[key] }));
}

/* ── What committing would do ───────────────────────────────────────────── */

interface Consequence {
  /** Points in the new grid. Zero when the axes are being removed entirely. */
  combinations: number;
  /** Versions that keep their place, their price and their code. */
  keep: { variant: Variant; coordinate: LatticeCoordinate[] }[];
  /** The one version ADOPTED onto a brand-new grid — see the note below. */
  adopted: { variant: Variant; coordinate: LatticeCoordinate[] } | null;
  /** Versions whose place no longer exists. */
  retire: Variant[];
  /** Combinations that would have no price yet. */
  blank: number;
  /** Removing every axis leaves these with no choice attached. */
  loose: Variant[];
}

/** Trimmed, blank-free view of the draft — the only form worth reasoning about.
 *  A half-typed option is not a decision yet, so it counts for nothing. */
function cleanDraft(draft: OptionDraft[]): OptionDraft[] {
  return draft
    .map((option) => ({
      ...option,
      name: option.name.trim(),
      values: option.values
        .map((value) => ({ ...value, value: value.value.trim() }))
        .filter((value) => value.value !== ''),
    }))
    .filter((option) => option.name !== '' && option.values.length > 0);
}

function consequenceOf(
  draft: OptionDraft[],
  saved: ProductOption[],
  variants: Variant[]
): Consequence {
  const clean = cleanDraft(draft);
  const live = variants.filter((variant) => variant.deletedAt === null);

  if (clean.length === 0) {
    return {
      combinations: 0,
      keep: [],
      adopted: null,
      retire: [],
      blank: 0,
      loose: saved.length > 0 ? live : [],
    };
  }

  const combinations = clean.reduce((total, option) => total * option.values.length, 1);

  const keep: Consequence['keep'] = [];
  const stranded: Variant[] = [];

  for (const variant of live) {
    // Survival is decided by IDENTITY, not by text. A draft row that came from
    // the server still carries the server's id as its key, so a version sitting
    // on "Small" is still sitting on it after someone renames it to "S" — which
    // matching on the name would have got exactly backwards, quietly retiring
    // every SKU on the product over a typo fix.
    const held = new Set(variant.optionValueIds);
    const coordinate: LatticeCoordinate[] = [];
    for (const option of clean) {
      const kept = option.values.find((value) => held.has(value.key));
      if (!kept) break;
      coordinate.push({ option: option.name, value: kept.value });
    }

    if (coordinate.length === clean.length) keep.push({ variant, coordinate });
    else stranded.push(variant);
  }

  // ── Adoption ────────────────────────────────────────────────────────────
  // The overwhelmingly common first move is "I sell one thing, now I want to
  // sell it in three sizes". That product has exactly one version, carrying the
  // price and code someone typed when they created it. Retiring it and demanding
  // three new ones — leaving the product with NO price in between — is
  // technically correct and obviously not what was meant. So a lone unplaced
  // version on a product that had no choices at all lands on the first
  // combination, keeping its price and code. It is spelled out in the summary
  // and again in the confirm; it never happens quietly.
  const first = stranded[0];
  const adopting =
    saved.length === 0 && stranded.length === 1 && keep.length === 0 && first ? first : null;
  const adopted = adopting
    ? {
        variant: adopting,
        coordinate: clean.map((option) => ({
          option: option.name,
          // `cleanDraft` guarantees at least one value per surviving option.
          value: option.values[0]?.value ?? '',
        })),
      }
    : null;

  const filled = keep.length + (adopted ? 1 : 0);

  return {
    combinations,
    keep,
    adopted,
    retire: adopted ? [] : stranded,
    blank: Math.max(0, combinations - filled),
    loose: [],
  };
}

function planOf(draft: OptionDraft[], consequence: Consequence): LatticePlan {
  const clean = cleanDraft(draft);
  return {
    options: clean.map((option, index) => ({
      name: option.name,
      displayType: option.displayType,
      position: index,
      values: option.values.map((value, valueIndex) => ({
        value: value.value,
        ...(option.displayType === 'swatch' && value.swatchHex
          ? { swatchHex: value.swatchHex }
          : {}),
        position: valueIndex,
      })),
    })),
    place: [...consequence.keep, ...(consequence.adopted ? [consequence.adopted] : [])].map(
      (entry) => ({ variantId: entry.variant.id, coordinate: entry.coordinate })
    ),
    retire: consequence.retire.map((variant) => variant.id),
  };
}

/* ── What is wrong with the draft ───────────────────────────────────────── */

/**
 * The FIRST real problem, named where it is rather than as a banner at the top.
 * Committing is blocked on it.
 *
 * `field` matters: an option whose VALUES are missing must not put a red ring
 * round its NAME. Marking the wrong control is worse than marking none — it
 * sends someone to retype a word that was already right.
 */
interface OptionProblem {
  key: string;
  field: 'name' | 'values';
  message: string;
}

function problemWith(draft: OptionDraft[]): OptionProblem | null {
  const named = new Set<string>();
  for (const option of draft) {
    const name = option.name.trim();
    if (name === '') {
      return {
        key: option.key,
        field: 'name',
        message: 'Give this choice a name, like Size or Color.',
      };
    }
    if (named.has(name.toLowerCase())) {
      return {
        key: option.key,
        field: 'name',
        message: `You already have a choice called “${name}”. Give this one a different name.`,
      };
    }
    named.add(name.toLowerCase());

    const filled = option.values.filter((value) => value.value.trim() !== '');
    if (filled.length === 0) {
      return {
        key: option.key,
        field: 'values',
        message: `Add at least one thing a shopper can pick for ${name}.`,
      };
    }
    const seen = new Set<string>();
    for (const value of filled) {
      const text = value.value.trim().toLowerCase();
      if (seen.has(text)) {
        return {
          key: option.key,
          field: 'values',
          message: `“${value.value.trim()}” is listed twice under ${name}.`,
        };
      }
      seen.add(text);
    }
    if (option.displayType === 'swatch' && filled.some((value) => !value.swatchHex)) {
      return {
        key: option.key,
        field: 'values',
        message: `Every color under ${name} needs a color picked, or shoppers see an empty dot.`,
      };
    }
  }
  return null;
}

/* ── The tab ────────────────────────────────────────────────────────────── */

export function ProductOptionsTab({ product }: { ctx: SurfaceContext; product: Product }) {
  const toast = useToast();
  const confirm = useConfirm();

  const options = useProductOptions(product.id);
  const variants = useProductVariants(product.id);
  const commitLattice = useSaveProductLattice(product.id);

  const saved = useMemo(() => toDraft(options.data ?? []), [options.data]);
  const [draft, setDraft] = useState<OptionDraft[]>(saved);
  const [touched, setTouched] = useState(false);

  // Track the server's copy while this form is CLEAN, so a refetch after someone
  // else changed the axes lands. A dirty form is never overwritten.
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const dirty = fingerprint(draft) !== fingerprint(saved);
  // NOT `useTabSave` — see the note at the top of this file. This is the pane's
  // leave-guard and the tab strip's dirty dot only.
  useDirtySource(
    dirty,
    'The choices on this product have unsaved changes on the Options tab. Close anyway?'
  );

  const consequence = useMemo(
    () => consequenceOf(draft, options.data ?? [], variants.data ?? []),
    [draft, options.data, variants.data]
  );
  const problem = problemWith(draft);

  // A choice that has been NAMED but has nothing to pick yet is not a decision,
  // and there is no honest sentence to write about it — "0 combinations can be
  // sold" is both alarming and untrue of a form somebody is still filling in. So
  // the summary appears once there is either something real to describe, or
  // something real at risk.
  const showConsequences = cleanDraft(draft).length > 0 || (options.data ?? []).length > 0;

  const edit = (next: OptionDraft[]) => {
    setTouched(true);
    setDraft(next);
  };

  const commit = async () => {
    if (problem) return;
    const ok = await confirm({
      title: `Change how ${product.title} is sold?`,
      description: consequenceLines(consequence).join(' '),
      confirmLabel: 'Change how it is sold',
      cancelLabel: 'Go back',
      color: consequence.retire.length > 0 ? 'danger' : 'warning',
    });
    if (!ok) return;

    commitLattice.mutate(planOf(draft, consequence), {
      onSuccess: () => {
        setTouched(false);
        toast.add({
          title: 'This product is sold differently now',
          description:
            consequence.blank > 0
              ? `${countOf(consequence.blank, 'combination', 'combinations')} still ${consequence.blank === 1 ? 'needs a price' : 'need a price'} — set them on the Variants tab.`
              : 'Every combination has a price.',
          type: 'success',
        });
      },
      onError: (error) => {
        // ONE message, the most specific one. A rebind failure is NOT "nothing
        // was saved" — the axes DID change — and saying so would send someone to
        // redo work that is already stored.
        if (error instanceof LatticeRebindError) {
          setTouched(false);
          const count = error.variantIds.length;
          toast.add({
            title: 'The choices were changed, but some versions lost their place',
            description: `${countOf(count, 'version', 'versions')} now ${count === 1 ? 'has' : 'have'} no place in the grid. Open the Variants tab to put ${count === 1 ? 'it' : 'them'} right.`,
            type: 'warning',
          });
          return;
        }
        toast.add({
          title: 'Could not change how this is sold',
          description: productErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  // A failed load REPLACES the form. An empty option editor beside a dead commit
  // button invites someone to rebuild a lattice on top of nothing.
  if (options.isError || variants.isError) {
    return (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not load this product&apos;s choices</AlertTitle>
          <AlertDescription>
            This is a problem reaching the server. Nothing about the product has changed — how it is
            sold just could not be read just now.
          </AlertDescription>
        </AlertContent>
        <AlertActions>
          <Button
            size="sm"
            color="error"
            variant="soft"
            onClick={() => {
              void options.refetch();
              void variants.refetch();
            }}
          >
            Try again
          </Button>
        </AlertActions>
      </Alert>
    );
  }

  if (options.isPending || variants.isPending) {
    return (
      <p role="status" className="p-4">
        Loading…
      </p>
    );
  }

  const addOption = () => {
    edit([
      ...draft,
      {
        key: nextKey(),
        name: '',
        displayType: 'dropdown',
        values: [{ key: nextKey(), value: '', swatchHex: null }],
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* No Refresh row here: this is a tab BODY, not a list pane. A lone icon
          floating above the first card is anchored to nothing, and the failure
          state above already carries its own "Try again". */}

      {/* The consequence card carries the commit button, so the control that
          destroys SKUs is attached to the sentences saying which. */}
      {dirty && showConsequences ? (
        <ConsequenceCard
          consequence={consequence}
          blocked={problem !== null}
          busy={commitLattice.isPending}
          onCommit={() => {
            void commit();
          }}
          onDiscard={() => {
            setTouched(false);
            setDraft(saved);
          }}
        />
      ) : null}

      {draft.length === 0 ? (
        <NoChoicesYet onAdd={addOption} hadChoices={(options.data ?? []).length > 0} />
      ) : (
        <>
          {draft.map((option, index) => (
            <OptionCard
              key={option.key}
              option={option}
              problem={problem?.key === option.key ? problem : null}
              canMoveUp={index > 0}
              canMoveDown={index < draft.length - 1}
              onChange={(change) => {
                edit(
                  draft.map((entry) => (entry.key === option.key ? { ...entry, ...change } : entry))
                );
              }}
              onMove={(direction) => {
                edit(swap(draft, index, index + direction));
              }}
              onRemove={() => {
                edit(draft.filter((entry) => entry.key !== option.key));
              }}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text>
              {draft.length >= 8
                ? 'Eight choices is the most a product can have — already far more than a shopper will work through.'
                : `${countOf(consequence.combinations, 'combination', 'combinations')} in all.`}
            </Text>
            <Button
              size="sm"
              variant="outline"
              color="module"
              disabled={draft.length >= 8}
              onClick={addOption}
            >
              <Plus className="size-4" aria-hidden />
              Add another choice
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Reorder without mutating, and without tripping the compiler's index checks. */
function swap<T>(list: T[], from: number, to: number): T[] {
  const a = list[from];
  const b = list[to];
  if (!a || !b) return list;
  const next = [...list];
  next[from] = b;
  next[to] = a;
  return next;
}

/* ── Nothing set up yet ─────────────────────────────────────────────────── */

function NoChoicesYet({ onAdd, hadChoices }: { onAdd: () => void; hadChoices: boolean }) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <EmptyState
        icon={<Shapes className="size-6" aria-hidden />}
        // Two genuinely different situations. "You removed them, nothing is
        // committed yet" and "you never had any" read identically if you only
        // write one of them — and the first is the one where a stray click is
        // about to take somebody's SKUs off sale.
        title={hadChoices ? 'You have removed every choice' : 'This product is sold one way'}
        description={
          hadChoices
            ? 'Nothing has changed yet. The summary above says what happens to your existing versions if you go ahead — or put a choice back.'
            : 'There is a single version of this product with one price. Add a choice — Size, Color, Length — if shoppers need to pick between versions.'
        }
        actions={
          <Button size="sm" color="module" onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            Add a choice
          </Button>
        }
      />
    </div>
  );
}

/* ── One axis ───────────────────────────────────────────────────────────── */

function OptionCard({
  option,
  problem,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onRemove,
}: {
  option: OptionDraft;
  problem: OptionProblem | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (change: Partial<OptionDraft>) => void;
  onMove: (direction: 1 | -1) => void;
  onRemove: () => void;
}) {
  const name = option.name.trim();
  const setValues = (values: ValueDraft[]) => {
    onChange({ values });
  };

  return (
    <FormSection
      title={name === '' ? 'A new choice' : name}
      action={
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label={`Move ${name || 'this choice'} earlier`}
            disabled={!canMoveUp}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label={`Move ${name || 'this choice'} later`}
            disabled={!canMoveDown}
            onClick={() => {
              onMove(1);
            }}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 @md:flex-row">
        <Field className="min-w-0 flex-1">
          <FieldLabel>What is the shopper choosing?</FieldLabel>
          <FieldControl
            render={
              <Input
                color={problem?.field === 'name' ? 'error' : 'module'}
                value={option.name}
                placeholder="Size"
                onChange={(event) => {
                  onChange({ name: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>Shown above the choices on the product&apos;s page.</FieldDescription>
        </Field>

        <Field className="min-w-0 flex-1">
          <FieldLabel>How they pick it</FieldLabel>
          <Select
            color="module"
            items={displayItems(option.displayType)}
            value={option.displayType}
            aria-label={`How shoppers pick ${name || 'this choice'}`}
            onValueChange={(next) => {
              onChange({ displayType: next as OptionDisplayType });
            }}
          />
          <FieldDescription>
            {option.displayType === 'swatch'
              ? 'Each option shows as a colored dot, so pick the color of the real thing.'
              : 'How the choices appear on the product’s page.'}
          </FieldDescription>
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Heading level={3} className="text-base font-semibold">
          What they can pick
        </Heading>
        {option.values.map((value, index) => (
          <ValueRow
            key={value.key}
            value={value}
            swatch={option.displayType === 'swatch'}
            optionName={name || 'this choice'}
            canMoveUp={index > 0}
            canMoveDown={index < option.values.length - 1}
            onChange={(change) => {
              setValues(
                option.values.map((entry) =>
                  entry.key === value.key ? { ...entry, ...change } : entry
                )
              );
            }}
            onMove={(direction) => {
              setValues(swap(option.values, index, index + direction));
            }}
            onRemove={() => {
              setValues(option.values.filter((entry) => entry.key !== value.key));
            }}
          />
        ))}

        {problem ? <FieldStatus status="error">{problem.message}</FieldStatus> : null}

        <div>
          <Button
            size="sm"
            variant="outline"
            color="module"
            disabled={option.values.length >= 250}
            onClick={() => {
              setValues([...option.values, { key: nextKey(), value: '', swatchHex: null }]);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add {name === '' ? 'an option' : `a ${name.toLowerCase()}`}
          </Button>
        </div>
      </div>

      {/* Removing an axis is rare and it takes SKUs off sale when committed. As a
          card of its own beside the fields someone came here to edit it would
          carry the same weight as the work — a plain row after it is the honest
          rank. */}
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <Text>
          Remove this and every version that depends on it stops being sold. The summary at the top
          says exactly which.
        </Text>
        <Button size="sm" variant="ghost" color="danger" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
          Remove {name === '' ? 'this choice' : name}
        </Button>
      </div>
    </FormSection>
  );
}

/* ── One thing a shopper can pick ───────────────────────────────────────── */

function ValueRow({
  value,
  swatch,
  optionName,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onRemove,
}: {
  value: ValueDraft;
  swatch: boolean;
  optionName: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (change: Partial<ValueDraft>) => void;
  onMove: (direction: 1 | -1) => void;
  onRemove: () => void;
}) {
  const label = value.value.trim() || 'this option';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        color="module"
        size="sm"
        className="min-w-32 flex-1"
        value={value.value}
        placeholder="Medium"
        aria-label={`An option under ${optionName}`}
        onChange={(event) => {
          onChange({ value: event.target.value });
        }}
      />

      {/* THE SWATCH. `swatchHex` is user DATA — the color of the product — so it
          cannot come from a token, and a runtime hex can never become a Tailwind
          class (the compiler only ever sees literals in source). ColorPicker's
          `swatch` variant is the sanctioned answer: the library paints the chip
          from the value, which is exactly where painting belongs. SwatchPicker
          is that, plus the Escape repair described in its own file. */}
      {swatch ? (
        <>
          <SwatchPicker
            value={value.swatchHex ?? null}
            label={label}
            onValueChange={(next) => {
              onChange({ swatchHex: next });
            }}
          />
          {value.swatchHex ? null : (
            // Without this the picker's own default color reads as the answer,
            // and someone saves a swatch that shows nothing on their website.
            <Badge color="warning" variant="soft" size="sm">
              No color picked
            </Badge>
          )}
        </>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label={`Move ${label} up`}
          disabled={!canMoveUp}
          onClick={() => {
            onMove(-1);
          }}
        >
          <ChevronUp className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label={`Move ${label} down`}
          disabled={!canMoveDown}
          onClick={() => {
            onMove(1);
          }}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
        {/* No confirm here on purpose: nothing is destroyed until the commit, and
            a dialog on every removed row would train people to click straight
            through the one dialog that DOES matter. */}
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* ── The consequences, and the button that commits them ─────────────────── */

function ConsequenceCard({
  consequence,
  blocked,
  busy,
  onCommit,
  onDiscard,
}: {
  consequence: Consequence;
  blocked: boolean;
  busy: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}) {
  const lines = consequenceLines(consequence);
  const severe = consequence.retire.length > 0 || consequence.loose.length > 0;
  return (
    <Alert color={severe ? 'warning' : 'info'} variant="soft">
      <AlertContent>
        <AlertTitle>What this changes</AlertTitle>
        <AlertDescription>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {blocked ? (
            <Text className="mt-2">Finish the choice marked below before going ahead.</Text>
          ) : null}
        </AlertDescription>
      </AlertContent>
      <AlertActions>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDiscard}>
          Leave it as it is
        </Button>
        <Button
          size="sm"
          color={severe ? 'warning' : 'module'}
          disabled={blocked}
          loading={busy}
          onClick={onCommit}
        >
          Change how it is sold
        </Button>
      </AlertActions>
    </Alert>
  );
}

function consequenceLines(consequence: Consequence): string[] {
  const lines: string[] = [];

  if (consequence.loose.length > 0) {
    const count = consequence.loose.length;
    lines.push('Shoppers stop choosing anything — this goes back to being sold one way.');
    lines.push(
      `${countOf(count, 'version', 'versions')} stay${count === 1 ? 's' : ''} on sale with no choice attached (${skus(consequence.loose)}). Retire the ones you do not want on the Variants tab.`
    );
    return lines;
  }

  lines.push(
    `${countOf(consequence.combinations, 'combination', 'combinations')} can be sold in all.`
  );

  if (consequence.adopted) {
    const { variant, coordinate } = consequence.adopted;
    lines.push(
      `Your existing version ${variant.sku} (${formatCents(variant.priceCents, variant.currency)}) becomes ${coordinate.map((point) => point.value).join(' · ')}, keeping its price and code.`
    );
  }
  if (consequence.keep.length > 0) {
    const count = consequence.keep.length;
    lines.push(
      `${countOf(count, 'version', 'versions')} keep${count === 1 ? 's' : ''} its price and code.`
    );
  }
  if (consequence.blank > 0) {
    const count = consequence.blank;
    lines.push(
      `${countOf(count, 'combination', 'combinations')} will have no price, so ${count === 1 ? 'it cannot' : 'they cannot'} be bought until you set ${count === 1 ? 'one' : 'them'} on the Variants tab.`
    );
  }
  if (consequence.retire.length > 0) {
    const count = consequence.retire.length;
    lines.push(
      `${countOf(count, 'version', 'versions')} lose${count === 1 ? 's' : ''} its place and stops being sold — ${skus(consequence.retire)}. Past orders keep their record, and you can bring ${count === 1 ? 'it' : 'them'} back.`
    );
  }
  if (consequence.combinations > 100) {
    lines.push(
      'That is a lot to keep priced and in stock. Most businesses find more than a hundred hard to manage.'
    );
  }
  return lines;
}

function skus(variants: Variant[]): string {
  const shown = variants.slice(0, 4).map((variant) => variant.sku);
  const rest = variants.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${String(rest)} more` : shown.join(', ');
}

function countOf(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
