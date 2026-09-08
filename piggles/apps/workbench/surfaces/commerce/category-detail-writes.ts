'use client';

// Saving and deleting a category — everything the editor writes, away from
// everything it draws.
//
// Moving a category to a different parent is its OWN endpoint, not a field on
// the patch: it re-computes the paths of every descendant, which a general
// update cannot be trusted to do.

import { useToast } from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { slugify } from '../../lib/slugify';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import type { Draft } from './category-draft';
import {
  categoryErrorMessage,
  useCreateCategory,
  useDeleteCategory,
  useReparentCategory,
  useUpdateCategory,
  type CategoryDetail,
} from './categories-data';

export function useCategoryWrites({
  ctx,
  id,
  isNew,
  draft,
  saved,
  handle,
  category,
  nameError,
  onSaved,
}: {
  ctx: SurfaceContext;
  id: string;
  isNew: boolean;
  draft: Draft;
  saved: Draft;
  /** The address the field is showing, which is what gets claimed. */
  handle: string;
  category: CategoryDetail | null;
  nameError: string | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateCategory();
  const update = useUpdateCategory(id);
  const reparent = useReparentCategory();
  const remove = useDeleteCategory(id);

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
          handle: slugify(handle, 120) || undefined,
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
          handle: slugify(handle, 120),
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
        onSaved();
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
    // What a delete DETACHES is everything filed here, not just what a shopper
    // can currently see — an archived product is still filed, and un-archiving it
    // later would find its heading gone. So this sentence counts both halves,
    // while the list column counts only the visible one (issue 382).
    const filed = category.productCount + category.hiddenProductCount;
    const ok = await confirm({
      title: `Delete ${category.name}?`,
      description:
        filed > 0
          ? `This category comes off your website menu. The ${String(filed)} product${filed === 1 ? '' : 's'} filed here ${filed === 1 ? 'is' : 'are'} kept — ${filed === 1 ? 'it' : 'they'} just stop appearing under this heading. This cannot be undone.`
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

  return {
    submit,
    onDelete,
    failure,
    saving: create.isPending || update.isPending || reparent.isPending,
    created: create.isSuccess,
    deleting: remove.isPending,
  };
}
