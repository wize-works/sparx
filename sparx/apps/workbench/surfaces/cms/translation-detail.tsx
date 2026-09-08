'use client';

// One product, translated — its words in every language your customers read.
//
// This is a genuine FORM pane: someone types a Spanish description over several
// minutes and it is not committed until they press Save. So it holds a draft per
// language, registers the unsaved-work guard, and puts Save in the pane toolbar
// acting on the language on screen — a primary action floating mid-body belongs
// to nothing.
//
// It reads COMMERCE product data from inside the Content module, so the whole
// surface wears the commerce hue via <ModuleScope module="commerce">: the pane's
// tab stays Content-teal, its content reads commerce-orange.
//
// ── The product's own copy is not a translation ──────────────────────────
//
// The product's title and description ARE the default language — no row exists
// for them. They are shown on the LEFT of each field, read-only, as the thing
// being translated FROM. An editor that opened with only empty Spanish boxes
// would give you nothing to translate against.
//
// ── PUT is whole-row ─────────────────────────────────────────────────────
//
// Saving a language replaces its entire row: an omitted optional field is stored
// as NULL, not left alone. So Save always sends all four fields, turning an empty
// box into the cleared value — which is what makes "remove the Spanish search
// description" expressible. The data layer's useSaveTranslation enforces this;
// nothing here routes around it.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Tabs,
  TabsList,
  TabsTab,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Languages, Plus, Save, ServerCrash, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { ModuleScope } from '../../components/module-scope';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  canonicalLocale,
  isValidLocale,
  localeName,
  productStatusState,
  translationErrorMessage,
  useDeleteTranslation,
  useProductSource,
  useProductTranslations,
  useSaveTranslation,
  type ProductSource,
  type ProductTranslation,
} from './translations-data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/** The four fields a language carries, held as strings throughout — empty means
 *  "cleared", which Save turns into the NULL the server stores. Strings (not
 *  `string | null`) keep the controls controlled without React's warning. */
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

/* ── The outer surface: load, or explain why not ────────────────────────── */

export function TranslationDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const productId = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const source = useProductSource(productId);
  const translations = useProductTranslations(productId);

  const title = source.data?.title ?? 'Translations';
  useEffect(() => {
    ctx.setTitle(title);
  }, [ctx, title]);

  const refresh = () => {
    void source.refetch();
    void translations.refetch();
  };

  // A failed load REPLACES the form — an empty form beside a dead Save is worse
  // than an honest "could not load".
  const failed = source.isError || translations.isError;
  const loading = source.isPending || translations.isPending;

  if (productId === '' || failed || loading) {
    return (
      <ModuleScope module="commerce" className={PANE_SHELL}>
        <PaneToolbar
          label="Product translations actions"
          controls={
            <>
              <Languages className="size-4 shrink-0" aria-hidden />
              <Heading level={2} className="min-w-0 truncate text-base font-semibold">
                {productId === '' ? 'Translations' : title}
              </Heading>
            </>
          }
          refresh={
            <RefreshButton
              className="ml-auto"
              isFetching={source.isFetching || translations.isFetching}
              updatedAt={source.data ? source.dataUpdatedAt : undefined}
              onRefresh={refresh}
            />
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            {productId === '' ? (
              <EmptyState
                icon={<Languages className="size-6" aria-hidden />}
                title="No product chosen"
                description="Open a product from the translations list to write its words in another language."
              />
            ) : failed ? (
              <EmptyState
                icon={<ServerCrash className="size-6" aria-hidden />}
                title="Could not load this product"
                description={translationErrorMessage(
                  source.error ?? translations.error,
                  'This is a problem reaching the server. None of your wording has been lost.'
                )}
                actions={
                  <Button size="sm" color="module" onClick={refresh}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <p className="text-sm" role="status">
                Loading…
              </p>
            )}
          </div>
        </div>
      </ModuleScope>
    );
  }

  return (
    <Editor
      productId={productId}
      product={source.data}
      rows={translations.data}
      isFetching={translations.isFetching}
      dataUpdatedAt={translations.dataUpdatedAt}
      onRefresh={refresh}
    />
  );
}

/* ── The editor ─────────────────────────────────────────────────────────── */

function Editor({
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
  const toast = useToast();
  const confirm = useConfirm();
  const saveTranslation = useSaveTranslation(productId);
  const removeTranslation = useDeleteTranslation(productId);
  const status = productStatusState(product.status);

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

  return (
    <ModuleScope module="commerce" className={PANE_SHELL}>
      <PaneToolbar
        label="Product translations actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            disabled={!canSave}
            loading={saveTranslation.isPending}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            {active === '' ? 'Save' : `Save ${localeName(active)}`}
          </Button>
        }
        controls={
          <>
            <Languages className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {product.title}
            </Heading>
            <Badge color={status.tone} variant="soft" size="sm">
              {status.label}
            </Badge>
          </>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={onRefresh} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {product.title}
            </Heading>
            <Text className="text-base">
              {locales.length === 0
                ? 'Written in one language. Add another and shoppers reading your site in it will see your words, not a machine translation.'
                : `Translate this product’s name and description. Your own words are on the left of each box; type the translation on the right.`}
            </Text>
          </div>

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
                <FormSection
                  title={localeName(active)}
                  description={`Shown to anyone reading your site in ${localeName(active)}. Anything you leave empty falls back to your own words.`}
                  action={
                    <Badge color={isNew ? 'warning' : 'success'} variant="soft">
                      {isNew ? 'Not saved yet' : active}
                    </Badge>
                  }
                >
                  <TranslatedField
                    label="Name"
                    source={product.title}
                    sourceEmpty="This product has no name."
                    description="Required — a language with no name for the product cannot be saved."
                  >
                    <Input
                      color="module"
                      value={current.title}
                      placeholder={product.title}
                      onChange={(event) => {
                        set('title', event.target.value);
                      }}
                    />
                  </TranslatedField>

                  <TranslatedField
                    label="Description"
                    source={product.description}
                    sourceEmpty="This product has no description yet."
                    description="Leave it empty and readers see your own description instead."
                  >
                    <Textarea
                      color="module"
                      rows={6}
                      value={current.description}
                      placeholder={product.description ?? ''}
                      onChange={(event) => {
                        set('description', event.target.value);
                      }}
                    />
                  </TranslatedField>

                  <TranslatedField
                    label="Title for search engines"
                    source={product.seoTitle}
                    sourceEmpty="Falls back to the name above."
                    description="The heading someone sees on a results page, in this language."
                  >
                    <Input
                      color="module"
                      value={current.seoTitle}
                      placeholder={product.seoTitle ?? ''}
                      onChange={(event) => {
                        set('seoTitle', event.target.value);
                      }}
                    />
                  </TranslatedField>

                  <TranslatedField
                    label="Summary for search engines"
                    source={product.seoDescription}
                    sourceEmpty="Falls back to your description."
                    description="The couple of lines under the heading on a results page. Around 155 characters."
                  >
                    <Textarea
                      color="module"
                      rows={3}
                      value={current.seoDescription}
                      placeholder={product.seoDescription ?? ''}
                      onChange={(event) => {
                        set('seoDescription', event.target.value);
                      }}
                    />
                  </TranslatedField>

                  {/* Removing a language is rare and permanent, so it sits after
                      the work under a divider rather than as a card of its own. */}
                  <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <Text className="text-sm">
                      {isNew
                        ? 'This language has not been saved yet. Discarding it loses only what you have typed here.'
                        : `Removing ${localeName(active)} deletes its wording. Readers fall back to your own language.`}
                    </Text>
                    <Button
                      size="sm"
                      variant="outline"
                      color="danger"
                      loading={removeTranslation.isPending}
                      onClick={onRemove}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {isNew ? 'Discard it' : `Remove ${localeName(active)}`}
                    </Button>
                  </div>
                </FormSection>
              )}
            </Tabs>
          )}

          <AddLanguage existing={locales} onAdd={addLanguage} />
        </div>
      </div>
    </ModuleScope>
  );
}

/* ── One field, source beside translation ───────────────────────────────── */

function TranslatedField({
  label,
  source,
  sourceEmpty,
  description,
  children,
}: {
  label: string;
  source: string | null;
  sourceEmpty: string;
  description: string;
  /** The editable control for the translation — an <Input> or <Textarea>. A
   *  single element, because it is handed straight to FieldControl's `render`. */
  children: React.ReactElement<Record<string, unknown>>;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-2 @2xl:grid-cols-2 @2xl:gap-4">
        <div className="bg-base-200 flex flex-col gap-1 rounded-md p-3">
          <Text as="span" className="text-sm font-medium">
            Your words
          </Text>
          <Text className="text-base whitespace-pre-line">
            {source && source.trim() !== '' ? source : sourceEmpty}
          </Text>
        </div>
        <FieldControl render={children} />
      </div>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

/* ── Add a language ─────────────────────────────────────────────────────── */

function AddLanguage({ existing, onAdd }: { existing: string[]; onAdd: (locale: string) => void }) {
  const [raw, setRaw] = useState('');
  const canonical = canonicalLocale(raw);
  const duplicate = existing.includes(canonical);
  const valid = raw.trim() !== '' && isValidLocale(raw) && !duplicate;

  const commit = () => {
    if (!valid) return;
    onAdd(canonical);
    setRaw('');
  };

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
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit();
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
        <Button size="sm" color="module" disabled={!valid} onClick={commit}>
          <Plus className="size-4" aria-hidden />
          Add this language
        </Button>
      </div>
    </FormSection>
  );
}
