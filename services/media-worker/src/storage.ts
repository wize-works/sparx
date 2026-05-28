// Thin wrapper around @google-cloud/storage. Mirrors the interface
// services/api-rest/src/lib/storage.ts uses on the prod (GCS) path so
// the two services stay coherent without sharing code (separate workspace,
// separate Pod, separate failure surface).

import { Storage } from '@google-cloud/storage';
import { Readable } from 'node:stream';
import { env } from './env.js';

const client = new Storage({ projectId: env.GCP_PROJECT_ID });
const bucket = client.bucket(env.GCS_MEDIA_BUCKET);

export async function downloadObject(key: string): Promise<Buffer> {
  const [buf] = await bucket.file(key).download();
  return buf;
}

export async function uploadVariant(key: string, contentType: string, body: Buffer): Promise<void> {
  const file = bucket.file(key);
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
