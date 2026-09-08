'use client';

// One author — add them, then manage them.
//
// Adding and managing are the SAME surface in two states. `{ id: 'new' }` starts
// a blank author; `{ id }` edits an existing one. The two forms are identical,
// so making "new" a separate modal would mean building the same form twice and
// keeping them in sync forever — so it is one pane in two states, per the
// workbench rule.
//
// Explicit-save only: one Save button, last write wins. An unsaved edit registers
// the leave-guard, so closing or navigating away asks first.
//
// NOT built on EditorLayout: this is a short form — a name, a web address, a
// photo, a biography — with no second column to summarise. A bento would float a
// near-empty rail beside the work. One centred, capped column instead.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import { Button, Card, Text, useToast } from '@wizeworks/silicaui-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
// The form itself. This file owns loading, saving and deleting; that one owns
// what the owner types.
import { AuthorFields, draftFrom, emptyDraft, serializeDraft, type Draft } from './author-fields';
// The manage state, which is its own file: this one loads and routes, that one
// saves and deletes.
import { ManageBody } from './author-manage';
import { authorErrorMessage, authorName, useAuthor, useCreateAuthor } from './authors-data';
import { SaveFailure } from '@/components/save-failure';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

export function AuthorDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CreateAuthor ctx={ctx} /> : <EditAuthor ctx={ctx} id={id} />;
}

/* ── Add ────────────────────────────────────────────────────────────────── */

function CreateAuthor({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateAuthor();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    ctx.setTitle('New author');
  }, [ctx]);

  const patch = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  const nameFilled = draft.name.trim() !== '';
  const dirty = !create.isSuccess && serializeDraft(draft) !== serializeDraft(emptyDraft());
  useDirtySource(dirty, 'You have started an author you have not saved. Close anyway?');

  const failure = create.isError
    ? authorErrorMessage(create.error, 'Could not add this author. Nothing was saved.')
    : null;

  const submit = () => {
    if (!nameFilled) return;
    create.mutate(
      {
        display_name: draft.name.trim(),
        ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
        ...(draft.bio.trim() ? { bio: draft.bio.trim() } : {}),
        ...(draft.avatarAssetId ? { avatar_asset_id: draft.avatarAssetId } : {}),
        // Omitted lands it on the site being worked in — the server reads that
        // from the site switcher. Only an explicit null shares it.
        ...(draft.sharedAcrossSites ? { property_id: null } : {}),
      },
      {
        onSuccess: (author) => {
          // Becomes the manage view for the author that now exists — the same
          // pane, one state along. Toast follows the swap; see afterPaneChange.
          ctx.open('cms.authors.detail', { id: author.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${authorName(author)} added`, type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New author actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!nameFilled}
            loading={create.isPending}
            onClick={submit}
          >
            Add author
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            An author is a name that appears on what you publish. Once added, you can pick them on
            any post.
          </Text>

          <SaveFailure title="Could not add this author" message={failure} />

          <AuthorFields draft={draft} onChange={patch} />
        </div>
      </div>
    </div>
  );
}

/* ── Edit / manage ──────────────────────────────────────────────────────── */

function EditAuthor({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: author,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useAuthor(id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const initialRef = useRef<string>('');
  // Initialise ONCE per author id. Re-initialising on every refetch would wipe
  // an in-progress edit when a background refresh lands; Save resets the
  // snapshot itself (below), which is the only path that should.
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!author) return;
    if (initializedFor.current === author.id) return;
    initializedFor.current = author.id;
    const next = draftFrom(author);
    setDraft(next);
    initialRef.current = serializeDraft(next);
  }, [author]);

  const dirty = draft !== null && serializeDraft(draft) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes to this author. Close anyway?');

  const displayName = draft ? draft.name.trim() : (author?.display_name ?? '');
  useEffect(() => {
    ctx.setTitle(displayName === '' ? 'Author' : displayName);
  }, [ctx, displayName]);

  if (isError) {
    // A failed load replaces the form — never an empty form beside a dead Save.
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="author"
            title="Could not load this author"
            description="This is a problem reaching the server. The author itself is unaffected."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !author || !draft) {
    return <PaneWaiting />;
  }

  return (
    <ManageBody
      ctx={ctx}
      id={id}
      author={author}
      draft={draft}
      setDraft={setDraft}
      dirty={dirty}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
      onSaved={(saved) => {
        const next = draftFrom(saved);
        setDraft(next);
        initialRef.current = serializeDraft(next);
      }}
    />
  );
}
