// Media upload + asset CRUD lifecycle.
//
// Runs against the LocalStorage backend (GCS_MEDIA_BUCKET unset) so we
// exercise the real two-phase create → PUT → complete flow against an
// actual filesystem without needing a Cloud Storage service account in
// CI. The presign step still returns a fully-formed PUT URL; we just
// follow that URL into api-rest's own /v1/media/_local/* handler.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { withTenant } from '@sparx/db';
import { createApp } from '../../src/app.js';
import { env } from '../../src/env.js';
import { _resetStorageForTest } from '../../src/lib/storage.js';
import {
  type TestTenant,
  authHeader,
  createTestTenant,
  dropTestTenant,
  signToken,
} from '../helpers.js';

describe('media uploads', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    _resetStorageForTest();
    app = await createApp();
    tenant = await createTestTenant('owner');
    token = signToken(app, tenant);
  });

  afterAll(async () => {
    await app.close();
    await dropTestTenant(tenant.tenantId);
    // Clean only this tenant's prefix so we don't blow away any dev-mode
    // assets a developer may have laying around when they run `pnpm test`.
    await fs.rm(resolve(env.MEDIA_LOCAL_DIR, tenant.tenantId), {
      recursive: true,
      force: true,
    });
  });

  it('creates an asset row + presigned PUT URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeader(token),
      payload: {
        filename: 'pixel.png',
        mime_type: 'image/png',
        byte_size: 100,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.asset.status).toBe('uploading');
    expect(body.asset.original_filename).toBe('pixel.png');
    expect(body.upload.method).toBe('PUT');
    expect(body.upload.url).toMatch(/^\/v1\/media\/_local\//);
    expect(body.upload.headers['content-type']).toBe('image/png');
  });

  it('rejects unsupported mime types', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeader(token),
      payload: { filename: 'shady.exe', mime_type: 'application/octet-stream', byte_size: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('round-trips bytes through PUT and serves them on the public GET', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeader(token),
      payload: { filename: 'gradient.webp', mime_type: 'image/webp', byte_size: 4 },
    });
    expect(create.statusCode).toBe(201);
    const { asset, upload } = create.json().data;

    // PUT the bytes to the "presigned" URL.
    const put = await app.inject({
      method: 'PUT',
      url: upload.url,
      headers: { 'content-type': 'image/webp' },
      payload: Buffer.from([0xff, 0xfe, 0xfd, 0xfc]),
    });
    expect(put.statusCode).toBe(204);

    // Complete — local mode flips status to 'ready' immediately.
    const complete = await app.inject({
      method: 'POST',
      url: `/v1/media/uploads/${asset.id}/complete`,
      headers: authHeader(token),
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().data.status).toBe('ready');

    // Public GET serves the original bytes.
    const publicRes = await app.inject({
      method: 'GET',
      url: `/v1/public/media/file/${encodeURIComponent(asset.key as string)}`,
    });
    expect(publicRes.statusCode).toBe(200);
    expect(publicRes.rawPayload.length).toBe(4);
    expect(publicRes.rawPayload.equals(Buffer.from([0xff, 0xfe, 0xfd, 0xfc]))).toBe(true);
  });

  it('PATCH updates focal point + alt text without touching variants', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeader(token),
      payload: { filename: 'hero.jpg', mime_type: 'image/jpeg', byte_size: 8 },
    });
    const assetId = create.json().data.asset.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/media/assets/${assetId}`,
      headers: authHeader(token),
      payload: { alt_text: 'A hero image.', focal_point_x: 0.7, focal_point_y: 0.3 },
    });
    expect(patch.statusCode).toBe(200);
    const data = patch.json().data;
    expect(data.alt_text).toBe('A hero image.');
    expect(data.focal_point).toEqual({ x: 0.7, y: 0.3 });
  });

  it('refuses delete when usage_count > 0', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers: authHeader(token),
      payload: { filename: 'used.jpg', mime_type: 'image/jpeg', byte_size: 8 },
    });
    const assetId = create.json().data.asset.id;

    // Bump usage_count via direct SQL — the references-rebuild path is
    // covered by entries-lifecycle.test.ts; here we just need a non-zero
    // count to hit the conflict branch.
    await withTenant({ tenantId: tenant.tenantId }, async (tx) => {
      await tx.mediaAsset.update({ where: { id: assetId }, data: { usageCount: 2 } });
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/media/assets/${assetId}`,
      headers: authHeader(token),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.details.usage_count).toBe(2);
  });

  it('cross-tenant RLS: tenant A cannot read tenant B asset', async () => {
    const tenantB = await createTestTenant('owner');
    const tokenB = signToken(app, tenantB);
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/v1/media/uploads',
        headers: authHeader(tokenB),
        payload: { filename: 'secret.png', mime_type: 'image/png', byte_size: 4 },
      });
      const assetId = create.json().data.asset.id;

      const probeFromA = await app.inject({
        method: 'GET',
        url: `/v1/media/assets/${assetId}`,
        headers: authHeader(token),
      });
      expect(probeFromA.statusCode).toBe(404);
    } finally {
      await dropTestTenant(tenantB.tenantId);
    }
  });
});
