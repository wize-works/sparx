'use client';

// One file in your library — look at it, describe it, or remove it.
//
// A media asset is NOT a create-in-two-states surface: you make one by uploading
// a file (a native picker in the list), not by filling a blank form, so this
// pane only ever manages an existing file. That makes it a read-only-identity
// detail — the filename and the file itself are shown, not renamed — with an
// editable metadata section beside them. The bytes cannot be re-transcoded, so
// there is nothing to "edit" about the picture; what you own is its DESCRIPTION.
//
// The one thing worth writing here is ALT TEXT: the sentence read aloud to
// someone who cannot see the picture, and shown if it fails to load. So that is
// the field the pane leads its editable section with, in plain language.
//
// Explicit-save only: one Save button, last write wins, and an unsaved edit
// registers the leave-guard so closing or navigating away asks first. NOT built
// on EditorLayout — there is no second summary column to justify a bento, so one
// centred, capped column with the preview and the facts as the hero.

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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
  Heading,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { File, FileText, Film, ImageOff, Music, Trash2 } from 'lucide-react';
import { afterPaneChange } from '../../lib/defer';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  assetStatusState,
  dimensionsLabel,
  durationLabel,
  sizeLabel,
  formatDateTime,
  mediaErrorMessage,
  useDeleteAsset,
  useMediaAsset,
  useUpdateAsset,
  type MediaAsset,
  type MediaKind,
} from './media-admin';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const KIND_NOUN: Record<MediaKind, string> = {
  image: 'Picture',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  other: 'File',
};

export function MediaDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const {
    data: asset,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useMediaAsset(id);

  useEffect(() => {
    if (asset) ctx.setTitle(asset.filename);
  }, [ctx, asset]);

  if (isError) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          error={error}
          noun="file"
          title="Could not load this file"
          description="This is a problem reaching the server. The file itself is unaffected."
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  if (isPending || !asset) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <ManageAsset
      ctx={ctx}
      asset={asset}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
    />
  );
}

/* ── The preview ────────────────────────────────────────────────────────── */

function kindIcon(kind: MediaKind, className: string) {
  switch (kind) {
    case 'video':
      return <Film className={className} aria-hidden />;
    case 'audio':
      return <Music className={className} aria-hidden />;
    case 'document':
      return <FileText className={className} aria-hidden />;
    case 'image':
      return <ImageOff className={className} aria-hidden />;
    default:
      return <File className={className} aria-hidden />;
  }
}

function Preview({ asset }: { asset: MediaAsset }) {
  const url = asset.previewUrl;

  if (asset.kind === 'image' && url) {
    return (
      <div className="bg-base-200 rounded-box border-base-300 relative h-72 w-full overflow-hidden border @xl:h-96">
        <Image
          src={url}
          alt={asset.altText ?? ''}
          fill
          sizes="768px"
          className="object-contain"
          // Unoptimized: cross-origin tenant media, where the image optimizer's
          // host allow-list is environment-fragile and 400s on a legitimately
          // served original. Matches the picker and the library grid.
          unoptimized
        />
      </div>
    );
  }

  if (asset.kind === 'video' && url) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- a tenant's own uploaded video has no caption track; controls let them play it to check it is the right file.
      <video
        controls
        src={url}
        className="bg-base-200 rounded-box border-base-300 h-72 w-full border @xl:h-96"
      />
    );
  }

  if (asset.kind === 'audio' && url) {
    return (
      <div className="bg-base-200 rounded-box border-base-300 flex flex-col items-center gap-3 border p-6">
        <Music className="size-8" aria-hidden />
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a tenant's own uploaded audio file has no caption track; controls let them play it to confirm it is the right file. */}
        <audio controls src={url} className="w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="bg-base-200 rounded-box border-base-300 flex flex-col items-center gap-2 border p-8">
      {kindIcon(asset.kind, 'size-10')}
      <Text className="text-sm">No preview for this kind of file.</Text>
    </div>
  );
}

/* ── Facts ──────────────────────────────────────────────────────────────── */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-base-300 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 last:border-b-0">
      <Text className="text-sm font-medium">{label}</Text>
      <Text className="text-sm">{children}</Text>
    </div>
  );
}

/* ── Manage ─────────────────────────────────────────────────────────────── */

interface Draft {
  altText: string;
  caption: string;
}

function serialize(draft: Draft): string {
  return JSON.stringify({ altText: draft.altText.trim(), caption: draft.caption.trim() });
}

function ManageAsset({
  ctx,
  asset,
  isFetching,
  dataUpdatedAt,
  refetch,
}: {
  ctx: SurfaceContext;
  asset: MediaAsset;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateAsset(asset.id);
  const del = useDeleteAsset(asset.id);

  const [draft, setDraft] = useState<Draft>({
    altText: asset.altText ?? '',
    caption: asset.caption ?? '',
  });
  const initialRef = useRef<string>(
    serialize({ altText: asset.altText ?? '', caption: asset.caption ?? '' })
  );
  // Initialise ONCE per asset id. Re-seeding on every background refetch would
  // wipe an in-progress edit; Save resets the snapshot itself (below).
  const initializedFor = useRef<string>(asset.id);
  useEffect(() => {
    if (initializedFor.current === asset.id) return;
    initializedFor.current = asset.id;
    const next: Draft = { altText: asset.altText ?? '', caption: asset.caption ?? '' };
    setDraft(next);
    initialRef.current = serialize(next);
  }, [asset]);

  const dirty = serialize(draft) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes to this file’s details. Close anyway?');

  const state = assetStatusState(asset.status);
  const inUse = asset.usageCount > 0;
  const isImage = asset.kind === 'image';

  const save = () => {
    update.mutate(
      {
        alt_text: draft.altText.trim() ? draft.altText.trim() : null,
        caption: draft.caption.trim() ? draft.caption.trim() : null,
      },
      {
        onSuccess: (saved) => {
          const next: Draft = { altText: saved.altText ?? '', caption: saved.caption ?? '' };
          setDraft(next);
          initialRef.current = serialize(next);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: mediaErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${asset.filename}”?`,
      description:
        'This removes the file from your library for good. Anywhere you have already used it will lose it. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${asset.filename} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this file',
          description: mediaErrorMessage(
            error,
            'Nothing was changed. It may still be in use somewhere.'
          ),
          type: 'error',
        });
      },
    });
  };

  const dimensions = dimensionsLabel(asset);
  const duration = durationLabel(asset.durationSec);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="File actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!dirty}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
          </>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold break-words">
              {asset.filename}
            </Heading>
            <Text>
              {KIND_NOUN[asset.kind]} · {sizeLabel(asset)}
              {dimensions ? ` · ${dimensions}` : ''}
            </Text>
          </div>

          {asset.status === 'failed' ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>This file could not be prepared</AlertTitle>
                <AlertDescription>
                  {asset.processingError ??
                    'Something went wrong while processing it. Try uploading it again.'}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : asset.status === 'uploading' ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Still being prepared</AlertTitle>
                <AlertDescription>{state.detail}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <Preview asset={asset} />

          <FormSection title="Details">
            {isImage ? (
              <Field>
                <FieldLabel>Alt text</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={2}
                      value={draft.altText}
                      placeholder="A red enamel mug on a wooden table"
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, altText: event.target.value }));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  A short description of what is in the picture. It is read aloud to people who use
                  a screen reader, shown if the picture cannot load, and helps search engines
                  understand it. Describe what matters, not “image of”.
                </FieldDescription>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>Caption</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={draft.caption}
                    placeholder="An optional note shown alongside this, where your theme supports it"
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, caption: event.target.value }));
                    }}
                  />
                }
              />
              <FieldDescription>
                An optional line shown next to the file on your site, where your theme uses one.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="About this file">
            <div className="flex flex-col">
              <Fact label="Kind">{KIND_NOUN[asset.kind]}</Fact>
              <Fact label="File type">
                <span className="font-mono">{asset.mimeType}</span>
              </Fact>
              <Fact label="Size">{sizeLabel(asset)}</Fact>
              {dimensions ? <Fact label="Dimensions">{dimensions}</Fact> : null}
              {duration ? <Fact label="Length">{duration}</Fact> : null}
              <Fact label="Uploaded">{formatDateTime(asset.createdAt)}</Fact>
              <Fact label="Used in">
                {inUse
                  ? `${String(asset.usageCount)} ${asset.usageCount === 1 ? 'place' : 'places'} on your site`
                  : 'Not used anywhere yet'}
              </Fact>
              {asset.previewUrl ? (
                <Fact label="Original">
                  <a
                    className="link"
                    href={asset.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the file
                  </a>
                </Fact>
              ) : null}
            </div>
          </FormSection>

          {/* Destructive action as a plain row under a divider, not a card with
              equal weight to the work above it. Disabled while the file is in use
              — the API refuses that delete, so we explain it here instead of
              letting a confirm dead-end in an error. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this file</Text>
              <Text className="text-sm">
                {inUse
                  ? `It is used in ${String(asset.usageCount)} ${asset.usageCount === 1 ? 'place' : 'places'}. Remove it from there first, then you can delete it.`
                  : 'Removes it from your library for good. This cannot be undone.'}
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              disabled={inUse}
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
