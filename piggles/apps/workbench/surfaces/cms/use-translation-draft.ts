'use client';

// The draft a translation editor is holding, and the things you can do to it.
//
// Split from `translation-editor.tsx` under RULE #0.5: one file owns what a
// half-written translation IS, the other owns what it looks like.
//
// ── PUT is whole-row ─────────────────────────────────────────────────────
//
// Saving a language replaces its entire row: an omitted optional field is stored
// as NULL, not left alone. So Save always sends all four fields, turning an empty
// box into the cleared value — which is what makes "remove the Spanish search
// description" expressible.

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { Draft } from './translation-form';
import {
  localeName,
  translationErrorMessage,
  useDeleteTranslation,
  useSaveTranslation,
  type ProductSource,
  type ProductTranslation,
} from './translations-data';

const BLANK: Draft = { title: '', description: '', seoTitle: '', seoDescription: '' };

function toDraft(row: ProductTranslation): Draft {
  return {
    title: row.title,
    description: row.description ?? '',
    seoTitle: row.seoTitle ?? '',
    seoDescription: row.seoDescription ?? '',
  };
}

function same(a: Draft, b: Draft): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.seoTitle === b.seoTitle &&
    a.seoDescription === b.seoDescription
  );
}

export function useTranslationDraft(
  productId: string,
  product: ProductSource,
  rows: ProductTranslation[]
) {
  const toast = useToast();
  const confirm = useConfirm();
  const saveTranslation = useSaveTranslation(productId);
  const removeTranslation = useDeleteTranslation(productId);

  // Languages added in this pane but not yet saved — they live only here, which
  // is what lets "add a language" not need a round trip before you can type.
  const [pending, setPending] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState<string>(rows[0]?.locale ?? '');

  const saved = useMemo(() => {
    const map: Record<string, Draft> = {};
    for (const row of rows) map[row.locale] = toDraft(row);
    return map;
  }, [rows]);

  const locales = useMemo(() => {
    const serverLocales = rows.map((row) => row.locale);
    return [...serverLocales, ...pending.filter((locale) => !serverLocales.includes(locale))];
  }, [rows, pending]);

  // A newly saved language stops being pending; a tab removed on the server must
  // not stay selected pointing at nothing.
  useEffect(() => {
    setPending((current) => current.filter((locale) => !rows.some((row) => row.locale === locale)));
  }, [rows]);
  useEffect(() => {
    if (active === '' || !locales.includes(active)) setActive(locales[0] ?? '');
  }, [locales, active]);

  const currentSaved = saved[active] ?? BLANK;
  const current = drafts[active] ?? currentSaved;
  const isNew = active !== '' && !(active in saved);
  const dirty = active !== '' && !same(current, currentSaved);

  // Every language with unsaved edits, not just the one on screen — the tab strip
  // hides the others, and losing a German description because you were looking at
  // Spanish when the pane closed is exactly the loss the guard exists for.
  const dirtyLocales = locales.filter((locale) => {
    const draft = drafts[locale];
    if (!draft) return false;
    return !same(draft, saved[locale] ?? BLANK);
  });
  useDirtySource(
    dirtyLocales.length > 0,
    dirtyLocales.length === 1
      ? `Your ${localeName(dirtyLocales[0] ?? '')} wording has not been saved. Close anyway?`
      : 'Some of your translations have not been saved. Close anyway?'
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDrafts((existing) => ({ ...existing, [active]: { ...current, [key]: value } }));
  };

  const canSave = dirty && current.title.trim() !== '';

  const save = () => {
    if (!canSave) return;
    saveTranslation.mutate(
      {
        locale: active,
        // ALL FOUR, ALWAYS — see the whole-row note at the top of this file.
        title: current.title.trim(),
        description: current.description.trim() === '' ? null : current.description,
        seoTitle: current.seoTitle.trim() === '' ? null : current.seoTitle.trim(),
        seoDescription: current.seoDescription.trim() === '' ? null : current.seoDescription.trim(),
      },
      {
        onSuccess: () => {
          setDrafts((existing) => {
            const next = { ...existing };
            delete next[active];
            return next;
          });
          toast.add({ title: `${localeName(active)} saved`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: `Could not save the ${localeName(active)} wording`,
            description: translationErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const addLanguage = (locale: string) => {
    setPending((existing) => (existing.includes(locale) ? existing : [...existing, locale]));
    setActive(locale);
  };

  const onRemove = () => {
    if (isNew) {
      setPending((existing) => existing.filter((locale) => locale !== active));
      setDrafts((existing) => {
        const next = { ...existing };
        delete next[active];
        return next;
      });
      return;
    }
    void (async () => {
      const ok = await confirm({
        title: `Remove the ${localeName(active)} wording?`,
        description: `The ${localeName(active)} name, description and search wording for ${product.title} are deleted. Anyone reading your site in ${localeName(active)} will see it in your own language instead. This cannot be undone.`,
        confirmLabel: `Remove ${localeName(active)}`,
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      removeTranslation.mutate(active, {
        onSuccess: () => {
          setDrafts((existing) => {
            const next = { ...existing };
            delete next[active];
            return next;
          });
          toast.add({ title: `${localeName(active)} removed`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not remove that language',
            description: translationErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  return {
    locales,
    active,
    setActive,
    current,
    isNew,
    dirtyLocales,
    canSave,
    saving: saveTranslation.isPending,
    removing: removeTranslation.isPending,
    set,
    save,
    addLanguage,
    onRemove,
  };
}
