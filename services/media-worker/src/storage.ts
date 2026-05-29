// Thin wrapper around @google-cloud/storage. Mirrors the interface
// services/api-rest/src/lib/storage.ts uses on the prod (GCS) path so
// the two services stay coherent without sharing code (separate workspace,
// separate Pod, separate failure surface).

import { Storage } from '@google-cloud/storage';
import { Readable } from 'node:stream';
import { env } from './env.js';

// On Cloud Run the Storage client auto-detects the project from the
// ambient GOOGLE_CLOUD_PROJECT env var; in tests/dev it picks up
// gcloud's application-default credentials. No need to thread an
// explicit projectId.
const client = new Storage();
// Private bucket — holds originals. Read-only from here; uploads come via
// presigned URLs from the dashboard through api-rest.
const originalsBucket = client.bucket(env.GCS_MEDIA_BUCKET);
// Public bucket — world-readable variants behind Cloudflare. Falls back
// to the originals bucket when only one bucket name is configured (dev).
const variantsBucket = client.bucket(env.GCS_MEDIA_PUBLIC_BUCKET || env.GCS_MEDIA_BUCKET);

export async function downloadObject(key: string): Promise<Buffer> {
  const [buf] = await originalsBucket.file(key).download();
  return buf;
}

export async function uploadVariant(key: string, contentType: string, body: Buffer): Promise<void> {
  const file = variantsBucket.file(key);
  await new Promise<void>((resolve, reject) => {
    const stream = file.createWriteStream({
      contentType,
      resumable: false,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    stream.once('error', reject);
    stream.once('finish', resolve);
    Readable.from(body).pipe(stream);
  });
}

export function variantKey(
  tenantId: string,
  assetId: string,
  format: string,
  width: number,
  ext: string
): string {
  // Mirror of api-rest's variantKey() so the asset detail endpoint can
  // re-derive any variant URL from (tenantId, assetId, format, width).
  return `${tenantId}/variants/${assetId}/${format}-${width}.${ext}`;
}
