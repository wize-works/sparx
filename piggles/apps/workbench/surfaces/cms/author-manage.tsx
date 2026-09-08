'use client';

// Managing an author that already exists — save, and delete.
//
// Split out of author-detail.tsx under the size rule. That file decides WHICH
// state the pane is in and loads the record; this one is the state where the
// author exists, so it owns the Save button, the scope move, and the danger row.

import { Button, Text, useToast } from '@wizeworks/silicaui-react';
import { faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { AuthorFields, type Draft } from './author-fields';
// Read-only import: which site is being worked in, so "This site only" lands
// somewhere real.
import { useActivePropertyId } from '../../lib/api/shell-data';
import {
  authorErrorMessage,
  authorName,
  useDeleteAuthor,
  useUpdateAuthor,
  type Author,
} from './authors-data';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

export interface ManageBodyProps {
  ctx: SurfaceContext;
  id: string;
  author: Author;
  draft: Draft;
  setDraft: (updater: (current: Draft | null) => Draft | null) => void;
  dirty: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
  onSaved: (saved: Author) => void;
}

export function ManageBody({
  ctx,
  id,
  author,
  draft,
  setDraft,
  dirty,
  isFetching,
  dataUpdatedAt,
  refetch,
  onSaved,
}: ManageBodyProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateAuthor(id);
  const del = useDeleteAuthor(id);

  const patch = (next: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
  };

  const nameFilled = draft.name.trim() !== '';

  // Where "This site only" puts it. Null would mean every site, so a missing
  // active site is a reason to leave the byline alone rather than to broaden it.
  const activeSiteId = useActivePropertyId();
  const wasShared = author.property_id === null;
  const scopeChanged = draft.sharedAcrossSites !== wasShared;

  const save = () => {
    if (!nameFilled) return;
    update.mutate(
      {
        display_name: draft.name.trim(),
        // Only send a slug when there is one — an empty box means "leave the web
        // address as it is", not "clear it" (a slug is required and can't be
        // blank).
        ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
        bio: draft.bio.trim() ? draft.bio.trim() : null,
        avatar_asset_id: draft.avatarAssetId ? draft.avatarAssetId : null,
        // Sent ONLY when it actually changed. Omitted means "leave it where it
        // is", which is the right answer for every save that was about the name,
        // the photo or the biography.
        ...(scopeChanged && (draft.sharedAcrossSites || activeSiteId)
          ? { property_id: draft.sharedAcrossSites ? null : (activeSiteId ?? null) }
          : {}),
      },
      {
        onSuccess: (saved) => {
          onSaved(saved);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: authorErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${authorName(author)}?`,
      description:
        'This removes this author for good and cannot be undone. Anything they have written stays on your site, but their name comes off it.',
      confirmLabel: 'Delete author',
      cancelLabel: 'Keep author',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${authorName(author)} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this author',
          description: authorErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Author actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            disabled={!dirty || !nameFilled}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <AuthorFields draft={draft} onChange={patch} />

          {/* Destructive action as a plain row under a divider, not a card with
              equal weight to the work above it. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this author</Text>
              <Text className="text-sm">
                Removes them for good. Their name comes off anything they have written; the writing
                itself stays.
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              loading={del.isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
