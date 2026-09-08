'use client';

// One piece of content — write it, then manage it.
//
// Writing and managing are the SAME surface in two states. `{ id: 'new' }` picks
// a kind of content and starts a draft; `{ id }` edits and publishes it. Making
// "new" a separate modal would mean building the schema-driven form twice and
// keeping the two in sync forever — so it is one pane, per the workbench rule.
//
// The body is SCHEMA-DRIVEN. An entry's kind resolves to a content type whose
// fields describe the body, and `<BodyFields>` renders a control per field —
// see schema-form.tsx. This file owns the draft, the lifecycle (publish /
// unpublish / schedule), the version history, and the one Save.
//
// Explicit-save only: one Save button, last write wins. There is no autosave and
// no conflict check — both were removed platform-wide. An unsaved edit registers
// the leave-guard, so closing or navigating away asks first.
//
// NOT built on EditorLayout: there is a real form here but no real second column
// — status and history are a toolbar badge and a section, not a running summary
// rail — so a bento would float a near-empty rail beside the work. One centred,
// capped column instead, with the fields as the hero.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faCalendarClock,
  faPaperPlane,
  faRotate,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { BodyFields } from './schema-form';
import { MediaPickerProvider } from './media-picker';
import { PolicyPageNotice } from './policy-page-notice';
import { SaveFailure } from '@/components/save-failure';
import {
  contentErrorMessage,
  entryStatusState,
  entryTitle,
  formatDateTime,
  pruneEmpty,
  useAuthors,
  useContentEntry,
  useContentTypes,
  useCreateEntry,
  useDeleteEntry,
  usePublishEntry,
  useRestoreRevision,
  useRevisions,
  useUnpublishEntry,
  useUpdateEntry,
  type Author,
  type ContentEntry,
  type ContentType,
} from './data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function ContentDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CreateEntry ctx={ctx} /> : <EditEntry ctx={ctx} id={id} />;
}

/* ── The shared field body ──────────────────────────────────────────────── */

interface EntryFieldsProps {
  type: ContentType;
  authors: Author[];
  slug: string;
  onSlug: (next: string) => void;
  authorId: string;
  onAuthor: (next: string) => void;
  body: Record<string, unknown>;
  onBody: (key: string, next: unknown) => void;
  seo: Record<string, unknown>;
  onSeo: (key: string, next: unknown) => void;
}

/** Everything both the create and the manage views render: the schema body, the
 *  web address, the byline, and the search-engine listing. */
function EntryFields({
  type,
  authors,
  slug,
  onSlug,
  authorId,
  onAuthor,
  body,
  onBody,
  seo,
  onSeo,
}: EntryFieldsProps) {
  const routable = Boolean(type.url_pattern);
  const seoString = (key: string): string => {
    const value = seo[key];
    return typeof value === 'string' ? value : '';
  };

  return (
    // One media picker for the whole form — asset fields AND in-body images in
    // the rich-text editor share it through context.
    <MediaPickerProvider source="content">
      <FormSection title="Content">
        <BodyFields fields={type.schema_json.fields} value={body} onChange={onBody} />
      </FormSection>

      {routable ? (
        <FormSection
          title="Web address"
          description="The end of the address where people will find this on your site."
        >
          <Field>
            <FieldLabel>Address</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  className="font-mono text-sm"
                  value={slug}
                  placeholder="my-new-page"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    onSlug(event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>
              {`This will live at ${(type.url_pattern ?? '/{slug}').replace('{slug}', slug.trim() || '…')}. Leave it and we'll make one from the title.`}
            </FieldDescription>
          </Field>
        </FormSection>
      ) : null}

      <FormSection title="Author" description="Whose name appears on this. Optional.">
        {authors.length === 0 ? (
          <Text className="text-sm">
            You have not added any authors yet. You can add them in the Authors area, then choose
            one here.
          </Text>
        ) : (
          <Field>
            <FieldLabel>Written by</FieldLabel>
            <NativeSelect
              color="module"
              value={authorId}
              aria-label="Author"
              onChange={(event) => {
                onAuthor(event.target.value);
              }}
            >
              <option value="">No author</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.display_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </FormSection>

      {routable ? (
        <FormSection
          title="Search engine listing"
          description="How this looks when it shows up in a search result. Leave these empty to use the title and a summary automatically."
        >
          <Field>
            <FieldLabel>Search title</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={seoString('title')}
                  placeholder="Defaults to the title above"
                  onChange={(event) => {
                    onSeo('title', event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>The blue clickable line in a search result.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Search description</FieldLabel>
            <FieldControl
              render={
                <Textarea
                  color="module"
                  rows={2}
                  value={seoString('description')}
                  placeholder="A sentence or two summarizing this page"
                  onChange={(event) => {
                    onSeo('description', event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>The gray summary shown under the link.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Preferred web address</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  className="font-mono text-sm"
                  value={seoString('canonical')}
                  placeholder="https://example.com/the-original"
                  onChange={(event) => {
                    onSeo('canonical', event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>
              Only needed if the same content also lives at another address — this tells search
              engines which one counts. Usually leave it empty.
            </FieldDescription>
          </Field>
        </FormSection>
      ) : null}
    </MediaPickerProvider>
  );
}

/* ── Create ─────────────────────────────────────────────────────────────── */

function CreateEntry({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const { data: types, isPending: typesPending, isError: typesError, refetch } = useContentTypes();
  const { data: authors } = useAuthors();
  const create = useCreateEntry();

  const [typeKey, setTypeKey] = useState('');
  const [slug, setSlug] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [body, setBody] = useState<Record<string, unknown>>({});
  const [seo, setSeo] = useState<Record<string, unknown>>({});

  useEffect(() => {
    ctx.setTitle('New content');
  }, [ctx]);

  const type = useMemo(
    () => (types ?? []).find((candidate) => candidate.key === typeKey) ?? null,
    [types, typeKey]
  );

  const dirty = typeKey !== '' && !create.isSuccess;
  useDirtySource(dirty, 'You have started something you have not saved. Close anyway?');

  const failure = create.isError
    ? contentErrorMessage(create.error, 'Could not create this. Nothing was saved.')
    : null;

  const submit = () => {
    if (!type) return;
    create.mutate(
      {
        type_key: type.key,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        body: pruneEmpty(body),
        seo: pruneEmpty(seo),
        ...(authorId ? { author_id: authorId } : {}),
      },
      {
        onSuccess: (entry) => {
          // Becomes the manage view for the entry that now exists — the same
          // pane, one state along. Toast follows the swap; see afterPaneChange.
          ctx.open('cms.content.detail', { id: entry.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${entryTitle(entry)} created`, type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New content actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!type}
            loading={create.isPending}
            onClick={submit}
          >
            Create
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            Choose what kind of thing this is, then fill it in. It starts as a private draft — you
            decide when to publish it.
          </Text>

          <SaveFailure title="Could not create this" message={failure} />

          {typesError ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>Could not load the kinds of content</AlertTitle>
                <AlertDescription>This is a problem reaching the server.</AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="error"
                variant="soft"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </Alert>
          ) : (
            <FormSection title="What kind of content?">
              {typesPending ? (
                <Text className="text-sm" role="status">
                  Loading…
                </Text>
              ) : (
                <Field>
                  <FieldLabel>Kind</FieldLabel>
                  <NativeSelect
                    color="module"
                    value={typeKey}
                    aria-label="Kind of content"
                    onChange={(event) => {
                      setTypeKey(event.target.value);
                    }}
                  >
                    <option value="">Choose…</option>
                    {(types ?? []).map((candidate) => (
                      <option key={candidate.key} value={candidate.key}>
                        {candidate.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {type?.description ? (
                    <FieldDescription>{type.description}</FieldDescription>
                  ) : null}
                </Field>
              )}
            </FormSection>
          )}

          {type ? (
            <EntryFields
              type={type}
              authors={authors ?? []}
              slug={slug}
              onSlug={setSlug}
              authorId={authorId}
              onAuthor={setAuthorId}
              body={body}
              onBody={(key, next) => {
                setBody((current) => ({ ...current, [key]: next }));
              }}
              seo={seo}
              onSeo={(key, next) => {
                setSeo((current) => ({ ...current, [key]: next }));
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Edit / manage ──────────────────────────────────────────────────────── */

interface Draft {
  slug: string;
  authorId: string;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
}

function serializeDraft(draft: Draft): string {
  return JSON.stringify({
    slug: draft.slug.trim(),
    authorId: draft.authorId,
    body: pruneEmpty(draft.body),
    seo: pruneEmpty(draft.seo),
  });
}

function EditEntry({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: entry,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useContentEntry(id);
  const { data: types } = useContentTypes();
  const { data: authors } = useAuthors();

  const type = useMemo(
    () => (types ?? []).find((candidate) => candidate.key === entry?.type_key) ?? null,
    [types, entry?.type_key]
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const initialRef = useRef<string>('');
  const initializedFor = useRef<string | null>(null);
  /** The server's version, as last read. */
  const serverRef = useRef<string>('');

  const dirty = draft !== null && serializeDraft(draft) !== initialRef.current;

  // Initialise on open, and re-read whenever the SERVER'S copy has moved while
  // there is nothing of hers to lose.
  //
  // This used to initialise once per entry id and never again, which protected an
  // in-progress edit from a background refetch — the right instinct, but it also
  // meant a pane sitting open could never see a change made anywhere else. Taking
  // the newer legal starter wording from the checklist rewrites the body
  // server-side; the open editor went on showing the old text, the pane's own
  // Refresh did not shift it, and pressing Save there would have written the old
  // wording back over the new one. Same shape as issue #027: a stale box that
  // saves is worse than a stale box that only looks wrong.
  //
  // So the guard is now DIRTY rather than "already initialised". A clean draft has
  // no edit to protect and should show the truth; a dirty one keeps her work.
  useEffect(() => {
    if (!entry) return;
    const next: Draft = {
      slug: entry.slug ?? '',
      authorId: entry.author_id ?? '',
      body: entry.body,
      seo: entry.seo,
    };
    const server = serializeDraft(next);
    const firstOpen = initializedFor.current !== entry.id;
    if (!firstOpen && (server === serverRef.current || dirty)) return;
    initializedFor.current = entry.id;
    serverRef.current = server;
    setDraft(next);
    initialRef.current = server;
  }, [entry, dirty]);
  useDirtySource(dirty, 'You have unsaved changes to this. Close anyway?');

  const displayTitle = draft
    ? entryTitle({ body: draft.body, slug: draft.slug })
    : entry
      ? entryTitle(entry)
      : 'Content';
  useEffect(() => {
    ctx.setTitle(displayTitle);
  }, [ctx, displayTitle]);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="page"
            title="Could not load this"
            description="This is a problem reaching the server. The content itself is unaffected."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !entry || !draft || !type) {
    return <PaneWaiting />;
  }

  return (
    <ManageBody
      ctx={ctx}
      id={id}
      entry={entry}
      type={type}
      authors={authors ?? []}
      draft={draft}
      setDraft={setDraft}
      dirty={dirty}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
      onSaved={(saved) => {
        const next: Draft = {
          slug: saved.slug ?? '',
          authorId: saved.author_id ?? '',
          body: saved.body,
          seo: saved.seo,
        };
        setDraft(next);
        initialRef.current = serializeDraft(next);
      }}
      onRestored={(restored) => {
        const next: Draft = {
          slug: restored.slug ?? '',
          authorId: restored.author_id ?? '',
          body: restored.body,
          seo: restored.seo,
        };
        setDraft(next);
        initialRef.current = serializeDraft(next);
      }}
    />
  );
}

interface ManageBodyProps {
  ctx: SurfaceContext;
  id: string;
  entry: ContentEntry;
  type: ContentType;
  authors: Author[];
  draft: Draft;
  setDraft: (updater: (current: Draft | null) => Draft | null) => void;
  dirty: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
  onSaved: (saved: ContentEntry) => void;
  onRestored: (restored: ContentEntry) => void;
}

function ManageBody({
  ctx,
  id,
  entry,
  type,
  authors,
  draft,
  setDraft,
  dirty,
  isFetching,
  dataUpdatedAt,
  refetch,
  onSaved,
  onRestored,
}: ManageBodyProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateEntry(id);
  const publish = usePublishEntry(id);
  const unpublish = useUnpublishEntry(id);
  const del = useDeleteEntry(id);

  const [scheduleOpen, setScheduleOpen] = useState(false);

  const state = entryStatusState(entry.status);
  const isPublished = entry.status === 'published';
  const isScheduled = entry.status === 'scheduled';

  const save = () => {
    update.mutate(
      {
        ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
        body: pruneEmpty(draft.body),
        seo: pruneEmpty(draft.seo),
        author_id: draft.authorId ? draft.authorId : null,
      },
      {
        onSuccess: (saved) => {
          onSaved(saved);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: contentErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const publishNow = () => {
    publish.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: `${entryTitle(entry)} is live`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not publish',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onUnpublish = async () => {
    const ok = await confirm({
      title: isScheduled ? 'Cancel the schedule?' : `Take “${entryTitle(entry)}” off your site?`,
      description: isScheduled
        ? 'This will not go live at the set time any more. It goes back to a private draft you can publish whenever you like.'
        : 'Visitors will no longer be able to read this. It becomes a private draft again — nothing is deleted, and you can publish it back at any time.',
      confirmLabel: isScheduled ? 'Cancel the schedule' : 'Take it down',
      cancelLabel: 'Leave it as it is',
      color: 'warning',
    });
    if (!ok) return;
    unpublish.mutate(undefined, {
      onSuccess: () => {
        toast.add({
          title: isScheduled ? 'Schedule cancelled' : `${entryTitle(entry)} taken down`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not change this',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${entryTitle(entry)}”?`,
      description:
        'This removes it for good. If it is on your site, it comes down. This cannot be undone — if you only want to take it off your site, take it down instead.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${entryTitle(entry)} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const lifecycleBusy = publish.isPending || unpublish.isPending;

  return (
    <div className={PANE_SHELL}>
      {/* `wrap` because the lifecycle actions that appear depend on the entry's
          state — there is no fixed set to reduce to one line. */}
      <PaneToolbar
        label="Content actions"
        status={
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        }
        primary={
          // Save is `primary`, never `controls`. `controls` relocates into the
          // overflow popover under 672px, and the one control a person opened
          // this pane to press must not be behind a tap they cannot predict.
          // Enforced by scripts/check-toolbar-primary.mjs.
          <Button
            size="sm"
            color="module"
            disabled={!dirty}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        controls={
          // Lifecycle, not commit — these are genuinely secondary and may move.
          <div className="flex flex-wrap items-center gap-2">
            {!isPublished ? (
              <Button size="sm" color="module" loading={publish.isPending} onClick={publishNow}>
                <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
                {isScheduled ? 'Publish now' : 'Publish'}
              </Button>
            ) : null}
            {!isPublished && !isScheduled ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                disabled={lifecycleBusy}
                onClick={() => {
                  setScheduleOpen(true);
                }}
              >
                <Icon glyph={faCalendarClock} className="size-4" aria-hidden />
                Schedule…
              </Button>
            ) : null}
            {isPublished || isScheduled ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={unpublish.isPending}
                onClick={() => {
                  void onUnpublish();
                }}
              >
                {isScheduled ? 'Cancel schedule' : 'Unpublish'}
              </Button>
            ) : null}
          </div>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* One status line, the most specific true thing: when it is live or
              scheduled, say WHEN. */}
          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>
                {isScheduled && entry.scheduled_at
                  ? `Goes live ${formatDateTime(entry.scheduled_at)}.`
                  : isPublished && entry.published_at
                    ? `Live since ${formatDateTime(entry.published_at)}.`
                    : state.detail}
              </AlertDescription>
            </AlertContent>
          </Alert>

          {entry.legal_kind ? (
            <PolicyPageNotice
              legalKind={entry.legal_kind}
              reviewed={entry.legal_reviewed}
              published={isPublished}
            />
          ) : null}

          <EntryFields
            type={type}
            authors={authors}
            slug={draft.slug}
            onSlug={(next) => {
              setDraft((current) => (current ? { ...current, slug: next } : current));
            }}
            authorId={draft.authorId}
            onAuthor={(next) => {
              setDraft((current) => (current ? { ...current, authorId: next } : current));
            }}
            body={draft.body}
            onBody={(key, next) => {
              setDraft((current) =>
                current ? { ...current, body: { ...current.body, [key]: next } } : current
              );
            }}
            seo={draft.seo}
            onSeo={(key, next) => {
              setDraft((current) =>
                current ? { ...current, seo: { ...current.seo, [key]: next } } : current
              );
            }}
          />

          <RevisionHistory id={id} onRestored={onRestored} />

          {/* Destructive action as a plain row under a divider, not a card with
              equal weight to the work above it. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this</Text>
              <Text className="text-sm">
                Removes it for good. To only take it off your site, use Unpublish above.
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

      <ScheduleDialog
        open={scheduleOpen}
        busy={publish.isPending}
        onOpenChange={setScheduleOpen}
        onConfirm={(iso) => {
          publish.mutate(iso, {
            onSuccess: () => {
              setScheduleOpen(false);
              toast.add({
                title: `${entryTitle(entry)} scheduled`,
                description: `It will go live ${formatDateTime(iso)}.`,
                type: 'success',
              });
            },
            onError: (error) => {
              toast.add({
                title: 'Could not schedule this',
                description: contentErrorMessage(error, 'Nothing was changed.'),
                type: 'error',
              });
            },
          });
        }}
      />
    </div>
  );
}

/* ── Version history ────────────────────────────────────────────────────── */

function RevisionHistory({
  id,
  onRestored,
}: {
  id: string;
  onRestored: (restored: ContentEntry) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: revisions, isPending, isError } = useRevisions(id);
  const restore = useRestoreRevision(id);

  const run = async (revisionNumber: number) => {
    const ok = await confirm({
      title: `Bring back version ${String(revisionNumber)}?`,
      description:
        'This puts the content back to how it was in that version, saved as a new version so nothing is lost. Any unsaved changes you have now will be replaced.',
      confirmLabel: 'Bring it back',
      cancelLabel: 'Cancel',
      color: 'warning',
    });
    if (!ok) return;
    restore.mutate(revisionNumber, {
      onSuccess: (restored) => {
        onRestored(restored);
        toast.add({ title: `Restored version ${String(revisionNumber)}`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not bring that version back',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <FormSection
      title="History"
      description="Every save is kept. Bring an older version back if you need to."
    >
      {isError ? (
        <Text className="text-sm">Could not load the history just now.</Text>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : (revisions ?? []).length === 0 ? (
        <Text className="text-sm">No earlier versions yet — this is the first.</Text>
      ) : (
        <ul className="flex flex-col">
          {(revisions ?? []).map((revision, index) => (
            <li
              key={revision.revision_number}
              className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col">
                <Text className="font-medium">
                  Version {revision.revision_number}
                  {index === 0 ? ' · latest' : ''}
                </Text>
                <Text className="text-sm">
                  {formatDateTime(revision.created_at)}
                  {revision.summary ? ` · ${revision.summary}` : ''}
                </Text>
              </div>
              {index === 0 ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  loading={restore.isPending}
                  onClick={() => {
                    void run(revision.revision_number);
                  }}
                >
                  <Icon glyph={faRotate} className="size-4" aria-hidden />
                  Bring back
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

/* ── Schedule dialog ────────────────────────────────────────────────────── */

// A modal that commits to the server, which is normally the one shape to avoid.
// It earns it the way "Record payment" does: one value (a time) against a known
// action (publish), over in seconds, with nothing durable to return to and
// nothing lost if abandoned. Anything longer than this belongs in the pane.
function ScheduleDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (iso: string) => void;
}) {
  const [local, setLocal] = useState('');

  useEffect(() => {
    if (open) setLocal('');
  }, [open]);

  const iso = useMemo(() => {
    if (local.trim() === '') return null;
    const date = new Date(local);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getTime() <= Date.now()) return null;
    return date.toISOString();
  }, [local]);

  return (
    <PaneScope>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-w-md flex-col gap-4">
          <DialogTitle>Schedule this to go live</DialogTitle>
          <Text className="text-sm">
            Pick a date and time. Until then it stays a private draft, then it publishes itself
            automatically.
          </Text>
          <Field>
            <FieldLabel>Go live at</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  type="datetime-local"
                  value={local}
                  onChange={(event) => {
                    setLocal(event.target.value);
                  }}
                />
              }
            />
            {local.trim() !== '' && iso === null ? (
              <FieldDescription>Choose a time in the future.</FieldDescription>
            ) : null}
          </Field>
          <DialogFooter>
            <Button
              variant="ghost"
              color="neutral"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              color="module"
              disabled={iso === null}
              loading={busy}
              onClick={() => {
                if (iso) onConfirm(iso);
              }}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}
