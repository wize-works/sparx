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

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
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
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
// Read-only imports: the shared media browser, exactly as the content editor
// wraps its form and renders its asset fields.
import { MediaPickerProvider, AssetField } from './media-picker';
import { SaveFailure } from '@/components/save-failure';
import {
  authorErrorMessage,
  authorName,
  useAuthor,
  useCreateAuthor,
  useDeleteAuthor,
  useUpdateAuthor,
  type Author,
} from './authors-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

export function AuthorDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CreateAuthor ctx={ctx} /> : <EditAuthor ctx={ctx} id={id} />;
}

/* ── The shared field body ──────────────────────────────────────────────── */

interface Draft {
  name: string;
  slug: string;
  bio: string;
  /** The chosen photo's media asset id, or '' for none. */
  avatarAssetId: string;
}

interface AuthorFieldsProps {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}

/** Everything both the add and the manage views render, wrapped in the one media
 *  picker the photo field opens. */
function AuthorFields({ draft, onChange }: AuthorFieldsProps) {
  return (
    <MediaPickerProvider source="content">
      <FormSection title="Name and web address">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.name}
                placeholder="Jane Doe"
                autoComplete="off"
                onChange={(event) => {
                  onChange({ name: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>The name shown on everything they write.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Web address</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                className="font-mono text-sm"
                value={draft.slug}
                placeholder="jane-doe"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  onChange({ slug: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>
            Used in the address of their page on your site. Leave it blank and we will make one from
            the name.
          </FieldDescription>
        </Field>
      </FormSection>

      <FormSection
        title="Photo"
        description="A picture shown next to their name on what they write. Optional."
      >
        <AssetField
          value={draft.avatarAssetId}
          onChange={(next) => {
            onChange({ avatarAssetId: typeof next === 'string' ? next : '' });
          }}
        />
      </FormSection>

      <FormSection
        title="Biography"
        description="A short paragraph about them, shown on their author page. Optional."
      >
        <Field>
          <FieldLabel>About them</FieldLabel>
          <FieldControl
            render={
              <Textarea
                color="module"
                rows={4}
                value={draft.bio}
                placeholder="A sentence or two on who they are and what they write about."
                onChange={(event) => {
                  onChange({ bio: event.target.value });
                }}
              />
            }
          />
        </Field>
      </FormSection>
    </MediaPickerProvider>
  );
}

function emptyDraft(): Draft {
  return { name: '', slug: '', bio: '', avatarAssetId: '' };
}

function draftFrom(author: Author): Draft {
  return {
    name: author.display_name,
    slug: author.slug,
    bio: author.bio ?? '',
    avatarAssetId: author.avatar_asset_id ?? '',
  };
}

function serializeDraft(draft: Draft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    bio: draft.bio.trim(),
    avatarAssetId: draft.avatarAssetId,
  });
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
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Add an author
            </Heading>
            <Text>
              An author is a name that appears on what you publish. Once added, you can pick them on
              any post.
            </Text>
          </div>

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
      <PaneLoadError
        error={error}
        noun="author"
        title="Could not load this author"
        description="This is a problem reaching the server. The author itself is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !author || !draft) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
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

interface ManageBodyProps {
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

function ManageBody({
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
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
