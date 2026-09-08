// Media asset service for HEADLESS callers (the MCP image tools).
//
// Two create paths, mirroring the two real ways a MediaAsset is born in the
// platform:
//
//   · createImageAssetFromBytes — the true upload. Server-side write of the
//     original bytes → `media.uploaded` → media-worker transcodes to CDN
//     variants. Mirrors the api-rest presigned-PUT route's contract (same mime
//     allowlist shape, same status machine, same event), collapsed into one
//     call because there is no browser to do the PUT.
//
//   · createImageAssetFromUrl — a hot-link / inline reference. Stores an
//     external http(s) URL (or a small data:image/ URI) directly as the asset
//     `key`, status='ready', no bytes, no transcode. Mirrors blueprint-installer
//     (docs/54 §6). The server NEVER fetches the URL — the storefront browser
//     does — so there is no server-side SSRF surface on this path.
//
// SECURITY (this feeds a PUBLIC MCP):
//   · image mime allowlist — no video/audio/pdf/executables through these tools.
//   · byte cap — small enough to ride the MCP JSON-RPC envelope without raising
//     the transport's body ceiling (web images should be optimised anyway).
//   · scheme pin — http(s) or data:image/ ONLY. `data:text/html`, `javascript:`,
//     `file:`… are refused (the same XSS guard blueprints use).
//   · tenant-scoped — every write runs inside withTenant(); rows are RLS-backed.

import { withTenant } from '@wizeworks/db';
import { createPublisher, publishEvent, type PublisherLogger } from '@wizeworks/events';
import { countOneAssetUsage, describeUsage } from './asset-usage.js';
import { getStorage, originalKey, safeFilename } from './storage.js';
import { storageEnv } from './env.js';
import { mintUploadToken } from './upload-token.js';

export class MediaValidationError extends Error {
  readonly code = 'MEDIA_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

// Images only — tighter than the api-rest media route (which also takes
// video/audio/pdf for the general library). The image tools accept exactly the
// raster + vector types the builder renders + the transcoder handles.
export const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
]);

// The byte-upload cap. Deliberately small: the bytes ride the MCP JSON-RPC
// envelope (base64-inflated ~1.37×) and api-mcp keeps a 512 KiB body ceiling on
// its public /mcp endpoint. 320 KiB decoded → ~440 KiB base64, comfortably
// under 512 KiB with room for the envelope. Web imagery should be optimised to
// this range regardless; a larger source belongs on a URL (set_image_from_url).
export const MAX_UPLOAD_IMAGE_BYTES = 320 * 1024;

// The MediaAsset.key column is VarChar(1024); a stored reference (URL or inline
// data URI) must fit. A larger image must go through the byte upload instead.
const MAX_REF_LENGTH = 1024;

// data:image/<subtype>[;param][;base64],<payload> — pinned to image/* so a
// caller can't smuggle data:text/html (stored-XSS) or any non-image data URI.
const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9-]+=[^;,]+)*(?:;base64)?,/i;

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export interface MediaWriteContext {
  tenantId: string;
  actorId: string | null;
  tenantSlug: string;
}

export interface CreatedImage {
  assetId: string;
  /** Ready-to-use storefront <img src> — the universal /v1/public/media resolver. */
  url: string;
  status: string;
}

export interface UploadImageBytesInput {
  data: Buffer;
  mimeType: string;
  filename: string;
  alt?: string;
  width?: number;
  height?: number;
}

// Non-image document types — INTERNAL server-side writes only (shipping
// labels, generated PDFs). Deliberately NOT exposed through the public MCP
// image tools, which stay pinned to ALLOWED_IMAGE_MIME above.
export const ALLOWED_DOCUMENT_MIME: ReadonlySet<string> = new Set(['application/pdf', 'image/png']);

// Shipping labels are small (tens of KB); this is generous headroom without
// opening the door to arbitrary large uploads through this path.
export const MAX_UPLOAD_DOCUMENT_BYTES = 5 * 1024 * 1024;

export interface UploadDocumentBytesInput {
  data: Buffer;
  mimeType: string;
  filename: string;
}

export interface CreatedDocument {
  assetId: string;
  status: string;
}

export interface ImageFromUrlInput {
  url: string;
  alt?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  filename?: string;
}

/** The universal media resolver URL (routes/v1/public/media.ts) — absolute in
 *  prod (MEDIA_PUBLIC_URL = api origin), relative in dev. Stable per asset id. */
export function resolveMediaUrl(assetId: string, tenantSlug: string): string {
  const base = storageEnv().MEDIA_PUBLIC_URL || '';
  return `${base}/v1/public/media/${assetId}?tenant=${encodeURIComponent(tenantSlug)}`;
}

// ── Byte upload — the real pipeline ─────────────────────────────────────────

export async function createImageAssetFromBytes(
  ctx: MediaWriteContext,
  input: UploadImageBytesInput
): Promise<CreatedImage> {
  if (!ALLOWED_IMAGE_MIME.has(input.mimeType)) {
    throw new MediaValidationError(
      `Unsupported image type "${input.mimeType}". Allowed: ${[...ALLOWED_IMAGE_MIME].sort().join(', ')}.`
    );
  }
  if (input.data.length === 0) throw new MediaValidationError('Image is empty (0 bytes).');
  if (input.data.length > MAX_UPLOAD_IMAGE_BYTES) {
    throw new MediaValidationError(
      `Image is ${(input.data.length / 1024).toFixed(0)} KiB; the upload cap is ${MAX_UPLOAD_IMAGE_BYTES / 1024} KiB. ` +
        'Optimise/downscale it (web images should be well under this), or host it and use set_image_from_url.'
    );
  }

  const storage = getStorage();
  // On a transcoding backend the asset stays 'uploading' until media-worker flips it
  // after producing variants; on local disk nothing else ever will, so it has to reach
  // 'ready' itself or it never renders. Mirrors api-rest's /complete.
  //
  // This asked `mode === 'gcs'`, which silently became "not transcoding" when production
  // moved off GCS — so every headless upload was marked ready with no variants.
  const nextStatus = storage.transcodes ? 'uploading' : 'ready';

  const created = await withTenant({ tenantId: ctx.tenantId }, async (tx) => {
    const row = await tx.mediaAsset.create({
      data: {
        tenantId: ctx.tenantId,
        key: '', // finalised below once we have the id
        originalFilename: safeFilename(input.filename),
        mimeType: input.mimeType,
        byteSize: BigInt(input.data.length),
        status: 'uploading',
        width: input.width ?? null,
        height: input.height ?? null,
        altText: input.alt ?? null,
      },
      select: { id: true },
    });
    const key = originalKey(ctx.tenantId, row.id, input.filename);
    await storage.writeObject(key, input.mimeType, input.data);
    await tx.mediaAsset.update({ where: { id: row.id }, data: { key, status: nextStatus } });
    return { id: row.id, key };
  });

  // Fan out media.uploaded so media-worker transcodes (best-effort — a Pub/Sub
  // hiccup must not fail the write; the asset already exists).
  await publishMediaUploaded(ctx, created.id, created.key, input.mimeType, input.data.length);

  return {
    assetId: created.id,
    url: resolveMediaUrl(created.id, ctx.tenantSlug),
    status: nextStatus,
  };
}

/** Server-side write for non-image documents (shipping labels today).
 *  Unlike createImageAssetFromBytes, there is no transcode step — the
 *  bytes ARE the deliverable — so the asset is 'ready' immediately and no
 *  media.uploaded event fans out (the image transcoder wouldn't know what
 *  to do with a PDF). Not reachable from the public MCP image tools. */
export async function createDocumentAssetFromBytes(
  ctx: MediaWriteContext,
  input: UploadDocumentBytesInput
): Promise<CreatedDocument> {
  if (!ALLOWED_DOCUMENT_MIME.has(input.mimeType)) {
    throw new MediaValidationError(
      `Unsupported document type "${input.mimeType}". Allowed: ${[...ALLOWED_DOCUMENT_MIME].sort().join(', ')}.`
    );
  }
  if (input.data.length === 0) throw new MediaValidationError('Document is empty (0 bytes).');
  if (input.data.length > MAX_UPLOAD_DOCUMENT_BYTES) {
    throw new MediaValidationError(
      `Document is ${(input.data.length / 1024).toFixed(0)} KiB; the upload cap is ${MAX_UPLOAD_DOCUMENT_BYTES / 1024} KiB.`
    );
  }

  const storage = getStorage();
  const created = await withTenant({ tenantId: ctx.tenantId }, async (tx) => {
    const row = await tx.mediaAsset.create({
      data: {
        tenantId: ctx.tenantId,
        key: '',
        originalFilename: safeFilename(input.filename),
        mimeType: input.mimeType,
        byteSize: BigInt(input.data.length),
        status: 'uploading',
      },
      select: { id: true },
    });
    const key = originalKey(ctx.tenantId, row.id, input.filename);
    await storage.writeObject(key, input.mimeType, input.data);
    await tx.mediaAsset.update({ where: { id: row.id }, data: { key, status: 'ready' } });
    return { id: row.id };
  });

  return { assetId: created.id, status: 'ready' };
}

// ── Proxied upload — the two-phase, byte-free-through-the-model path ─────────
//
// create_image_upload → { uploadUrl } → caller PUTs bytes out of band → api-rest
// writes + transcodes. For real photos/screenshots whose base64 an LLM can't
// re-emit losslessly through a tool call. See upload-token.ts for the why.

// Cap for the PROXIED byte upload. Far larger than MAX_UPLOAD_IMAGE_BYTES
// because the bytes DON'T ride the MCP JSON-RPC envelope — they're PUT straight
// to api-rest out of band — but still bounded so the public upload endpoint
// can't be used to spray huge objects. The transcoder downscales anyway, so a
// source larger than this is pointless.
export const MAX_PROXIED_UPLOAD_BYTES = 20 * 1024 * 1024;

// Upload-URL lifetime. Long enough to PUT a 20 MB file on a slow link, short
// enough that a leaked URL is useless within minutes.
const UPLOAD_TOKEN_TTL_SEC = 15 * 60;

export interface CreateImageUploadInput {
  filename: string;
  mimeType: string;
  /** Exact byte length of the file — the PUT body must not exceed it. */
  byteSize: number;
  alt?: string;
  width?: number;
  height?: number;
}

export interface ImageUpload {
  assetId: string;
  /** PUBLIC, token-authed endpoint to PUT the raw bytes to (the side channel). */
  uploadUrl: string;
  method: 'PUT';
  /** Headers the PUT must send (content-type, matched + sniff-validated server-side). */
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  /** The storefront <img src> to use once uploaded (renders during transcode). */
  imageUrl: string;
}

export async function createImageUpload(
  ctx: MediaWriteContext,
  input: CreateImageUploadInput
): Promise<ImageUpload> {
  if (!ALLOWED_IMAGE_MIME.has(input.mimeType)) {
    throw new MediaValidationError(
      `Unsupported image type "${input.mimeType}". Allowed: ${[...ALLOWED_IMAGE_MIME].sort().join(', ')}.`
    );
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    throw new MediaValidationError('byteSize must be a positive integer (the file size in bytes).');
  }
  if (input.byteSize > MAX_PROXIED_UPLOAD_BYTES) {
    throw new MediaValidationError(
      `Image is ${(input.byteSize / (1024 * 1024)).toFixed(1)} MB; the upload cap is ` +
        `${MAX_PROXIED_UPLOAD_BYTES / (1024 * 1024)} MB.`
    );
  }

  // Create the row (status='uploading', no bytes yet), then finalise its key —
  // same shape as createImageAssetFromBytes, minus the write (the caller PUTs).
  const created = await withTenant({ tenantId: ctx.tenantId }, async (tx) => {
    const row = await tx.mediaAsset.create({
      data: {
        tenantId: ctx.tenantId,
        key: '',
        originalFilename: safeFilename(input.filename),
        mimeType: input.mimeType,
        byteSize: BigInt(input.byteSize),
        status: 'uploading',
        width: input.width ?? null,
        height: input.height ?? null,
        altText: input.alt ?? null,
      },
      select: { id: true },
    });
    const key = originalKey(ctx.tenantId, row.id, input.filename);
    await tx.mediaAsset.update({ where: { id: row.id }, data: { key } });
    return { id: row.id, key };
  });

  const exp = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SEC;
  const token = mintUploadToken({
    aid: created.id,
    tid: ctx.tenantId,
    key: created.key,
    mime: input.mimeType,
    max: input.byteSize,
    exp,
  });
  const base = storageEnv().MEDIA_PUBLIC_URL || '';
  const uploadUrl = `${base}/v1/public/media/upload/${created.id}?token=${encodeURIComponent(token)}`;

  return {
    assetId: created.id,
    uploadUrl,
    method: 'PUT',
    headers: { 'content-type': input.mimeType },
    expiresAt: new Date(exp * 1000).toISOString(),
    maxBytes: input.byteSize,
    imageUrl: resolveMediaUrl(created.id, ctx.tenantSlug),
  };
}

// ── URL / data-URI reference — no server fetch ──────────────────────────────

export async function createImageAssetFromUrl(
  ctx: MediaWriteContext,
  input: ImageFromUrlInput
): Promise<CreatedImage> {
  const url = validateImageRef(input.url);
  const mimeType = input.mimeType ?? mimeFromRef(url);
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new MediaValidationError(
      `Resolved image type "${mimeType}" is not allowed. Pass a URL ending in a known image extension, ` +
        `or set mimeType to one of: ${[...ALLOWED_IMAGE_MIME].sort().join(', ')}.`
    );
  }

  const created = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    tx.mediaAsset.create({
      data: {
        tenantId: ctx.tenantId,
        key: url, // stored verbatim; the resolver serves data: inline / 302s http(s)
        originalFilename: input.filename ?? filenameFromRef(url, mimeType),
        mimeType,
        byteSize: BigInt(0), // no bytes held — hot-linked / inline
        status: 'ready', // no transcode step
        width: input.width ?? null,
        height: input.height ?? null,
        altText: input.alt ?? null,
      },
      select: { id: true },
    })
  );

  return { assetId: created.id, url: resolveMediaUrl(created.id, ctx.tenantSlug), status: 'ready' };
}

function validateImageRef(raw: string): string {
  const url = raw.trim();
  if (url.length === 0) throw new MediaValidationError('Image URL is empty.');
  if (url.length > MAX_REF_LENGTH) {
    throw new MediaValidationError(
      `Reference is ${url.length} chars; the max is ${MAX_REF_LENGTH} (the stored-key limit). ` +
        'For a larger inline image, upload the bytes with upload_image instead of a data: URI.'
    );
  }
  const isHttp = /^https?:\/\//i.test(url);
  const isDataImage = DATA_IMAGE_RE.test(url);
  if (!isHttp && !isDataImage) {
    throw new MediaValidationError(
      'Must be an absolute http(s) URL or a data:image/… URI. ' +
        'Other schemes (data:text/html, javascript:, file:, …) are refused.'
    );
  }
  return url;
}

function mimeFromRef(url: string): string {
  const dataMatch = /^data:([^;,]+)/i.exec(url);
  if (dataMatch) return dataMatch[1]!.toLowerCase();
  const ext = url.split(/[?#]/)[0]!.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'image/jpeg';
}

function filenameFromRef(url: string, mimeType: string): string {
  if (/^data:/i.test(url)) return `image.${mimeType.split('/')[1] ?? 'bin'}`;
  const last = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
  return safeFilename(last || `image.${mimeType.split('/')[1] ?? 'bin'}`);
}

// ── Delete ──────────────────────────────────────────────────────────────────

export interface DeletedImage {
  assetId: string;
  status: 'deleted';
}

// Soft-delete a media asset (operator-recoverable), mirroring the api-rest
// DELETE /v1/media/assets/:id contract: refuse while it is still referenced
// (usageCount > 0) so a live <img> can't 404, then flag deletedAt and fan out
// media.deleted for downstream object GC.
export async function deleteMediaAsset(
  ctx: MediaWriteContext,
  assetId: string
): Promise<DeletedImage> {
  await withTenant({ tenantId: ctx.tenantId }, async (tx) => {
    const existing = await tx.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new MediaValidationError(`Media asset ${assetId} not found (or already deleted).`);
    }
    // COUNTED, for the same reason as the api-rest route's guard: `usageCount` is
    // a column nothing has ever written, so this refusal never fired (issue 381).
    const usage = await countOneAssetUsage(tx, assetId);
    if (usage.total > 0) {
      throw new MediaValidationError(
        `Asset is still used by ${describeUsage(usage)} — detach it first.`
      );
    }
    await tx.mediaAsset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
  });
  await publishMediaDeleted(ctx, assetId);
  return { assetId, status: 'deleted' };
}

// ── Event publish (self-contained; no Fastify logger) ───────────────────────

const publishLogger: PublisherLogger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', src: 'media', ...obj, msg })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', src: 'media', ...obj, msg })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', src: 'media', ...obj, msg })),
};

async function publishMediaUploaded(
  ctx: MediaWriteContext,
  assetId: string,
  key: string,
  mimeType: string,
  byteSize: number
): Promise<void> {
  const publisher = createPublisher({
    logger: publishLogger,
  });
  await publishEvent(
    publisher,
    'media.uploaded',
    ctx.tenantId,
    ctx.actorId,
    { assetId, key, mimeType, byteSize: String(byteSize) },
    publishLogger
  );
}

async function publishMediaDeleted(ctx: MediaWriteContext, assetId: string): Promise<void> {
  const publisher = createPublisher({
    logger: publishLogger,
  });
  await publishEvent(
    publisher,
    'media.deleted',
    ctx.tenantId,
    ctx.actorId,
    { assetId },
    publishLogger
  );
}
