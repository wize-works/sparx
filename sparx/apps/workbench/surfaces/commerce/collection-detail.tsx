'use client';

// One collection — create it (manual or automatic), then manage it.
//
// Create and manage are the same surface: `{ id: 'new' }` builds it, `{ id }`
// manages it. The one real fork is the KIND of collection, chosen once at
// creation and fixed thereafter (the server refuses a manual↔automatic flip
// because it would throw away the other kind's data):
//
//   • MANUAL   — a list you hand-pick. The product picker is the whole job.
//   • AUTOMATIC — rules choose the products for you. The rule editor is the job,
//                 and after saving you can ask for the matches to be re-checked.
//
// A collection has no draft/publish lifecycle — it is live the moment it exists —
// so there is no publish button, just Save.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../lib/api/client';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { SiteScopeField } from '../../components/site-scope-field';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { MediaField } from './media-field';
import { CollectionRulesEditor } from './collection-rules';
import { CollectionProductsEditor } from './collection-products';
import { SaveFailure } from '@/components/save-failure';
import {
  asRuleSet,
  buildRuleSet,
  collectionErrorMessage,
  slugifyHandle,
  useCollection,
  useCreateCollection,
  useDeleteCollection,
  useReindexCollection,
  useSetCollectionProducts,
  useUpdateCollection,
  type CollectionDetail,
  type CollectionRuleSet,
  type CollectionType,
} from './collections-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const EMPTY_RULES: CollectionRuleSet = { match: 'all', predicates: [] };

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  name: string;
  handle: string;
  description: string;
  featured: boolean;
  heroMediaId: string | null;
  seoTitle: string;
  seoDescription: string;
  ogImageId: string | null;
  propertyIds: string[];
  /** Chosen at create, fixed after. */
  type: CollectionType;
  /** The rule set, used only when `type` is `rules`. */
  ruleSet: CollectionRuleSet;
  /** The hand-picked members, used only when `type` is `manual`. */
  productIds: string[];
}

function emptyDraft(): Draft {
  return {
    name: '',
    handle: '',
    description: '',
    featured: false,
    heroMediaId: null,
    seoTitle: '',
    seoDescription: '',
    ogImageId: null,
    propertyIds: [],
    type: 'manual',
    ruleSet: EMPTY_RULES,
    productIds: [],
  };
}

function toDraft(collection: CollectionDetail): Draft {
  return {
    name: collection.name,
    handle: collection.handle,
    description: collection.description ?? '',
    featured: collection.featured,
    heroMediaId: collection.heroMediaId,
    seoTitle: collection.seoTitle ?? '',
    seoDescription: collection.seoDescription ?? '',
    ogImageId: collection.ogImageId,
    propertyIds: collection.propertyIds,
    type: collection.type,
    ruleSet: asRuleSet(collection.ruleSet) ?? EMPTY_RULES,
    productIds: collection.productIds,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((value) => seen.has(value));
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function CollectionDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? (
    <CollectionEditor ctx={ctx} id="new" />
  ) : (
    <CollectionLoader ctx={ctx} id={id} />
  );
}

function CollectionLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: collection, isPending, isError, error, refetch } = useCollection(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="collection"
        title="Could not load this collection"
        description="This is a problem reaching the server. The collection itself is unaffected — nothing has been lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !collection) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <CollectionEditor ctx={ctx} id={id} collection={collection} />;
}

function CollectionEditor({
  ctx,
  id,
  collection,
}: {
  ctx: SurfaceContext;
  id: string;
  collection?: CollectionDetail;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateCollection();
  const update = useUpdateCollection(id);
  const setProducts = useSetCollectionProducts(id);
  const reindex = useReindexCollection(id);
  const remove = useDeleteCollection(id);

  const saved = useMemo(() => (collection ? toDraft(collection) : emptyDraft()), [collection]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  const [handleTouched, setHandleTouched] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New collection' : (collection?.name ?? 'Collection'));
  }, [ctx, isNew, collection]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const effectiveHandle = isNew && !handleTouched ? slugifyHandle(draft.name) : draft.handle;
  const nameError = draft.name.trim() === '' ? 'Give the collection a name.' : null;

  const membershipChanged = draft.type === 'manual' && !sameSet(draft.productIds, saved.productIds);
  const rulesChanged =
    draft.type === 'rules' && JSON.stringify(draft.ruleSet) !== JSON.stringify(saved.ruleSet);

  const dirty = isNew
    ? draft.name.trim() !== '' ||
      handleTouched ||
      draft.description.trim() !== '' ||
      draft.featured ||
      draft.heroMediaId !== null ||
      draft.seoTitle.trim() !== '' ||
      draft.seoDescription.trim() !== '' ||
      draft.ogImageId !== null ||
      draft.propertyIds.length > 0 ||
      draft.productIds.length > 0 ||
      draft.ruleSet.predicates.length > 0
    : draft.name !== saved.name ||
      draft.handle !== saved.handle ||
      draft.description !== saved.description ||
      draft.featured !== saved.featured ||
      draft.heroMediaId !== saved.heroMediaId ||
      draft.seoTitle !== saved.seoTitle ||
      draft.seoDescription !== saved.seoDescription ||
      draft.ogImageId !== saved.ogImageId ||
      !sameSet(draft.propertyIds, saved.propertyIds) ||
      membershipChanged ||
      rulesChanged;

  const saving = create.isPending || update.isPending || setProducts.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This collection has not been created yet. Close anyway?'
      : 'This collection has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError || setProducts.isError
      ? collectionErrorMessage(
          create.error ?? update.error ?? setProducts.error,
          'Could not save this collection. Nothing was changed.'
        )
      : null;

  /* ── Save ─────────────────────────────────────────────────────────────── */

  const nullable = (value: string) => (value.trim() === '' ? null : value.trim());

  const submit = () => {
    if (nameError) return;
    setRuleError(null);

    // An automatic collection MUST carry a rule set the compiler accepts. This is
    // the one hard gate: validate against the real schema before anything is
    // written, and name the first problem in plain words.
    let ruleSet: CollectionRuleSet | undefined;
    if (draft.type === 'rules') {
      const result = buildRuleSet(draft.ruleSet);
      if (!result.ok) {
        setRuleError(
          draft.ruleSet.predicates.length === 0
            ? 'Add at least one condition so the collection knows which products to include.'
            : result.error
        );
        return;
      }
      ruleSet = result.value;
    }

    if (isNew) {
      create.mutate(
        {
          name: draft.name.trim(),
          handle: effectiveHandle || undefined,
          description: nullable(draft.description),
          type: draft.type,
          ...(ruleSet ? { ruleSet } : {}),
          heroMediaId: draft.heroMediaId,
          featured: draft.featured,
          seoTitle: nullable(draft.seoTitle),
          seoDescription: nullable(draft.seoDescription),
          ogImageId: draft.ogImageId,
          propertyIds: draft.propertyIds,
        },
        {
          onSuccess: (created) => {
            const land = () => {
              ctx.open('commerce.collection.detail', { id: created.id }, { target: 'replace' });
              afterPaneChange(() => {
                toast.add({ title: `${draft.name.trim()} created`, type: 'success' });
              });
            };
            // A brand-new manual collection with members set has to write them in
            // a second call, now that the collection exists to hang them off.
            if (draft.type === 'manual' && draft.productIds.length > 0) {
              void setProductsAfterCreate(created.id, draft.productIds).finally(land);
            } else {
              land();
            }
          },
        }
      );
      return;
    }

    void (async () => {
      try {
        await update.mutateAsync({
          name: draft.name.trim(),
          handle: draft.handle,
          description: nullable(draft.description),
          ...(ruleSet ? { ruleSet } : {}),
          heroMediaId: draft.heroMediaId,
          featured: draft.featured,
          seoTitle: nullable(draft.seoTitle),
          seoDescription: nullable(draft.seoDescription),
          ogImageId: draft.ogImageId,
          propertyIds: draft.propertyIds,
        });
        if (membershipChanged) {
          await setProducts.mutateAsync(draft.productIds);
        }
        setTouched(false);
        toast.add({ title: 'Collection saved', type: 'success' });
      } catch {
        // The alert in the body reports it; the draft still holds everything.
      }
    })();
  };

  const onReindex = () => {
    reindex.mutate(undefined, {
      onSuccess: () => {
        toast.add({
          title: 'Re-checking which products match',
          description:
            'This happens in the background, so the count here updates shortly rather than instantly.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not start the re-check',
          description: collectionErrorMessage(error, 'Nothing was changed. Try again in a moment.'),
          type: 'error',
        });
      },
    });
  };

  const onDelete = async () => {
    if (!collection) return;
    const count = collection.productCount;
    const ok = await confirm({
      title: `Delete ${collection.name}?`,
      description:
        count > 0
          ? `This collection is removed from your website. The ${String(count)} product${count === 1 ? '' : 's'} in it ${count === 1 ? 'is' : 'are'} kept — only the grouping goes. This cannot be undone.`
          : 'This collection is removed from your website. The products themselves are kept. This cannot be undone.',
      confirmLabel: 'Delete this collection',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${collection.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this collection',
          description: collectionErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const isRules = draft.type === 'rules';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Collection actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(nameError) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create collection' : 'Save'}
          </Button>
        }
        controls={
          <>
            {!isNew ? (
              <Badge color={isRules ? 'info' : 'neutral'} variant="soft" size="sm">
                {isRules ? 'Automatic' : 'Hand-picked'}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Add a collection
              </Heading>
              <Text>
                A collection is a themed group of products you show together — a summer sale, a gift
                guide, this month&apos;s arrivals. Unlike a category, it is not part of your menu:
                it is a set you can place anywhere on your site.
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this collection" message={failure} />

          <FormSection title="Name">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    placeholder="Summer sale"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>What shoppers see at the top of the group.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Web address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={effectiveHandle}
                    placeholder="summer-sale"
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      setHandleTouched(true);
                      set('handle', slugifyHandle(event.target.value));
                    }}
                  />
                }
              />
              <FieldDescription>
                The end of this collection&apos;s page address — yoursite.com/collections/
                {effectiveHandle || '…'}.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Description</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={draft.description}
                    placeholder="A line or two shown at the top of the collection."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>

            <Field>
              <FieldLabel>Feature this collection</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.featured}
                    onCheckedChange={(next: boolean) => {
                      set('featured', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                Marks it as one to highlight — themes can show featured collections on the home
                page.
              </FieldDescription>
            </Field>
          </FormSection>

          {/* HOW the products get in. Chosen once on create; fixed after. */}
          {isNew ? (
            <FormSection
              title="How products get into it"
              description="This cannot be changed later, so it is worth a moment now."
            >
              <Field>
                <FieldLabel>Way of choosing</FieldLabel>
                <FieldControl
                  render={
                    <div className="max-w-xs">
                      <Select
                        color="module"
                        aria-label="Way of choosing products"
                        value={draft.type}
                        items={[
                          { value: 'manual', label: 'I pick the products myself' },
                          { value: 'rules', label: 'Rules pick the products for me' },
                        ]}
                        onValueChange={(next) => {
                          set('type', (next as CollectionType) ?? 'manual');
                        }}
                      />
                    </div>
                  }
                />
                <FieldDescription>
                  {isRules
                    ? 'You describe what belongs — say, everything under a set price from a certain brand — and matching products are pulled in automatically, and drop out again when they stop matching.'
                    : 'You choose each product by hand. Good for a curated set that will not change on its own.'}
                </FieldDescription>
              </Field>
            </FormSection>
          ) : null}

          {isRules ? (
            <FormSection
              title="Which products belong here"
              description="Describe the products this collection should contain. Anything matching is added for you."
              action={
                !isNew && collection ? (
                  <Button
                    size="sm"
                    variant="outline"
                    color="neutral"
                    loading={reindex.isPending}
                    title="Re-check which products match these conditions"
                    onClick={onReindex}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    Update matches
                  </Button>
                ) : undefined
              }
            >
              {ruleError ? (
                <Alert color="warning">
                  <AlertContent>
                    <AlertTitle>These conditions are not ready yet</AlertTitle>
                    <AlertDescription>{ruleError}</AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              {!isNew && collection ? (
                <Text className="text-sm">
                  {collection.productCount === 0
                    ? 'No products match these conditions yet — or the last check has not run. Membership is worked out in the background after you save.'
                    : `${String(collection.productCount)} product${collection.productCount === 1 ? '' : 's'} matched when membership was last worked out. It refreshes in the background after a change.`}
                </Text>
              ) : null}

              <CollectionRulesEditor
                value={draft.ruleSet}
                onChange={(next) => {
                  setRuleError(null);
                  set('ruleSet', next);
                }}
              />
            </FormSection>
          ) : (
            <FormSection
              title="The products in it"
              description="Pick the products that belong in this collection."
            >
              <CollectionProductsEditor
                collectionId={isNew ? null : id}
                value={draft.productIds}
                onChange={(next) => {
                  set('productIds', next);
                }}
              />
            </FormSection>
          )}

          <FormSection
            title="Banner image"
            description="Optional. A picture your theme can show across the top of the collection's page."
          >
            <MediaField
              label="Banner image"
              description="A wide picture shown at the top of this collection's page."
              value={draft.heroMediaId}
              onChange={(next) => {
                set('heroMediaId', next);
              }}
            />
          </FormSection>

          <SiteScopeField
            value={draft.propertyIds}
            onChange={(next) => {
              set('propertyIds', next);
            }}
            title="Which of your sites show it"
            description="You run more than one website, so a collection can appear on all of them or just some."
          />

          <FormSection
            title="How it looks in search results"
            description="Optional. The title and summary shown when someone finds this collection on Google. Left empty, the name and description above are used."
          >
            <Field>
              <FieldLabel>Search title</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.seoTitle}
                    placeholder={draft.name || 'Summer sale'}
                    onChange={(event) => {
                      set('seoTitle', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Search summary</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={draft.seoDescription}
                    placeholder="One or two sentences on what someone finds in this collection."
                    onChange={(event) => {
                      set('seoDescription', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <MediaField
              label="Picture when shared"
              description="Shown when a link to this collection is pasted into a message or a post."
              value={draft.ogImageId}
              onChange={(next) => {
                set('ogImageId', next);
              }}
            />
          </FormSection>

          {!isNew && collection ? (
            <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
              <Text className="text-sm">
                A collection&apos;s kind — hand-picked or automatic — is fixed once it is created.
                To switch, delete this one and make a new one.
              </Text>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Deleting removes this collection from your website. The products in it are kept —
                  only the grouping goes.
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
                  Delete this collection
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Set a freshly-created manual collection's members.
 *
 * A plain function, not a hook: it runs in a create callback AFTER the collection
 * exists, so the collection-scoped `useSetCollectionProducts(id)` — bound to the
 * id we did not have a moment ago — cannot serve. Failure is soft: the collection
 * was created, so the pane still lands on it and the member write can be retried
 * there.
 */
async function setProductsAfterCreate(collectionId: string, productIds: string[]): Promise<void> {
  await api
    .post('/v1/commerce/collections/set-products', { collectionId, productIds })
    .catch(() => undefined);
}
