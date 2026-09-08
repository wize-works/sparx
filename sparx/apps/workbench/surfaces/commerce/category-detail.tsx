'use client';

// One category — create it, then everything about it.
//
// Create and manage are the same surface because a category is the same object
// at two ages: `{ id: 'new' }` builds it, `{ id }` manages it. Splitting them is
// how a field ends up owned by two components. The whole form applies to both
// states — a category is filed, pictured and search-tuned from the moment it
// exists — so there is no smaller "add" branch here beyond skipping the reads.
//
// ── What a category IS, in the owner's words ───────────────────────────────
//
// A category is the part of the website MENU a product sits in — like an aisle
// in a shop. It nests: "Outdoor › Camping › Cookware". That is the one thing the
// copy on this surface has to keep making obvious, because "category" and
// "collection" are a step apart and the difference is not self-evident.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  NumberField,
  SearchInput,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { SiteScopeField } from '../../components/site-scope-field';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { MediaField } from './media-field';
import { SaveFailure } from '@/components/save-failure';
import {
  categoryErrorMessage,
  slugifyHandle,
  useCategory,
  useCreateCategory,
  useDeleteCategory,
  useReparentCategory,
  useUpdateCategory,
  useCategoryTree,
  type CategoryDetail,
  type CategoryNode,
} from './categories-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** The one column everything sits in. Centred and capped, because a pane torn
 *  onto a second monitor is otherwise 2000px of dead grey. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── The draft ──────────────────────────────────────────────────────────── */

interface Draft {
  name: string;
  handle: string;
  description: string;
  parentId: string | null;
  position: number;
  featured: boolean;
  iconMediaId: string | null;
  heroMediaId: string | null;
  seoTitle: string;
  seoDescription: string;
  ogImageId: string | null;
  /** Empty means every site — the platform's own default. */
  propertyIds: string[];
}

function emptyDraft(): Draft {
  return {
    name: '',
    handle: '',
    description: '',
    parentId: null,
    position: 0,
    featured: false,
    iconMediaId: null,
    heroMediaId: null,
    seoTitle: '',
    seoDescription: '',
    ogImageId: null,
    propertyIds: [],
  };
}

function toDraft(category: CategoryDetail): Draft {
  return {
    name: category.name,
    handle: category.handle,
    description: category.description ?? '',
    parentId: category.parentId,
    position: category.position,
    featured: category.featured,
    iconMediaId: category.iconMediaId,
    heroMediaId: category.heroMediaId,
    seoTitle: category.seoTitle ?? '',
    seoDescription: category.seoDescription ?? '',
    ogImageId: category.ogImageId,
    propertyIds: category.propertyIds,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((value) => seen.has(value));
}

/* ── The surface ────────────────────────────────────────────────────────── */

export function CategoryDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? (
    <CategoryEditor ctx={ctx} id="new" />
  ) : (
    <CategoryLoader ctx={ctx} id={id} />
  );
}

/** Fetches the category first so a failed load REPLACES the form rather than
 *  rendering an empty one beside a dead Save. */
function CategoryLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: category, isPending, isError, error, refetch } = useCategory(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="category"
        title="Could not load this category"
        description="This is a problem reaching the server. The category itself is unaffected — nothing has been lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !category) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <CategoryEditor ctx={ctx} id={id} category={category} />;
}

function CategoryEditor({
  ctx,
  id,
  category,
}: {
  ctx: SurfaceContext;
  id: string;
  category?: CategoryDetail;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateCategory();
  const update = useUpdateCategory(id);
  const reparent = useReparentCategory();
  const remove = useDeleteCategory(id);

  const saved = useMemo(() => (category ? toDraft(category) : emptyDraft()), [category]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  const [handleTouched, setHandleTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New category' : (category?.name ?? 'Category'));
  }, [ctx, isNew, category]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // The web address follows the name until someone edits it themselves.
  const effectiveHandle = isNew && !handleTouched ? slugifyHandle(draft.name) : draft.handle;

  const nameError = draft.name.trim() === '' ? 'Give the category a name.' : null;

  const dirty = isNew
    ? draft.name.trim() !== '' ||
      handleTouched ||
      draft.description.trim() !== '' ||
      draft.parentId !== null ||
      draft.featured ||
      draft.iconMediaId !== null ||
      draft.heroMediaId !== null ||
      draft.seoTitle.trim() !== '' ||
      draft.seoDescription.trim() !== '' ||
      draft.ogImageId !== null ||
      draft.propertyIds.length > 0
    : draft.name !== saved.name ||
      draft.handle !== saved.handle ||
      draft.description !== saved.description ||
      draft.parentId !== saved.parentId ||
      draft.position !== saved.position ||
      draft.featured !== saved.featured ||
      draft.iconMediaId !== saved.iconMediaId ||
      draft.heroMediaId !== saved.heroMediaId ||
      draft.seoTitle !== saved.seoTitle ||
      draft.seoDescription !== saved.seoDescription ||
      draft.ogImageId !== saved.ogImageId ||
      !sameSet(draft.propertyIds, saved.propertyIds);

  const saving = create.isPending || update.isPending || reparent.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This category has not been created yet. Close anyway?'
      : 'This category has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError || reparent.isError
      ? categoryErrorMessage(
          create.error ?? update.error ?? reparent.error,
          'Could not save this category. Nothing was changed.'
        )
      : null;

  /* ── Save ─────────────────────────────────────────────────────────────── */

  const submit = () => {
    if (nameError) return;

    const nullable = (value: string) => (value.trim() === '' ? null : value.trim());

    if (isNew) {
      create.mutate(
        {
          name: draft.name.trim(),
          handle: effectiveHandle || undefined,
          description: nullable(draft.description),
          parentId: draft.parentId,
          position: draft.position,
          featured: draft.featured,
          iconMediaId: draft.iconMediaId,
          heroMediaId: draft.heroMediaId,
          seoTitle: nullable(draft.seoTitle),
          seoDescription: nullable(draft.seoDescription),
          ogImageId: draft.ogImageId,
          propertyIds: draft.propertyIds,
        },
        {
          onSuccess: (created) => {
            ctx.open('commerce.category.detail', { id: created.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({ title: `${draft.name.trim()} added`, type: 'success' });
            });
          },
        }
      );
      return;
    }

    // Editing. A parent MOVE goes through reparent (which rewrites the subtree's
    // paths and sets the new position); everything else through update. Reparent
    // first, so a failure there stops before the rest is written.
    void (async () => {
      try {
        const parentChanged = draft.parentId !== saved.parentId;
        if (parentChanged) {
          await reparent.mutateAsync({
            categoryId: id,
            newParentId: draft.parentId,
            newPosition: draft.position,
          });
        }
        await update.mutateAsync({
          name: draft.name.trim(),
          handle: draft.handle,
          description: nullable(draft.description),
          // Position rides with reparent when the parent moved; otherwise it is
          // an ordinary field on the update.
          ...(parentChanged ? {} : { position: draft.position }),
          featured: draft.featured,
          iconMediaId: draft.iconMediaId,
          heroMediaId: draft.heroMediaId,
          seoTitle: nullable(draft.seoTitle),
          seoDescription: nullable(draft.seoDescription),
          ogImageId: draft.ogImageId,
          propertyIds: draft.propertyIds,
        });
        setTouched(false);
        toast.add({ title: 'Category saved', type: 'success' });
      } catch {
        // The alert in the body reports it; nothing was partially lost that the
        // draft does not still hold.
      }
    })();
  };

  /* ── Delete ───────────────────────────────────────────────────────────── */

  const onDelete = async () => {
    if (!category) return;
    const ok = await confirm({
      title: `Delete ${category.name}?`,
      description:
        category.productCount > 0
          ? `This category comes off your website menu. The ${String(category.productCount)} product${category.productCount === 1 ? '' : 's'} filed here ${category.productCount === 1 ? 'is' : 'are'} kept — ${category.productCount === 1 ? 'it' : 'they'} just stop appearing under this heading. This cannot be undone.`
          : 'This category comes off your website menu. This cannot be undone. Categories with sub-categories underneath them cannot be deleted until those are moved or removed first.',
      confirmLabel: 'Delete this category',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${category.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this category',
          description: categoryErrorMessage(
            error,
            'Nothing was removed. If it has sub-categories, move or delete those first.'
          ),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Category actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(nameError) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create category' : 'Save'}
          </Button>
        }
        controls={
          <>
            {!isNew && category?.featured ? (
              <Badge color="info" variant="soft" size="sm">
                Featured
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
                Add a category
              </Heading>
              <Text>
                A category is a part of your website&apos;s menu — an aisle shoppers browse down.
                Categories can sit inside one another, so &ldquo;Cookware&rdquo; can live under
                &ldquo;Camping&rdquo;.
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this category" message={failure} />

          <FormSection title="Name and place">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    placeholder="Camping"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>What shoppers see in the menu.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Web address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={effectiveHandle}
                    placeholder="camping"
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
                The end of this category&apos;s page address — yoursite.com/c/
                {effectiveHandle || '…'}.{' '}
                {isNew ? '' : 'Changing it breaks any link already shared to this page.'}
              </FieldDescription>
            </Field>

            <ParentPicker
              selfId={isNew ? null : id}
              selfPath={category?.path ?? null}
              value={draft.parentId}
              onChange={(next) => {
                set('parentId', next);
              }}
            />

            <Field>
              <FieldLabel>Order among its neighbours</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-40">
                    <NumberField
                      label="Order among its neighbours"
                      min={0}
                      value={draft.position}
                      onValueChange={(value: number | null) => {
                        set('position', value ?? 0);
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>
                Categories at the same level are shown lowest number first. Leave it at 0 unless you
                want this one to jump ahead of its neighbours.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Feature this category</FieldLabel>
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
                Marks it as one to highlight — themes can show featured categories on the home page
                or in a promoted menu.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Describe it"
            description="Optional. Shown at the top of the category's own page, and useful to search engines."
          >
            <Field>
              <FieldLabel>Description</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={4}
                    value={draft.description}
                    placeholder="Everything you need for a weekend under canvas."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="Pictures"
            description="Optional images your theme can use — a small icon in the menu, and a banner across the top of the category's page."
          >
            <MediaField
              label="Menu icon"
              description="A small square image shown next to the category name in some menus."
              value={draft.iconMediaId}
              onChange={(next) => {
                set('iconMediaId', next);
              }}
            />
            <MediaField
              label="Banner image"
              description="A wide picture shown across the top of this category's page."
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
            description="You run more than one website, so a category can appear on all of them or just some."
          />

          <FormSection
            title="How it looks in search results"
            description="Optional. When someone finds this category on Google, this is the title and summary they see. Left empty, the name and description above are used."
          >
            <Field>
              <FieldLabel>Search title</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.seoTitle}
                    placeholder={draft.name || 'Camping gear'}
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
                    placeholder="One or two sentences on what someone finds in this part of your site."
                    onChange={(event) => {
                      set('seoDescription', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <MediaField
              label="Picture when shared"
              description="Shown when a link to this category is pasted into a message or a post."
              value={draft.ogImageId}
              onChange={(next) => {
                set('ogImageId', next);
              }}
            />
          </FormSection>

          {!isNew && category ? (
            <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Deleting takes this category off your website menu. Products filed here are kept —
                  they just stop appearing under this heading.
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
                  Delete this category
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── The parent picker ──────────────────────────────────────────────────── */

interface FlatCategory {
  id: string;
  name: string;
  trail: string[];
  path: string;
}

/** Depth-first, parents before children, carrying each node's path so the picker
 *  can rule out a category's own subtree (you cannot file a category under one of
 *  its own descendants). */
function flattenWithPath(nodes: CategoryNode[] | undefined): FlatCategory[] {
  const out: FlatCategory[] = [];
  const walk = (list: CategoryNode[], trail: string[]) => {
    for (const node of list) {
      const here = [...trail, node.name];
      out.push({ id: node.id, name: node.name, trail: here, path: node.path });
      walk(node.children, here);
    }
  };
  walk(nodes ?? [], []);
  return out;
}

function ParentPicker({
  selfId,
  selfPath,
  value,
  onChange,
}: {
  selfId: string | null;
  selfPath: string | null;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const tree = useCategoryTree();
  const [search, setSearch] = useState('');

  const all = useMemo(() => flattenWithPath(tree.data), [tree.data]);

  // A category cannot be its own parent, nor sit under one of its descendants —
  // that would make a loop the tree cannot represent.
  const choosable = useMemo(
    () =>
      all.filter((category) => {
        if (selfId && category.id === selfId) return false;
        if (selfPath && (category.path === selfPath || category.path.startsWith(`${selfPath}.`))) {
          return false;
        }
        return true;
      }),
    [all, selfId, selfPath]
  );

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return choosable;
    return choosable.filter((category) =>
      category.trail.join(' › ').toLowerCase().includes(needle)
    );
  }, [choosable, search]);

  const chosen = value ? all.find((category) => category.id === value) : null;

  return (
    <Field>
      <FieldLabel>Sits inside</FieldLabel>
      <FieldControl
        render={
          <div className="flex flex-col gap-2">
            {tree.isError ? (
              <Text>
                Your categories could not be loaded. This one will be left at the top level.
              </Text>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Text as="span" className="text-sm">
                    {chosen ? (
                      <>
                        Inside <span className="font-semibold">{chosen.trail.join(' › ')}</span>
                      </>
                    ) : (
                      'At the top level of your menu'
                    )}
                  </Text>
                  {chosen ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      onClick={() => {
                        onChange(null);
                      }}
                    >
                      Move to top level
                    </Button>
                  ) : null}
                </div>

                {choosable.length > 8 ? (
                  <div className="max-w-sm min-w-0">
                    <SearchInput
                      size="sm"
                      aria-label="Search categories"
                      placeholder="Search categories…"
                      value={search}
                      onValueChange={setSearch}
                    />
                  </div>
                ) : null}

                <div className="border-base-300 max-h-56 overflow-y-auto rounded border p-1">
                  <ParentRow
                    label="Top level (no parent)"
                    selected={value === null}
                    onSelect={() => {
                      onChange(null);
                    }}
                  />
                  {matches.length === 0 ? (
                    <Text className="p-2 text-sm">No category matches “{search.trim()}”.</Text>
                  ) : (
                    matches.map((category) => (
                      <ParentRow
                        key={category.id}
                        selected={value === category.id}
                        onSelect={() => {
                          onChange(category.id);
                        }}
                      >
                        {category.trail.slice(0, -1).map((ancestor) => (
                          <span key={ancestor}>{ancestor} › </span>
                        ))}
                        <span className="font-semibold">{category.name}</span>
                      </ParentRow>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        }
      />
      <FieldDescription>
        Choose a category to nest this one inside it, or leave it at the top level. Moving a
        category brings everything underneath it along.
      </FieldDescription>
    </Field>
  );
}

/** One row in the parent list — a real button, aria-pressed for the current
 *  choice, full ink because the trail is meant to be read. */
function ParentRow({
  label,
  children,
  selected,
  onSelect,
}: {
  label?: string;
  children?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`flex w-full items-center rounded px-2 py-2 text-left ${
        selected ? 'bg-module text-module-content' : 'hover:bg-base-200'
      }`}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">{children ?? label}</span>
    </button>
  );
}
