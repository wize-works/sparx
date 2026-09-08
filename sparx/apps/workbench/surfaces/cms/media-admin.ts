'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE MEDIA LIBRARY DATA LAYER (admin)
//
// The picker in ./media.ts reads a thin, image-only slice of the library — one
// thumbnail URL per row, enough to choose a picture. The Media library SURFACE
// needs the whole story: every kind of file (images, video, audio, documents),
// the size and dimensions, the alt text and caption you can edit, how many
// places a file is used, and the delete. So this layer owns the FULL wire shape
// and its own key tree, and never edits media.ts (which the editor depends on).
//
// api-rest is snake_case on the wire (see serializeAsset in
// wizeworks/services/api-rest/src/routes/v1/media/assets.ts). Field names are kept
// verbatim off the wire and mapped ONCE, here, into the camelCase shape a
// surface renders — so there is one spelling of each fact between server and
// screen, and the list and the detail can never disagree about a field.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── What a file is, in the terms this surface groups by ─────────────────── */

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'other';

/** The broad family a file belongs to, from its mime type. Drives the kind
 *  filter, the tile icon, and whether we show an image/video/audio preview. */
export function mediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'document';
  return 'other';
}

/** The `?type=` prefix the list endpoint filters on (a `mimeType startsWith`).
 *  Documents live under the `application/` prefix. */
function kindToTypeParam(kind: Exclude<MediaKind, 'all' | 'other'>): string {
  return kind === 'document' ? 'application' : kind;
}

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** What a file's processing status means, in an owner's words, with the tone
 *  that carries it on a `<Badge>`. `uploading` covers both "the bytes are still
 *  arriving" and, in production, "the worker is still making thumbnails" — from
 *  the owner's side both are simply "not ready yet". */
export function assetStatusState(status: string): { label: string; tone: Tone; detail: string } {
  switch (status) {
    case 'ready':
      return { label: 'Ready', tone: 'success', detail: 'Uploaded and ready to use anywhere.' };
    case 'uploading':
      return {
        label: 'Processing',
        tone: 'warning',
        detail: 'Still being prepared. It will be ready to use in a moment — refresh to check.',
      };
    case 'failed':
      return {
        label: 'Failed',
        tone: 'error',
        detail: 'Something went wrong preparing this file. Try uploading it again.',
      };
    default:
      return { label: status, tone: 'neutral', detail: '' };
  }
}

/* ── Wire shapes ────────────────────────────────────────────────────────── */

interface MediaVariantWire {
  id: string;
  format: string;
  width: number;
  height: number;
  byte_size: string;
  url: string;
}

/** One asset exactly as api-rest serialises it. Numbers that can exceed 2^53
 *  (byte sizes) arrive as strings. */
interface MediaAssetWire {
  id: string;
  key: string;
  original_filename: string;
  mime_type: string;
  byte_size: string;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  dominant_color: string | null;
  blurhash: string | null;
  focal_point: { x: number; y: number };
  alt_text: string | null;
  caption: string | null;
  status: string;
  processing_error: string | null;
  usage_count: number;
  original_url: string | null;
  variants: MediaVariantWire[];
  created_at: string;
  updated_at: string;
}

/* ── The shape a surface renders ─────────────────────────────────────────── */

export interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  /** Bytes as a real number — files are capped at 200 MB, so this is safe.
   *
   *  NULL when nobody measured it. No file is zero bytes, so a stored 0 never
   *  means "weighs nothing"; it means the size was never recorded — every linked
   *  picture, and every stored one whose upload predates the size being written.
   *  Coercing that to 0 and rendering it through `formatBytes` printed a
   *  confident **0 bytes** under most of a library (issue 380). */
  byteSize: number | null;
  /** The file is LINKED from somewhere else rather than stored here — the key is
   *  an `http(s):` URL (a hot-linked blueprint picture) or a `data:` URI (an
   *  inline brand mark). It is why most unmeasured files are unmeasured: there
   *  was never a local file to weigh. Same test api-rest uses to decide whether a
   *  key needs resolving through storage. */
  linked: boolean;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** A small rendition for a grid tile, or null while nothing renders yet. */
  thumbnailUrl: string | null;
  /** The best full-size URL for a detail preview (the original, or the largest
   *  transcoded variant when the original is private). */
  previewUrl: string | null;
  altText: string | null;
  caption: string | null;
  status: string;
  processingError: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The smallest rendition at least `minWidth` across (sharp on a tile without
 *  hauling a full-size photo), falling back to the largest variant, then the
 *  original. */
function pickThumbnail(wire: MediaAssetWire, minWidth: number): string | null {
  const sorted = [...wire.variants].sort((a, b) => a.width - b.width);
  const big = sorted.find((variant) => variant.width >= minWidth);
  return big?.url ?? sorted.at(-1)?.url ?? wire.original_url;
}

function toAsset(wire: MediaAssetWire): MediaAsset {
  const largestVariant = [...wire.variants].sort((a, b) => b.width - a.width)[0]?.url ?? null;
  const byteSize = Number(wire.byte_size);
  return {
    id: wire.id,
    filename: wire.original_filename,
    mimeType: wire.mime_type,
    kind: mediaKind(wire.mime_type),
    byteSize: Number.isFinite(byteSize) && byteSize > 0 ? byteSize : null,
    linked: /^(?:https?:|data:)/i.test(wire.key),
    width: wire.width,
    height: wire.height,
    durationSec: wire.duration_sec,
    thumbnailUrl: pickThumbnail(wire, 320),
    // Prefer the true original; fall back to the largest variant when the
    // original is private (production images) so a preview still renders.
    previewUrl: wire.original_url ?? largestVariant,
    altText: wire.alt_text,
    caption: wire.caption,
    status: wire.status,
    processingError: wire.processing_error,
    usageCount: wire.usage_count,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  };
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

/** All the ways the library list can be narrowed. `kind: 'all'` and
 *  `status: 'all'` mean "don't filter on that axis". */
export interface MediaListQuery {
  q: string;
  kind: MediaKind | 'all';
  status: 'all' | 'ready' | 'uploading' | 'failed';
  take: number;
  skip: number;
}

// A namespace distinct from the picker's `['cms','media','library'|'assets']`
// keys, so the two caches never collide — the picker's image-only, ready-only
// slice is a different query from the library's every-file window.
export const mediaAdminKeys = {
  all: ['cms', 'media', 'admin'] as const,
  lists: () => [...mediaAdminKeys.all, 'list'] as const,
  list: (query: MediaListQuery) => [...mediaAdminKeys.lists(), query] as const,
  detail: (id: string) => [...mediaAdminKeys.all, 'detail', id] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

export function useMediaAssetsList(query: MediaListQuery) {
  return useQuery({
    queryKey: mediaAdminKeys.list(query),
    queryFn: async () => {
      const { items, total } = await api.list<MediaAssetWire>('/v1/media/assets', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.kind !== 'all' && query.kind !== 'other'
          ? { type: kindToTypeParam(query.kind) }
          : {}),
        ...(query.status !== 'all' ? { status: query.status } : {}),
        take: query.take,
        skip: query.skip,
      });
      return { items: items.map(toAsset), total };
    },
    // Keeps the current window on screen while the next one loads, so paging and
    // filtering don't blink the grid out to an empty state and back.
    placeholderData: (previous) => previous,
  });
}

export function useMediaAsset(id: string) {
  return useQuery({
    queryKey: mediaAdminKeys.detail(id),
    queryFn: async () => toAsset(await api.get<MediaAssetWire>(`/v1/media/assets/${id}`)),
    enabled: id !== 'new',
    // A 404 means deleted, not broken — don't retry it into a generic failure.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** The one way anything here says "that changed": refresh the list windows, and
 *  — when a specific asset moved — its own record. Scoped to `lists()` rather
 *  than the whole `all` prefix so a list refresh never re-touches OTHER open
 *  detail panes. */
function useInvalidateMedia() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: mediaAdminKeys.lists() });
    if (id) void queryClient.invalidateQueries({ queryKey: mediaAdminKeys.detail(id) });
  };
}

/** Exposed for the list surface, which uploads through the picker's shared
 *  `useUploadMedia` (in ./media.ts) and needs to refresh THIS list afterwards —
 *  that hook only knows to refresh the picker's own cache. */
export function useRefreshMediaLibrary() {
  const invalidate = useInvalidateMedia();
  return () => {
    invalidate();
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

/** The metadata the API lets you change on an asset. Filename is NOT here — the
 *  PATCH route only accepts these four fields, so the file's name is identity,
 *  not an editable field. */
export interface UpdateAssetInput {
  alt_text?: string | null;
  caption?: string | null;
  focal_point_x?: number;
  focal_point_y?: number;
}

export function useUpdateAsset(id: string) {
  const invalidate = useInvalidateMedia();
  return useMutation({
    mutationFn: (input: UpdateAssetInput) =>
      api.patch<MediaAssetWire>(`/v1/media/assets/${id}`, input).then(toAsset),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeleteAsset(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/v1/media/assets/${id}`),
    onSuccess: () => {
      // Only the LIST is refreshed. The detail query is deliberately left alone:
      // the delete closes this pane, and refetching (or removing) detail(id)
      // would disturb the pane's own still-mounted observer while the dock
      // commits the close — a flushSync inside a lifecycle method.
      void queryClient.invalidateQueries({ queryKey: mediaAdminKeys.lists() });
    },
  });
}

/* ── Saying things in plain words ───────────────────────────────────────── */

/**
 * A human size — "2.4 MB", not "2516582 bytes".
 */
/** What to print where a file's size goes.
 *
 *  A size nobody recorded must not render as one, and the two reasons a size is
 *  missing are worth telling apart: a linked picture was never downloaded here,
 *  so there is nothing of ours to weigh, while a stored file with no size is a
 *  gap in its own record. */
export function sizeLabel(asset: Pick<MediaAsset, 'byteSize' | 'linked'>): string {
  if (asset.byteSize !== null) return formatBytes(asset.byteSize);
  return asset.linked ? 'Stored somewhere else' : 'Size not recorded';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 bytes';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const rounded =
    exponent === 0 ? value : value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded)} ${units[exponent]}`;
}

/** Pixel dimensions, or null when the file has none (audio, most documents). */
export function dimensionsLabel(asset: Pick<MediaAsset, 'width' | 'height'>): string | null {
  if (asset.width && asset.height) return `${String(asset.width)} × ${String(asset.height)} pixels`;
  return null;
}

/** A duration in minutes and seconds, for video and audio. */
export function durationLabel(durationSec: number | null): string | null {
  if (!durationSec || durationSec <= 0) return null;
  const total = Math.round(durationSec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${seconds.toString().padStart(2, '0')}`;
}

/** Medium date and time. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The server's own sentence for a 4xx, shown verbatim: the media routes explain
 * the real problem far better than a status code — most importantly the delete
 * conflict ("Asset is still referenced by 3 entries."), which names the exact
 * reason a file cannot be removed. A 5xx carries no such sentence, so it falls
 * back to the caller's wording.
 */
export function mediaErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}
