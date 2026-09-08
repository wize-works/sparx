'use client';

// Translations — this product's words in every language your sites are read in.
//
// Registered under `cms`, so `color="module"` resolves to the CMS hue.
//
// ── The one pane here that is genuinely a form ───────────────────────────
//
// Unlike its five siblings, this pane holds a DRAFT: someone types a Spanish
// description over several minutes and it is not committed until they say so. So
// it registers `useDirtySource` and its Save lives in the pane toolbar, acting on
// the language currently being edited — the same principle as the detail pane's
// tab save, arrived at from the same failure (a primary action floating mid-panel
// belongs to nothing).
//
// ── PUT is whole-row, and that is load-bearing ───────────────────────────
//
// The endpoint replaces the entire row for a locale: an omitted optional field
// is stored as NULL rather than left alone. That is deliberate — it is what makes
// "clear the Spanish search description" expressible without inventing a second
// verb. The consequence for this editor is absolute: it must always send ALL
// FOUR fields for the language being saved. Sending a partial would silently null
// whatever the operator had not touched in this session, which is data loss with
// no error message. `useSaveTranslation` takes all four for exactly this reason,
// and nothing here may route around it.
//
// ── Locale casing ────────────────────────────────────────────────────────
//
// Tags are canonicalized to BCP-47 — language lowercase, script Titlecase,
// region UPPERCASE. The pane canonicalizes on the way IN, before a draft row is
// keyed, because a draft under `en-us` that comes back from the server as `en-US`
// shows the language twice with the operator's edit apparently vanished.
//
// ── The product's own copy is not a translation ──────────────────────────
//
// The product's title and description ARE the default language, and no row
// exists for them. They are shown at the top, read-only, as the thing being
// translated FROM — an editor that opens with only empty Spanish boxes gives you
// nothing to translate against.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Tabs,
  TabsList,
  TabsTab,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { faFloppyDisk, faPlus, faServer, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { FollowingNotice, ProductScopeFallback, useProductScope } from './product-scope';
import {
  canonicalLocale,
  isValidLocale,
  localeName,
  productErrorMessage,
  useDeleteTranslation,
  useProductTranslations,
  useSaveTranslation,
  type Product,
  type ProductTranslation,
} from './products-data';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneWaiting } from '../../components/pane-waiting';

const LABEL = 'Translations';
/** Registry module for this pane, so the brand draws Content's own picture
 *  rather than the generic one. */
const MODULE = 'cms';

/** The four fields a language carries, as the editor holds them. Strings
 *  throughout — empty means "cleared", which the save turns into the NULL the
 *  server stores. Keeping them as `string` rather than `string | null` in the
 *  draft is what makes a controlled textarea possible without React's
 *  uncontrolled-input warning. */
interface Draft {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

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

/** A language someone is part-way through adding. It has no server row yet, so
 *  it lives only in the pane and is what makes "add a language" not require a
 *  round trip before you can type anything. */
interface Pending {
  locale: string;
  draft: Draft;
}

function AddLanguage({ existing, onAdd }: { existing: string[]; onAdd: (locale: string) => void }) {
  const [raw, setRaw] = useState('');
  const canonical = canonicalLocale(raw);
  const duplicate = existing.includes(canonical);
  const valid = raw.trim() !== '' && isValidLocale(raw) && !duplicate;

  return (
    <FormSection
      title="Add a language"
      description="Use the short code for the language — “es” for Spanish, “fr-CA” for Canadian French, “de” for German."
    >
      <Field>
        <FieldLabel>Language code</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={raw}
              spellCheck={false}
              autoComplete="off"
              placeholder="es"
              onChange={(event) => {
                setRaw(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && valid) {
                  onAdd(canonical);
                  setRaw('');
                }
              }}
            />
          }
        />
        <FieldDescription>
          {raw.trim() === ''
            ? 'Two letters for a language, optionally followed by a country — es, pt-BR, zh-Hans.'
            : duplicate
              ? `You already have ${localeName(canonical)} below.`
              : isValidLocale(raw)
                ? `Adds ${localeName(canonical)} (${canonical}).`
                : 'That is not a language code. Try two letters, like “es”, optionally with a country: “es-MX”.'}
        </FieldDescription>
      </Field>
      <div className="flex justify-end">
        <Button
          size="sm"
          color="module"
          disabled={!valid}
          onClick={() => {
            onAdd(canonical);
            setRaw('');
          }}
        >
          <Icon glyph={faPlus} className="size-4" aria-hidden />
          Add this language
        </Button>
      </div>
    </FormSection>
  );
}

function TranslationEditor({
  product,
  rows,
  productId,
  registerSave,
}: {
  product: Product;
  rows: ProductTranslation[];
  productId: string;
  registerSave: (state: {
    dirty: boolean;
    saving: boolean;
    save: (() => void) | null;
    label: string;
  }) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const saveTranslation = useSaveTranslation(productId);
  const removeTranslation = useDeleteTranslation(productId);

  const [pending, setPending] = useState<Pending[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [active, setActive] = useState<string>(rows[0]?.locale ?? '');

  const saved = useMemo(() => {
    const map: Record<string, Draft> = {};
    for (const row of rows) map[row.locale] = toDraft(row);
    return map;
  }, [rows]);

  // Locales that exist on the server, plus the ones being added in this pane.
  const locales = useMemo(() => {
    const serverLocales = rows.map((row) => row.locale);
    return [
      ...serverLocales,
      ...pending.map((p) => p.locale).filter((l) => !serverLocales.includes(l)),
    ];
  }, [rows, pending]);

  // A newly saved language stops being pending; a tab that was removed on the
  // server must not stay selected pointing at nothing.
  useEffect(() => {
    setPending((current) => current.filter((p) => !rows.some((row) => row.locale === p.locale)));
  }, [rows]);
  useEffect(() => {
    if (active === '' || !locales.includes(active)) setActive(locales[0] ?? '');
  }, [locales, active]);

  const currentSaved = saved[active] ?? pending.find((p) => p.locale === active)?.draft ?? BLANK;
  const current = drafts[active] ?? currentSaved;
  const isNew = !(active in saved);
  const dirty = active !== '' && !same(current, currentSaved);

  // Any language with unsaved edits, not just the one on screen — the tab strip
  // hides the others, and losing a Spanish description because you were looking
  // at German when you closed the pane is exactly the loss the guard exists for.
  const dirtyLocales = locales.filter((locale) => {
    const draft = drafts[locale];
    if (!draft) return false;
    const base = saved[locale] ?? pending.find((p) => p.locale === locale)?.draft ?? BLANK;
    return !same(draft, base);
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

  const save = () => {
    if (active === '' || current.title.trim() === '') return;
    saveTranslation.mutate(
      {
        locale: active,
        // ALL FOUR, ALWAYS. See the whole-row note at the top of this file.
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
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  // Handed up to the toolbar, so the Save that acts on this editor sits with the
  // pane's other controls instead of floating in the body.
  useEffect(() => {
    registerSave({
      dirty: dirty && current.title.trim() !== '',
      saving: saveTranslation.isPending,
      save: active === '' ? null : save,
      label: active === '' ? 'Save' : `Save ${localeName(active)}`,
    });
    // `save` closes over the current draft, so it must be re-registered whenever
    // that draft moves — which is what these dependencies track.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `save` is redefined every render by design; listing it would loop.
  }, [dirty, active, current, saveTranslation.isPending]);

  const onRemove = () => {
    if (isNew) {
      setPending((existing) => existing.filter((p) => p.locale !== active));
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
          toast.add({ title: `${localeName(active)} removed`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not remove that language',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  return (
    <>
      <Text className="text-sm">
        {locales.length === 0
          ? 'Written in one language. Add another and shoppers reading your site in it will see your words, not a machine translation.'
          : locales.length === 1
            ? 'Written in one other language as well as your own.'
            : `Written in ${String(locales.length)} other languages as well as your own.`}
      </Text>

      <FormSection
        title="What you wrote"
        description="Your own words, as they are on the product. This is what the languages below are translations of."
      >
        <div className="flex flex-col gap-2">
          <Text as="span" className="text-lg font-semibold">
            {product.title}
          </Text>
          <Text className="text-base whitespace-pre-line">
            {product.description ?? 'This product has no description yet.'}
          </Text>
        </div>
      </FormSection>

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
                  {/* A dot rather than the word "unsaved": the strip has to stay
                        readable at four languages in a narrow docked pane. */}
                  {dirtyLocales.includes(locale) ? (
                    <span aria-label="has unsaved changes"> •</span>
                  ) : null}
                </TabsTab>
              ))}
            </TabsList>
          </div>

          {/* One panel, re-keyed per language, rather than a TabsPanel each: the
              fields are identical and the draft is held above, so rendering
              every language's form and hiding all but one is pure waste on a
              product offered in eight languages. */}
          {active === '' ? null : (
            <FormSection
              title={localeName(active)}
              description={`Shown to anyone reading your site in ${localeName(active)}. Anything you leave empty falls back to your own words.`}
              action={
                <Badge color={isNew ? 'warning' : 'success'} variant="soft">
                  {isNew ? 'Not saved yet' : active}
                </Badge>
              }
            >
              <Field>
                <FieldLabel>Name</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={current.title}
                      placeholder={product.title}
                      onChange={(event) => {
                        set('title', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Required — a language with no name for the product cannot be saved.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Description</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={6}
                      value={current.description}
                      placeholder={product.description ?? ''}
                      onChange={(event) => {
                        set('description', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Leave it empty and readers see your own description instead.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Title for search engines</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={current.seoTitle}
                      placeholder={product.seoTitle ?? ''}
                      onChange={(event) => {
                        set('seoTitle', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  The heading someone sees on a results page, in this language.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Summary for search engines</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={3}
                      value={current.seoDescription}
                      placeholder={product.seoDescription ?? ''}
                      onChange={(event) => {
                        set('seoDescription', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  The couple of lines under the heading on a results page. Around 155 characters.
                </FieldDescription>
              </Field>

              {/* Removing a language is rare and permanent, so it sits after the
                  work under a divider rather than as a card of its own beside
                  the fields someone came here to fill in. */}
              <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <Text className="text-sm">
                  {isNew
                    ? `This language has not been saved yet. Discarding it loses only what you have typed here.`
                    : `Removing ${localeName(active)} deletes its wording. Readers fall back to your own language.`}
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  loading={removeTranslation.isPending}
                  onClick={onRemove}
                >
                  <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                  {isNew ? 'Discard it' : `Remove ${localeName(active)}`}
                </Button>
              </div>
            </FormSection>
          )}
        </Tabs>
      )}

      <AddLanguage
        existing={locales}
        onAdd={(locale) => {
          setPending((existing) => [...existing, { locale, draft: BLANK }]);
          setActive(locale);
        }}
      />
    </>
  );
}

export function ProductTranslationsSurface({ ctx }: { ctx: SurfaceContext }) {
  const scope = useProductScope(ctx, { label: LABEL });
  const productId = scope.productId ?? 'new';
  const translations = useProductTranslations(productId);

  // The toolbar's Save is owned by the editor below it, which is where the draft
  // lives. Held here so the button can sit in the bar with the pane's other
  // controls rather than floating in the body.
  const [saveState, setSaveState] = useState<{
    dirty: boolean;
    saving: boolean;
    save: (() => void) | null;
    label: string;
  }>({ dirty: false, saving: false, save: null, label: 'Save' });

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} module={MODULE} />;
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${LABEL} actions`}
        status={
          scope.isFollowing ? (
            <Badge color="info" variant="soft" size="sm">
              Following
            </Badge>
          ) : null
        }
        primary={
          saveState.save ? (
            <Button
              size="sm"
              color="module"
              className="ml-auto"
              disabled={!saveState.dirty}
              loading={saveState.saving}
              onClick={saveState.save}
            >
              <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
              {saveState.label}
            </Button>
          ) : null
        }
        refresh={
          <RefreshButton
            isFetching={translations.isFetching}
            updatedAt={translations.dataUpdatedAt}
            onRefresh={() => {
              void translations.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <FollowingNotice scope={scope} />

          {/* Carded on both non-ready branches, because the editor beside them is
              a stack of FormSections — each already a card. */}
          {translations.isError ? (
            <Card>
              <PaneLoadError
                module={MODULE}
                icon={<Icon glyph={faServer} className="size-6" aria-hidden />}
                title="Could not load the translations"
                description={productErrorMessage(
                  translations.error,
                  'This is a problem reaching the server. None of your wording has been lost.'
                )}
                onRetry={() => {
                  void translations.refetch();
                }}
              />
            </Card>
          ) : translations.data === undefined ? (
            <Card>
              <PaneWaiting module={MODULE} />
            </Card>
          ) : (
            <TranslationEditor
              product={scope.product}
              rows={translations.data}
              productId={scope.productId}
              registerSave={setSaveState}
            />
          )}
        </div>
      </div>
    </div>
  );
}
