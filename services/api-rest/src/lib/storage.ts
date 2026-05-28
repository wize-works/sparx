// Media storage backends.
//
// Two implementations:
//
//   - GcsStorage (prod) — generates V4 signed PUT URLs against
//     `GCS_MEDIA_BUCKET`. The browser PUTs the bytes directly to GCS so
//     api-rest never streams large files. Object keys follow the per-tenant
//     prefix scheme documented in plan §3.2:
//       `${tenantId}/originals/${assetId}/${filename}`
//       `${tenantId}/variants/${assetId}/${format}-${width}.${ext}`
//
//   - LocalStorage (dev / test) — writes to `MEDIA_LOCAL_DIR` on the host
//     filesystem and returns a path-based "presigned" URL that points back
//     at api-rest's own /v1/media/_local/* endpoints. Lets the dashboard
//     exercise the full upload flow without a GCS service account.
//
// The pubsub `media.uploaded` event lands the same way in both modes —
// downstream workers (media-worker) read the asset row and pull from
// storage via `readObject(key)` rather than re-deriving the URL, so the
// abstraction is honest end-to-end.

import { Storage as GcsClient } from '@google-cloud/storage';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { env } from '../env.js';

export interface PresignedPut {
  // URL the browser PUTs to. In GCS mode this is a V4 signed URL valid for
  // PUT_URL_TTL_SEC; in local mode this is a `/v1/media/_local/...` path.
  url: string;
  // Headers the caller must send with the PUT — content-type at minimum
  // (so GCS records it on the object).
  headers: Record<string, string>;
  // Object key — caller writes this back to the asset row so we can re-
  // derive variants later.
  key: string;
  // Expiry time (ISO) — only meaningful in GCS mode.
  expiresAt: string;
}

export interface ReadObject {
  body: Readable;
  contentType: string | null;
  size: number | null;
}

export interface MediaStorage {
  readonly mode: 'gcs' | 'local';
  // Generate a presigned PUT URL the browser can use to upload `key` with
  // the given content-type.
  presignPut(key: string, contentType: string, contentLength: number): Promise<PresignedPut>;
  // Pipe an existing object into a Readable so the transcoder worker can
  // process it without re-downloading via the public URL.
  readObject(key: string): Promise<ReadObject>;
  // Write a derived variant to storage. Returns the public URL (CDN in
  // prod, api-rest origin in dev) that callers can persist alongside the
  // MediaVariant row.
  writeObject(key: string, contentType: string, body: Buffer | Readable): Promise<{ url: string }>;
  // Best-effort delete. Used by soft-delete GC and bucket cleanup.
  deleteObject(key: string): Promise<void>;
  // Get the canonical public URL for a variant key. Constant-time in both
  // backends; no signing required because variants are world-readable.
  publicUrl(key: string): string;
}

const PUT_URL_TTL_SEC = 15 * 60;

// ────────────────────────────────────────────────────────────────────────
// GCS backend
// ────────────────────────────────────────────────────────────────────────

class GcsStorage implements MediaStorage {
  readonly mode = 'gcs' as const;
  private readonly client: GcsClient;
  // Private bucket — originals + any tenant-sensitive object. Reads via
  // service-account auth or short-lived signed URLs.
  private readonly privateBucketName: string;
  // Public bucket — derived variants only. World-readable; storefronts
  // <img src> against the publicBase, fronted by Cloudflare.
  private readonly publicBucketName: string;
  private readonly publicBase: string;

  constructor(privateBucketName: string, publicBucketName: string, publicBase: string) {
    this.client = new GcsClient(env.GCP_PROJECT_ID ? { projectId: env.GCP_PROJECT_ID } : {});
    this.privateBucketName = privateBucketName;
    this.publicBucketName = publicBucketName;
    // Variants are served via api-rest's GET /v1/public/media/variants/:key
    // route (see routes/v1/public/media.ts) because the org-level DRS
    // policy forbids allUsers on GCS. `publicBase` is the externally-
    // reachable api-rest origin (https://api.sparx.works); empty means
    // same-origin (relative URLs — used in dev).
    this.publicBase = publicBase;
  }

  // Variants live on the public bucket; originals + anything else go to the
  // private one. Object keys follow the `<tenantId>/{originals,variants}/...`
  // convention from variantKey()/originalKey() below, so a substring check
  // is sufficient and avoids per-call argument plumbing.
  private isPublicKey(key: string): boolean {
    return key.includes('/variants/');
  }

  private file(key: string) {
    const bucketName = this.isPublicKey(key) ? this.publicBucketName : this.privateBucketName;
    return this.client.bucket(bucketName).file(key);
  }

  async presignPut(key: string, contentType: string): Promise<PresignedPut> {
    const expires = Date.now() + PUT_URL_TTL_SEC * 1000;
    const [url] = await this.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType,
    });
    return {
      url,
      headers: { 'content-type': contentType },
      key,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  async readObject(key: string): Promise<ReadObject> {
    const file = this.file(key);
    const [meta] = await file.getMetadata();
    return {
      body: file.createReadStream(),
      contentType: typeof meta.contentType === 'string' ? meta.contentType : null,
      size: typeof meta.size === 'number' ? meta.size : meta.size ? Number(meta.size) : null,
    };
  }

  async writeObject(key: string, contentType: string, body: Buffer | Readable) {
    const file = this.file(key);
    const stream = file.createWriteStream({
      contentType,
      resumable: false,
      // Variants are world-readable behind CDN — see the bucket TF for the
      // ACL/IAM that makes this work without a per-object publicRead grant.
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    if (Buffer.isBuffer(body)) {
      await new Promise<void>((resolveStream, reject) => {
        stream.once('error', reject);
        stream.once('finish', resolveStream);
        stream.end(body);
      });
    } else {
      await pipeline(body, stream);
    }
    return { url: this.publicUrl(key) };
  }

  async deleteObject(key: string): Promise<void> {
    await this.file(key)
      .delete({ ignoreNotFound: true })
      .catch(() => {
        // Already-gone is fine; storage backends should be idempotent.
      });
  }

  publicUrl(key: string): string {
    // Only variants have a stable public URL. Originals are private —
    // callers asking for one are using the wrong path; route via a signed
    // GET instead.
    if (!this.isPublicKey(key)) {
      throw new Error(
        `Refusing to mint a public URL for a private-bucket key: ${JSON.stringify(key)}`
      );
    }
    // Public URL path matches routes/v1/public/media.ts:
    //   <tenantId>/variants/<assetId>/<filename> →
    //   <base>/v1/public/media/variants/<tenantId>/<assetId>/<filename>
    // Splitting on `/variants/` lets us preserve the original key shape
    // without re-encoding the segments (they're already URL-safe — the
    // worker only emits `[a-z]+-\d+\.[a-z0-9]+` filenames).
    return `${this.publicBase}/v1/public/media/variants/${key}`;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Local filesystem backend
// ────────────────────────────────────────────────────────────────────────

// Local mode rejects keys that try to escape the storage root. The check is
// belt-and-braces because the API never *forwards* user-controlled keys
// directly — they're constructed from `${tenantId}/...` inside our routes —
// but if that invariant ever slipped we'd rather 400 here than write to a
// neighbouring directory.
function assertSafeKey(key: string): void {
  if (key.length === 0 || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error(`Refusing unsafe storage key: ${JSON.stringify(key)}`);
  }
}

class LocalStorage implements MediaStorage {
  readonly mode = 'local' as const;
  private readonly root: string;
  private readonly publicBase: string;

  constructor(root: string, publicBase: string) {
    this.root = resolve(root);
    this.publicBase = publicBase;
  }

  private path(key: string): string {
    assertSafeKey(key);
    return join(this.root, key);
  }

  // The local "presigned PUT" is a private api-rest endpoint that accepts
  // raw bytes and persists them under `MEDIA_LOCAL_DIR`. The endpoint
  // verifies the signed key claim so a malicious caller can't spray bytes
  // into arbitrary tenant prefixes.
  presignPut(key: string, contentType: string): Promise<PresignedPut> {
    assertSafeKey(key);
    const expires = Date.now() + PUT_URL_TTL_SEC * 1000;
    return Promise.resolve({
      url: `/v1/media/_local/${encodeURIComponent(key)}`,
      headers: { 'content-type': contentType },
      key,
      expiresAt: new Date(expires).toISOString(),
    });
  }

  async readObject(key: string): Promise<ReadObject> {
    const path = this.path(key);
    const stat = await fs.stat(path);
    return {
      body: createReadStream(path),
      contentType: null, // Caller round-trips through MediaAsset.mimeType
      size: stat.size,
    };
  }

  async writeObject(key: string, _contentType: string, body: Buffer | Readable) {
    const path = this.path(key);
    await fs.mkdir(dirname(path), { recursive: true });
    if (Buffer.isBuffer(body)) {
      await fs.writeFile(path, body);
    } else {
      await pipeline(body, createWriteStream(path));
    }
    return { url: this.publicUrl(key) };
  }

  async deleteObject(key: string): Promise<void> {
    await fs.rm(this.path(key), { force: true });
  }

  publicUrl(key: string): string {
    const base = this.publicBase || '';
    return `${base}/v1/public/media/file/${encodeURIComponent(key)}`;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Module-level singleton
// ────────────────────────────────────────────────────────────────────────

let cached: MediaStorage | null = null;

export function getStorage(): MediaStorage {
  if (cached) return cached;
  if (env.GCS_MEDIA_BUCKET) {
    cached = new GcsStorage(
      env.GCS_MEDIA_BUCKET,
      env.GCS_MEDIA_PUBLIC_BUCKET,
      env.MEDIA_PUBLIC_URL
    );
  } else {
    cached = new LocalStorage(env.MEDIA_LOCAL_DIR, env.MEDIA_PUBLIC_URL);
  }
  return cached;
}

// Test-only — let the integration tests swap in a mock or reset between
// suites. Not exported in production code paths.
export function _resetStorageForTest(): void {
  cached = null;
}

// Object-key helpers — keep the layout in one place so changing it later
// is a single-file edit.

export function originalKey(tenantId: string, assetId: string, filename: string): string {
  // Filename in the key is informational only (helps GCS console + CLI
  // recognise the file). The route layer slugifies it to ASCII so the GCS
  // key stays URL-safe.
  return `${tenantId}/originals/${assetId}/${safeFilename(filename)}`;
}

export function variantKey(
  tenantId: string,
  assetId: string,
  format: string,
  width: number,
  ext: string
): string {
  return `${tenantId}/variants/${assetId}/${format}-${width}.${ext}`;
}

function safeFilename(name: string): string {
  // Strip path traversal and non-printable bytes; collapse whitespace.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.-]+/g, '_').slice(0, 200) || 'file';
}
