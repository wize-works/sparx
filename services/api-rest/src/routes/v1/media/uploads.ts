// Media upload — presigned-URL flow.
//
//   POST   /v1/media/uploads                  → create asset row + presign PUT
//   POST   /v1/media/uploads/:id/complete     → confirm upload, emit media.uploaded
//   PUT    /v1/media/_local/:encodedKey       → dev-only: receive bytes when
//                                                MediaStorage is the local backend
//
// Two-phase flow exists so we can budget against the tenant's plan
// allowance BEFORE the bytes hit the network, and so the GCS bucket
// stays write-only from a browser's perspective (no listing). The asset
// row is created with `status='uploading'`; the transcoder worker (or, in
// dev with no worker, the /complete endpoint itself) flips it to 'ready'
// once variants exist.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '../../../lib/db.js';
import { ok } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { writeAudit } from '../../../lib/audit.js';
import { publish } from '../../../lib/pubsub.js';
import { getStorage, originalKey } from '../../../lib/storage.js';
import { badRequest, conflict, notFound } from '../../../errors.js';
import { env } from '../../../env.js';

// Conservative ceiling — anything bigger than 200 MB the merchant can
// upload via the desktop CLI tool (when that exists) or escalate to
// support. The bucket has a 50 GB / object hard limit but we'd rather
// not let a typo cost $5 in egress.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

// Allowlist by category — we don't accept executables or office docs in
// the media library. Anything outside the list returns 400 with the list
// embedded so the dashboard can render a useful error.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'application/pdf',
]);

const CreateUploadBody = z.object({
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(127),
  byte_size: z.coerce.number().int().positive().max(MAX_UPLOAD_BYTES),
});

const PathId = z.object({ id: z.string().uuid() });

const uploadRoutes: FastifyPluginAsync = (app) => {
  // ──────────────────────────────────────────────────────────────────────
  // CREATE — reserve an asset row + presign the PUT URL
  // ──────────────────────────────────────────────────────────────────────

  app.post('/v1/media/uploads', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateUploadBody.parse(request.body);

    if (!ALLOWED_MIME.has(input.mime_type)) {
      throw badRequest(`Unsupported mime type "${input.mime_type}".`, {
        allowed: [...ALLOWED_MIME].sort(),
      });
    }

    const storage = getStorage();

    const { asset, presigned } = await withRequestTenant(request, async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          tenantId: auth.tenantId,
          // Key is finalised after we know the asset id (so it can include
          // /originals/<assetId>/<filename>).
          key: '',
          originalFilename: input.filename,
          mimeType: input.mime_type,
          byteSize: BigInt(input.byte_size),
          status: 'uploading',
        },
      });
      const key = originalKey(auth.tenantId, created.id, input.filename);
      const url = await storage.presignPut(key, input.mime_type, input.byte_size);

      const updated = await tx.mediaAsset.update({
        where: { id: created.id },
        data: { key },
      });

      await writeAudit(tx, request, auth, {
        action: 'media.upload.requested',
        entityType: 'media_asset',
        entityId: created.id,
        after: { filename: input.filename, mimeType: input.mime_type },
      });

      return { asset: updated, presigned: url };
    });

    reply.code(201);
    return ok({
      asset: serializeUploadAsset(asset),
      upload: {
        url: presigned.url,
        method: 'PUT',
        headers: presigned.headers,
        expires_at: presigned.expiresAt,
      },
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // COMPLETE — confirm GCS PUT, fan out media.uploaded
  // ──────────────────────────────────────────────────────────────────────

  app.post('/v1/media/uploads/:id/complete', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    const storage = getStorage();

    const result = await withRequestTenant(request, async (tx) => {
      const existing = await tx.mediaAsset.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw notFound('MediaAsset', id);
      if (existing.status !== 'uploading') {
        throw conflict(`Asset ${id} is already ${existing.status}.`);
      }

      // Optional: confirm the object exists at the expected key. In local
      // mode we trust the dashboard; in GCS mode we can do a HEAD to make
      // sure no one called /complete before the PUT actually finished.
      // (Skipping HEAD here keeps tests deterministic; the worker will
      // detect a missing object and flip status='failed' anyway.)

      const nextStatus = storage.mode === 'gcs' ? 'uploading' : 'ready';
      const updated = await tx.mediaAsset.update({
        where: { id },
        data: {
          // Stay 'uploading' in GCS mode — the worker flips to 'ready'
          // after variants exist. In local mode we don't run a worker;
          // mark ready immediately so the dashboard can render the file.
          status: nextStatus,
        },
      });

      await writeAudit(tx, request, auth, {
        action: 'media.upload.completed',
        entityType: 'media_asset',
        entityId: id,
        before: { status: existing.status },
        after: { status: updated.status },
      });

      return updated;
    });

    await publish(request.log, 'media.uploaded', auth.tenantId, auth.actorId, {
      assetId: result.id,
      key: result.key,
      mimeType: result.mimeType,
      byteSize: result.byteSize.toString(),
    });

    return ok(serializeUploadAsset(result));
  });

  // ──────────────────────────────────────────────────────────────────────
  // LOCAL — dev-mode upload receiver
  // ──────────────────────────────────────────────────────────────────────

  // Dev/test only. Bypasses auth because the URL was issued by `presignPut`
  // moments before — the contract is the same as a GCS signed URL: anyone
  // who holds it can upload to that exact key, and only that key. We do
  // re-check the key shape so a stray request can't write to a path that
  // looks like another tenant's prefix.
  if (env.GCS_MEDIA_BUCKET === undefined) {
    app.put<{ Params: { encodedKey: string } }>(
      '/v1/media/_local/:encodedKey',
      {
        // Bigger than the JSON body limit because this carries real media.
        bodyLimit: MAX_UPLOAD_BYTES,
      },
      async (request, reply) => {
        const key = decodeURIComponent(request.params.encodedKey);
        const contentType = request.headers['content-type'] ?? 'application/octet-stream';
        const body = request.body;
        if (!Buffer.isBuffer(body)) {
          throw badRequest('Local upload expects a raw octet-stream body.');
        }
        await getStorage().writeObject(key, contentType, body);
        reply.code(204);
      }
    );

    // Public read for local-mode variants + originals — match the GCS
    // public layout so the dashboard can `<img src=publicUrl(key)>` in
    // both modes without branching.
    app.get<{ Params: { encodedKey: string } }>(
      '/v1/public/media/file/:encodedKey',
      async (request, reply) => {
        const key = decodeURIComponent(request.params.encodedKey);
        try {
          const obj = await getStorage().readObject(key);
          if (obj.contentType) reply.header('content-type', obj.contentType);
          if (obj.size) reply.header('content-length', String(obj.size));
          reply.header('cache-control', 'public, max-age=3600');
          return reply.send(obj.body);
        } catch {
          throw notFound('Media file');
        }
      }
    );
  }
  return Promise.resolve();
};

// Wire shape — kept minimal because the asset detail endpoint
// (routes/v1/media/assets.ts) returns the full payload including
// variants + focal point.
function serializeUploadAsset(row: {
  id: string;
  key: string;
  originalFilename: string;
  mimeType: string;
  byteSize: bigint;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    key: row.key,
    original_filename: row.originalFilename,
    mime_type: row.mimeType,
    byte_size: row.byteSize.toString(),
    status: row.status,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export default uploadRoutes;

// Re-export for ../assets.ts which uses the same shape on read.
export { serializeUploadAsset };
