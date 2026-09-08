'use client';

// The translation editor — one product's words in one language at a time.
//
// Split from `translation-detail.tsx` under RULE #0.5, and split again: the
// draft bookkeeping lives in `use-translation-draft.ts`, one language's fields
// in `translation-form.tsx`. This file is the chrome around them.
//
// Save lives in the pane TOOLBAR and acts on the language on screen; a primary
// action floating mid-body belongs to nothing.

import { Badge, Button, Tabs, TabsList, TabsTab, Text } from '@wizeworks/silicaui-react';
import { faFloppyDisk } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import { LanguageForm } from './translation-form';
import { AddLanguage } from './translation-add-language';
import { useTranslationDraft } from './use-translation-draft';
import {
  localeName,
  productStatusState,
  type ProductSource,
  type ProductTranslation,
} from './translations-data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/* ── The editor ─────────────────────────────────────────────────────────── */

export function Editor({
  productId,
  product,
  rows,
  isFetching,
  dataUpdatedAt,
  onRefresh,
}: {
  productId: string;
  product: ProductSource;
  rows: ProductTranslation[];
  isFetching: boolean;
  dataUpdatedAt: number;
  onRefresh: () => void;
}) {
  const status = productStatusState(product.status);
  const draft = useTranslationDraft(productId, product, rows);
  const {
    locales,
    active,
    setActive,
    current,
    isNew,
    dirtyLocales,
    canSave,
    saving,
    removing,
    set,
    save,
    addLanguage,
    onRemove,
  } = draft;

  return (
    <ModuleScope module="commerce" className={PANE_SHELL}>
      <PaneToolbar
        label="Product translations actions"
        status={
          <Badge color={status.tone} variant="soft" size="sm">
            {status.label}
          </Badge>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            disabled={!canSave}
            loading={saving}
            onClick={save}
          >
            <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
            {active === '' ? 'Save' : `Save ${localeName(active)}`}
          </Button>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={onRefresh} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text className="text-base">
            {locales.length === 0
              ? 'Written in one language. Add another and shoppers reading your site in it will see your words, not a machine translation.'
              : `Translate this product’s name and description. Your own words are on the left of each box; type the translation on the right.`}
          </Text>

          {locales.length === 0 ? null : (
            <Tabs
              variant="pills"
              color="module"
              value={active}
              onValueChange={(next) => {
                setActive(String(next));
              }}
              className="flex flex-col gap-3"
            >
              <div className="bg-base-300 shrink-0 rounded-full px-4 py-2">
                <TabsList scrollable scrollLabel="languages">
                  {locales.map((locale) => (
                    <TabsTab key={locale} value={locale}>
                      {localeName(locale)}
                      {dirtyLocales.includes(locale) ? (
                        <span aria-label="has unsaved changes"> •</span>
                      ) : null}
                    </TabsTab>
                  ))}
                </TabsList>
              </div>

              {active === '' ? null : (
                <LanguageForm
                  locale={active}
                  isNew={isNew}
                  product={product}
                  draft={current}
                  onChange={set}
                  removing={removing}
                  onRemove={onRemove}
                />
              )}
            </Tabs>
          )}

          <AddLanguage existing={locales} onAdd={addLanguage} />
        </div>
      </div>
    </ModuleScope>
  );
}
