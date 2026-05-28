// Per-asset processing pipeline. Pure function so the integration test
// can drive it without involving Pub/Sub.
//
//   1. Look up the MediaAsset row.
//   2. Download original bytes from GCS.
//   3. Run transcode() — variants + blurhash + dominant color + dims.
//   4. Upload each variant to GCS under the standard variant prefix.
//   5. Write MediaVariant rows + update MediaAsset(status='ready').
//
// On failure: MediaAsset.status='failed', processingError = err.message.
// The Pub/Sub message is acked either way — retries happen at a higher
// level (operator can re-enqueue manually) rather than thrashing GCS on
// transient encode failures.

import { prisma, withTenant } from '@sparx/db';
import { downloadObject, uploadVariant, variantKey } from './storage.js';
import { transcode } from './transcode.js';

export interface ProcessResult {
  status: 'ready' | 'failed' | 'skipped';
  variantCount: number;
  errorMessage?: string;
}

export async function processAsset(
  assetId: string,
  logger: {
    info: (obj: object, msg?: string) => void;
    warn: (obj: object, msg?: string) => void;
    error: (obj: object, msg?: string) => void;
  }
): Promise<ProcessResult> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.deletedAt) {
    logger.warn({ assetId }, 'asset missing or soft-deleted; skipping');
    return { status: 'skipped', variantCount: 0 };
  }
  if (asset.status !== 'uploading') {
    logger.warn({ assetId, status: asset.status }, 'asset not in uploading state; skipping');
    return { status: 'skipped', variantCount: 0 };
  }

  try {
    logger.info({ assetId, key: asset.key, mimeType: asset.mimeType }, 'downloading original');
    const original = await downloadObject(asset.key);

    logger.info({ assetId, bytes: original.length }, 'transcoding');
    const result = await transcode(original, asset.mimeType);

    logger.info({ assetId, variants: result.variants.length }, 'uploading variants');
    await Promise.all(
      result.variants.map((v) => {
        const key = variantKey(asset.tenantId, asset.id, v.format, v.width, v.ext);
        return uploadVariant(key, v.contentType, v.body);
      })
    );

    // Single transaction so all the rows land atomically — the worker
    // either ships a complete set of variants OR leaves the asset in
    // status='uploading' for a manual retry.
    await withTenant({ tenantId: asset.tenantId }, async (tx) => {
      await tx.mediaVariant.deleteMany({ where: { assetId: asset.id } });
      for (const v of result.variants) {
        await tx.mediaVariant.create({
          data: {
            tenantId: asset.tenantId,
            assetId: asset.id,
            format: v.format,
            width: v.width,
            height: v.height,
            byteSize: BigInt(v.body.length),
            key: variantKey(asset.tenantId, asset.id, v.format, v.width, v.ext),
          },
        });
      }
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: 'ready',
          width: result.width,
          height: result.height,
          dominantColor: result.dominantColor,
          blurhash: result.blurhash,
          processingError: null,
        },
      });
    });

    logger.info({ assetId, variantCount: result.variants.length }, 'asset ready');
    return { status: 'ready', variantCount: result.variants.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ assetId, err: message }, 'processing failed');
    await withTenant({ tenantId: asset.tenantId }, async (tx) => {
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: { status: 'failed', processingError: message },
      });
    });
    return { status: 'failed', variantCount: 0, errorMessage: message };
  }
}
