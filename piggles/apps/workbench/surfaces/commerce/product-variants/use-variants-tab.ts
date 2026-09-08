'use client';

// What the Variants tab holds: the grid it derives, the drafts it edits, and the
// one Save that commits them. The other writes live in variant-actions.ts.

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@wizeworks/silicaui-react';

import { useDirtySource } from '../../../lib/workbench/dirty';
import { useTabSave } from '../product-tab-save';
import { buildPatch, changed, draftProblem, toDraft, type VariantDraft } from './draft';
import { skuStem, slotsOf } from './slots';
import { useVariantActions } from './variant-actions';
import {
  productErrorMessage,
  useProductOptions,
  useProductVariants,
  useUpdateVariant,
  type Product,
  type Variant,
} from '../products-data';

export function useVariantsTab(product: Product) {
  const toast = useToast();

  const options = useProductOptions(product.id);
  // Retired versions come back too: they still hold their code against the
  // business-wide unique index, so "that code already exists" is otherwise
  // caused by a row the operator has no way to see.
  const variants = useProductVariants(product.id, true);
  const update = useUpdateVariant(product.id);

  const all = useMemo(() => variants.data ?? [], [variants.data]);
  const live = useMemo(() => all.filter((variant) => variant.deletedAt === null), [all]);
  const retired = useMemo(() => all.filter((variant) => variant.deletedAt !== null), [all]);
  const axes = useMemo(() => options.data ?? [], [options.data]);
  const slots = useMemo(() => slotsOf(axes, live, retired), [axes, live, retired]);

  /** The code this product already carries, and every code it already holds.
   *  Both are needed wherever a new version is offered a code, and both are
   *  worked out ONCE here: three places offer one, and a stem derived three
   *  times is a stem that drifts (issue 172). */
  const stem = useMemo(() => skuStem(product, slots, live), [product, slots, live]);
  const taken = useMemo(() => new Set(all.map((variant) => variant.sku.toLowerCase())), [all]);

  const actions = useVariantActions(product, all, live, stem);

  const saved = useMemo(() => {
    const map: Record<string, VariantDraft> = {};
    for (const variant of live) map[variant.id] = toDraft(variant);
    return map;
  }, [live]);

  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>(saved);
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [open, setOpen] = useState<Record<string, true>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Adopt the server's copy for every row the operator has NOT edited, so a
  // refetch lands without stepping on unsaved work in the row beside it.
  useEffect(() => {
    setDrafts((current) => {
      const next: Record<string, VariantDraft> = {};
      for (const [id, row] of Object.entries(saved)) {
        next[id] = touched[id] && current[id] ? current[id] : row;
      }
      return next;
    });
  }, [saved, touched]);

  /** Every row that moved, paired with what the server currently holds. */
  const pending = Object.entries(saved).flatMap(([id, before]) => {
    const draft = drafts[id];
    return draft && changed(draft, before) ? [{ id, draft, before }] : [];
  });
  const problems = pending.flatMap((entry) => {
    const message = draftProblem(entry.draft);
    return message ? [{ id: entry.id, message }] : [];
  });

  useDirtySource(
    pending.length > 0,
    'Some versions of this product have unsaved prices on the Variants tab. Close anyway?'
  );

  const setDraft = (id: string, change: Partial<VariantDraft>) => {
    setTouched((current) => ({ ...current, [id]: true }));
    setDrafts((current) => {
      const row = current[id];
      if (!row) return current;
      return { ...current, [id]: { ...row, ...change } };
    });
  };

  const saveOne = async (entry: { id: string; draft: VariantDraft; before: VariantDraft }) => {
    const { id, draft, before } = entry;
    try {
      await update.mutateAsync({
        id,
        ...(draft.sku.trim() !== before.sku ? { sku: draft.sku.trim() } : {}),
        patch: buildPatch(draft, before),
      });
      setTouched((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error) {
      setSaveError(
        productErrorMessage(
          error,
          `Could not save ${draft.sku.trim()}. Nothing about that version was changed.`
        )
      );
      throw error;
    }
  };

  // Handed UP to the pane toolbar — this tab renders no Save of its own. It
  // THROWS on failure: the toolbar is what reports, and a tab that swallowed its
  // own error would leave the toolbar claiming a write that never happened.
  useTabSave({
    dirty: pending.length > 0,
    saving: update.isPending,
    save: async () => {
      if (pending.length === 0) return;
      // Refused rather than half-written. With a bad code somewhere in the set,
      // writing the rows either side of it and stopping is the worse outcome.
      if (problems.length > 0) {
        setSaveError(problems[0]?.message ?? null);
        throw new Error('Some versions still need fixing before they can be saved.');
      }
      setSaveError(null);
      // Sequential on purpose: a code clash has to stop the run and name itself,
      // rather than arriving as one of eleven simultaneous rejections.
      for (const entry of pending) await saveOne(entry);
      toast.add({
        title: pending.length === 1 ? 'Version saved' : `${String(pending.length)} versions saved`,
        type: 'success',
      });
    },
  });

  const rowProps = {
    drafts,
    saved,
    open,
    onToggle: (id: string) => {
      setOpen((current) => {
        const next = { ...current };
        if (next[id]) delete next[id];
        else next[id] = true;
        return next;
      });
    },
    onChange: setDraft,
    onRetire: (variant: Variant) => {
      void actions.onRetire(variant);
    },
    onMakeDefault: actions.onMakeDefault,
  };

  const placed = new Set(
    slots
      .flatMap((slot) => [slot.variant?.id, ...slot.retired.map((v) => v.id)])
      .filter((id) => id !== undefined)
  );
  const stranded = axes.length > 0 ? live.filter((variant) => !placed.has(variant.id)) : [];
  // Only versions with NO combination at all. One that is stopped but still sits
  // on a coordinate has a place; saying it has none is false, and it is the
  // ordinary state of every version somebody replaced (issue 306).
  const homeless = retired.filter((variant) => !placed.has(variant.id));
  // Stopped, on a combination, and something else is being sold there. Nothing
  // is wrong with these — they are at rest — but their codes stay reserved, so
  // hiding them is what makes "that code already exists" unanswerable.
  const resting = slots.flatMap((slot) => (slot.variant ? slot.retired : []));
  // A combination whose version is only RETIRED is not empty — bringing it back
  // is the move, and creating a second one on the same coordinate is what put
  // "-2" codes carrying no stock on sale beside it (issue 305).
  const empty = slots.filter((slot) => slot.variant === null && slot.retired.length === 0);
  // Somewhere a displaced version can go. Wider than `empty` on purpose: a
  // combination holding a stopped version has nothing on sale in it, and
  // refusing those would leave a shop whose every combination is occupied by the
  // wrong version with no way back at all.
  const free = axes.length > 0 ? slots.filter((slot) => slot.variant === null) : [];

  return {
    options,
    variants,
    live,
    retired,
    homeless,
    axes,
    slots,
    stem,
    taken,
    stranded,
    resting,
    empty,
    free,
    pending,
    saveError,
    rowProps,
    create: actions.create,
    restoring: actions.restoring,
    placingId: actions.placingId,
    onRestore: actions.onRestore,
    onPlace: actions.onPlace,
    fillTheRest: actions.fillTheRest,
  };
}
