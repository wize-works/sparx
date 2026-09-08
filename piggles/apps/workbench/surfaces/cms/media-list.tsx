'use client';

// Your whole media library — every picture, video, sound and document you have
// uploaded, ready to drop into anything you write.
//
// A GRID, not a table: media is looked at, not read down a column. You recognise
// a photo by its thumbnail long before its filename, so the tile leads with the
// picture and the name sits under it. Filtering (search, kind, status) and paging
// are server-side, because a library runs to hundreds of files and answering
// "which videos do I have" from whatever happened to load would be a half-truth.
//
// Uploading is a NATIVE file picker fired from the toolbar, not a pane or a
// modal: it opens the operating system's own dialog, the bytes go straight up,
// and the new file appears at the top of the grid. There is no form to fill and
// nothing to return to, so there is nothing for a pane or modal to hold.

import { useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import Image from 'next/image';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  SearchInput,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  faFile,
  faFileText,
  faFilm,
  faImage,
  faImageSlash,
  faMusic,
  faUpload,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneLoadError } from '../../components/pane-load-error';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useUploadMedia } from './media';
import {
  assetStatusState,
  sizeLabel,
  useMediaAssetsList,
  useRefreshMediaLibrary,
  type MediaAsset,
  type MediaKind,
  type MediaListQuery,
} from './media-admin';
import { RowOpenHint } from '../../components/row-open-hint';

/** Registry module for this surface, so the brand's empty-state artwork is this
 *  app's own picture rather than the generic one. */
const MODULE = 'cms';

/** The chips ARE the questions people open the library to answer: "where are my
 *  videos", "what's still processing". */
const KIND_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Pictures' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documents' },
] as const satisfies readonly { value: MediaKind | 'all'; label: string }[];

type StatusFilter = MediaListQuery['status'];

const STATUS_FILTERS = [
  { value: 'all', label: 'Any state' },
  { value: 'ready', label: 'Ready' },
  { value: 'uploading', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
] as const satisfies readonly { value: StatusFilter; label: string }[];

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The icon a non-image tile (or a still-processing one) shows in place of a
 *  thumbnail. */
function kindIcon(kind: MediaKind, className: string) {
  switch (kind) {
    case 'video':
      return <Icon glyph={faFilm} className={className} aria-hidden />;
    case 'audio':
      return <Icon glyph={faMusic} className={className} aria-hidden />;
    case 'document':
      return <Icon glyph={faFileText} className={className} aria-hidden />;
    case 'image':
      return <Icon glyph={faImageSlash} className={className} aria-hidden />;
    default:
      return <Icon glyph={faFile} className={className} aria-hidden />;
  }
}

function emptyAdvice(search: string, kindLabel: string | null, statusLabel: string | null): string {
  const parts: string[] = [];
  if (search) parts.push('Try part of the filename, or the alt text you gave it.');
  if (kindLabel) parts.push(`You are only seeing ${kindLabel} — switch to All to widen it.`);
  if (statusLabel)
    parts.push(`Only “${statusLabel}” is showing — choose Any state to see the rest.`);
  return parts.join(' ');
}

export function MediaListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<MediaKind | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useMediaAssetsList({
    q: search.trim(),
    kind,
    status,
    take,
    skip,
  });

  const upload = useUploadMedia();
  const refreshLibrary = useRefreshMediaLibrary();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || kind !== 'all' || status !== 'all';
  const staleAfterFailure = Boolean(error) && rows.length > 0;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (asset: MediaAsset, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.media.detail', { id: asset.id }, { target: targetFor(event) });
  };

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let done = 0;
    let failed = 0;
    const list = [...files];
    for (const file of list) {
      upload.mutate(file, {
        onSuccess: () => {
          done += 1;
          refreshLibrary();
          if (done + failed === list.length) {
            toast.add({
              title:
                list.length === 1
                  ? `${file.name} uploaded`
                  : `${String(done)} of ${String(list.length)} files uploaded`,
              type: failed === 0 ? 'success' : 'warning',
            });
          }
        },
        onError: () => {
          failed += 1;
          if (done + failed === list.length) {
            toast.add({
              title: 'Some files could not be uploaded',
              description:
                'Nothing already in your library was changed. Check the file type and size, then try again.',
              type: 'error',
            });
          }
        },
      });
    }
  };

  const activeKindLabel = KIND_FILTERS.find((entry) => entry.value === kind)?.label ?? null;
  const activeStatusLabel = STATUS_FILTERS.find((entry) => entry.value === status)?.label ?? null;

  return (
    <div className={PANE_SHELL}>
      {/* `wrap` after reducing what can reduce: below @xl the status filter is
          hidden (kind + search answer most questions) and the upload label sheds
          to its icon. At a normal width this is one line. */}
      {/* The file input lives OUTSIDE the toolbar, deliberately.
          It is a hidden `ref` target that Upload clicks, and `controls` relocates
          into a popover that UNMOUNTS when closed — which would take the ref with
          it and leave Upload doing nothing. Nothing about it needs to be in the
          bar; only the button does. */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <PaneToolbar
        label="Media library controls"
        search={
          <SearchInput
            size="sm"
            aria-label="Search your files"
            placeholder="Filename or alt text…"
            value={search}
            onValueChange={(next) => {
              setSearch(next);
              resetWindow();
            }}
          />
        }
        filters={[
          {
            label: 'Kind',
            key: 'kind',
            value: kind,
            onValueChange: (next) => {
              setKind(next as MediaKind | 'all');
              resetWindow();
            },
            options: KIND_FILTERS,
          },
          {
            label: 'State',
            key: 'status',
            value: status,
            onValueChange: (next) => {
              setStatus(next as StatusFilter);
              resetWindow();
            },
            options: STATUS_FILTERS,
          },
        ]}
        primaryAction={{
          label: 'Upload',
          icon: faUpload,
          title: 'Upload a file from your computer',
          loading: upload.isPending,
          onClick: () => {
            fileRef.current?.click();
          },
        }}
        views={{
          target: '/cms/media',
          params: { q: search },
          onApply: (next) => {
            setSearch(next.q ?? '');
            resetWindow();
          },
        }}
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto p-3">
        {staleAfterFailure ? (
          <Alert color="warning" className="mb-3">
            <AlertContent>
              <AlertTitle>Could not check for changes just now</AlertTitle>
              <AlertDescription>
                This is a problem reaching the server. What you see below is what loaded last, and
                may be out of date.
              </AlertDescription>
            </AlertContent>
            <Button
              size="sm"
              color="warning"
              variant="soft"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </Alert>
        ) : null}

        {error && !staleAfterFailure ? (
          // A failed load REPLACES the grid — "no files yet" over a connection
          // failure is a lie about their library, and the worst one to tell.
          <PaneLoadError
            icon={<Icon glyph={faImage} className="size-6" aria-hidden />}
            title="Could not load your library"
            description="This is a problem reaching the server. Nothing you have uploaded is affected — none of it has been lost."
            onRetry={() => {
              void refetch();
            }}
          />
        ) : isLoading ? (
          <PaneWaiting label="Loading your files…" />
        ) : rows.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={narrowed}
            noResults={{
              icon: <Icon glyph={faImage} className="size-6" aria-hidden />,
              title: 'Nothing matches that',
              description: emptyAdvice(
                search.trim(),
                kind === 'all' ? null : (activeKindLabel?.toLowerCase() ?? null),
                status === 'all' ? null : activeStatusLabel
              ),
            }}
            firstRun={{
              title: 'Your library is empty',
              description:
                'This is where every picture, video, sound and document you upload lives, ready to drop into anything you write. Upload your first file to get started.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  loading={upload.isPending}
                  onClick={() => {
                    fileRef.current?.click();
                  }}
                >
                  <Icon glyph={faUpload} className="size-4" aria-hidden />
                  Upload a file
                </Button>
              ),
            }}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
            {rows.map((asset) => {
              const state = assetStatusState(asset.status);
              const showThumb =
                asset.kind === 'image' && asset.thumbnailUrl && asset.status === 'ready';
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    aria-label={`Open ${asset.filename}`}
                    title="Open — hold Shift to open alongside, Alt for a new window"
                    className="group border-base-300 bg-base-100 rounded-box flex w-full flex-col overflow-hidden border text-left hover:[border-color:var(--color-module)]"
                    onClick={(event) => {
                      open(asset, event);
                    }}
                  >
                    <span className="bg-base-200 relative flex aspect-square w-full items-center justify-center overflow-hidden">
                      {showThumb && asset.thumbnailUrl ? (
                        <Image
                          src={asset.thumbnailUrl}
                          alt=""
                          fill
                          sizes="240px"
                          className="object-cover"
                          // Unoptimized: these are cross-origin tenant thumbnails,
                          // where the image optimizer's host allow-list is
                          // environment-fragile and 400s on a legitimately-served
                          // original. A broken tile is worse than the browser
                          // scaling an already-small file. Matches the picker.
                          unoptimized
                        />
                      ) : (
                        kindIcon(asset.kind, 'size-8')
                      )}
                      {asset.status !== 'ready' ? (
                        <span className="absolute top-1.5 left-1.5">
                          <Badge color={state.tone} variant="soft" size="sm">
                            {state.label}
                          </Badge>
                        </span>
                      ) : null}
                    </span>
                    <span className="flex w-full min-w-0 flex-col gap-0.5 p-2">
                      <span className="block w-full truncate text-sm font-medium">
                        {asset.filename}
                      </span>
                      <span className="flex items-center gap-1 text-sm">
                        {kindIcon(asset.kind, 'size-3.5 shrink-0')}
                        {sizeLabel(asset)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        <RowOpenHint />
      </div>
    </div>
  );
}
