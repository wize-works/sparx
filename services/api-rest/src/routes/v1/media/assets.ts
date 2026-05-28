// Media assets — read, edit metadata, soft-delete.
//
//   GET    /v1/media/assets                 → list (cursor-paged)
//   GET    /v1/media/assets/:id             → detail with variants
//   PATCH  /v1/media/assets/:id             → alt text, caption, focal point
//   DELETE /v1/media/assets/:id             → soft delete (rejects when in use)
//
// Variant URLs come straight off the storage backend's `publicUrl(key)`.
// In prod that's the Cloudflare CDN; in dev it's the api-rest origin
// serving from disk. Either way the dashboard can `<img src=url>` it.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '../../../lib/db.js';
import { ok, paged } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { writeAudit } from '../../../lib/audit.js';
import { publish } from '../../../lib/pubsub.js';
import { getStorage } from '../../../lib/storage.js';
import { conflict, notFound } from '../../../errors.js';

const ListQuery = z.object({
  q: z.string().max(255).optional(),
  status: z.enum(['uploading', 'ready', 'failed']).optional(),
  // Filter to assets whose mime_type starts with this string ("image",
  // "video", "audio") so the dashboard's asset picker can scope to type
  // without doing the substring match client-side.
  type: z.string().max(63).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});

const PathId = z.object({ id: z.string().uuid() });

const PatchBody = z
  .object({
    alt_text: z.string().max(500).nullable().optional(),
    caption: z.string().max(2000).nullable().optional(),
    focal_point_x: z.number().min(0).max(1).optional(),
    focal_point_y: z.number().min(0).max(1).optional(),
  })
  .strict();

interface AssetRow {
  id: string;
  key: string;
  originalFilename: string;
  mimeType: string;
  byteSize: bigint;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  dominantColor: string | null;
  blurhash: string | null;
  focalPointX: number;
  focalPointY: number;
  altText: string | null;
  caption: string | null;
  status: string;
  processingError: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface VariantRow {
  id: string;
  format: string;
  width: number;
  height: number;
  byteSize: bigint;
  key: string;
}

function serializeAsset(row: AssetRow, variants: VariantRow[] = []) {
  const storage = getStorage();
  return {
    id: row.id,
    key: row.key,
    original_filename: row.originalFilename,
    mime_type: row.mimeType,
    byte_size: row.byteSize.toString(),
    width: row.width,
    height: row.height,
    duration_sec: row.durationSec,
    dominant_color: row.dominantColor,
    blurhash: row.blurhash,
    focal_point: { x: row.focalPointX, y: row.focalPointY },
    alt_text: row.altText,
    caption: row.caption,
    status: row.status,
    processing_error: row.processingError,
    usage_count: row.usageCount,
    // Originals are private — the dashboard fetches them via a separate
    // signed-GET flow once we add it (Phase 3.7). Variants are public.
    original_url: storage.mode === 'local' ? storage.publicUrl(row.key) : null,
    variants: variants.map((v) => ({
      id: v.id,
      format: v.format,
      width: v.width,
      height: v.height,
      byte_size: v.byteSize.toString(),
      url: storage.publicUrl(v.key),
    })),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const mediaAssetRoutes: FastifyPluginAsync = (app) => {
  // ──────────────────────────────────────────────────────────────────────
  // LIST
  // ──────────────────────────────────────────────────────────────────────

  app.get('/v1/media/assets', async (request) => {
    requireRole(request, 'viewer');
    const q = ListQuery.parse(request.query);

    const rows = await withRequestTenant(request, (tx) =>
      tx.mediaAsset.findMany({
        where: {
          deletedAt: null,
          ...(q.status ? { status: q.status } : {}),
          ...(q.type ? { mimeType: { startsWith: q.type } } : {}),
          ...(q.q
            ? {
                OR: [
                  { originalFilename: { contains: q.q, mode: 'insensitive' } },
                  { altText: { contains: q.q, mode: 'insensitive' } },
                  { caption: { contains: q.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      })
    );

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return paged(
      page.map((row) => serializeAsset(row)),
      { per_page: q.limit, next_cursor: nextCursor }
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET ONE — with variants
  // ──────────────────────────────────────────────────────────────────────

  app.get('/v1/media/assets/:id', async (request) => {
    requireRole(request, 'viewer');
    const { id } = PathId.parse(request.params);

    const { asset, variants } = await withRequestTenant(request, async (tx) => {
      const row = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw notFound('MediaAsset', id);
      const vs = await tx.mediaVariant.findMany({
        where: { assetId: id },
        orderBy: [{ format: 'asc' }, { width: 'asc' }],
      });
      return { asset: row, variants: vs };
    });

    return ok(serializeAsset(asset, variants));
  });

  // ──────────────────────────────────────────────────────────────────────
  // PATCH — metadata only
  // ──────────────────────────────────────────────────────────────────────

  app.patch('/v1/media/assets/:id', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    const input = PatchBody.parse(request.body);

    const updated = await withRequestTenant(request, async (tx) => {
      const existing = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('MediaAsset', id);

      const after = await tx.mediaAsset.update({
        where: { id },
        data: {
          ...(input.alt_text !== undefined ? { altText: input.alt_text } : {}),
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.focal_point_x !== undefined ? { focalPointX: input.focal_point_x } : {}),
          ...(input.focal_point_y !== undefined ? { focalPointY: input.focal_point_y } : {}),
        },
      });

      await writeAudit(tx, request, auth, {
        action: 'media.asset.updated',
        entityType: 'media_asset',
        entityId: id,
        before: {
          altText: existing.altText,
          focalPoint: { x: existing.focalPointX, y: existing.focalPointY },
        },
        after: {
          altText: after.altText,
          focalPoint: { x: after.focalPointX, y: after.focalPointY },
        },
      });

      const vs = await tx.mediaVariant.findMany({
        where: { assetId: id },
        orderBy: [{ format: 'asc' }, { width: 'asc' }],
      });
      return { asset: after, variants: vs };
    });

    return ok(serializeAsset(updated.asset, updated.variants));
  });

  // ──────────────────────────────────────────────────────────────────────
  // DELETE — soft delete, refuses when referenced
  // ──────────────────────────────────────────────────────────────────────

  app.delete('/v1/media/assets/:id', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);

    await withRequestTenant(request, async (tx) => {
      const existing = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('MediaAsset', id);

      // Refuse delete-while-referenced — entries that still link to this
      // asset would 404 their images. Caller has to detach first.
      // usage_count is denormalised but reflects the same data the
      // dashboard's "used by" list shows.
      if (existing.usageCount > 0) {
        throw conflict(
          `Asset is still referenced by ${existing.usageCount} entr${existing.usageCount === 1 ? 'y' : 'ies'}.`,
          { usage_count: existing.usageCount }
        );
      }

      await tx.mediaAsset.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(tx, request, auth, {
        action: 'media.asset.deleted',
        entityType: 'media_asset',
        entityId: id,
        before: { status: existing.status, key: existing.key },
      });
    });

    await publish(request.log, 'media.deleted', auth.tenantId, auth.actorId, { assetId: id });

    reply.code(204);
  });
  return Promise.resolve();
};

export default mediaAssetRoutes;
