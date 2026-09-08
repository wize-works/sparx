// Unit tests for the PROXIED upload path: the signed upload-token primitive and
// createImageUpload (which mints one + returns the side-channel uploadUrl). The
// token security properties (signature, typ-scope, expiry, tamper) are the crux
// — this endpoint is PUBLIC, so the token is the only auth. createImageUpload's
// DB writes are asserted against the same @wizeworks/db mock the other suite uses.

import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { created, findFirstResult, updateCalls, publishEventMock, productPhotos } = vi.hoisted(
  () => ({
    created: { rows: [] as { id: string; data: Record<string, unknown> }[] },
    findFirstResult: { value: null as Record<string, unknown> | null },
    updateCalls: { calls: [] as { where: unknown; data: Record<string, unknown> }[] },
    publishEventMock: vi.fn(),
    // How many product photographs reference the asset under test. The delete
    // guard COUNTS references now rather than reading `usage_count`, a column
    // nothing has ever written (issue 381) — so a test that only set that column
    // was asserting against a number the real code could never see.
    productPhotos: { count: 0 },
  })
);

vi.mock('@wizeworks/db', () => {
  const tx = {
    mediaAsset: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const id = `asset-${created.rows.length + 1}`;
        created.rows.push({ id, data });
        return { id, ...data };
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updateCalls.calls.push({ where, data });
        const row = created.rows.find((r) => r.id === where.id);
        if (row) Object.assign(row.data, data);
        return { id: where.id, ...(row?.data ?? {}) };
      }),
      findFirst: vi.fn(() => findFirstResult.value),
    },
    // The seven sources `countAssetUsage` groups over. Only product photos vary
    // here; the rest answer empty, which is what an unreferenced asset looks like.
    variantImage: {
      groupBy: () =>
        productPhotos.count > 0
          ? [{ mediaAssetId: 'asset-1', _count: { _all: productPhotos.count } }]
          : [],
    },
    contentReference: { groupBy: () => [] },
    customer: { groupBy: () => [] },
    customerDocument: { groupBy: () => [] },
    author: { groupBy: () => [] },
    staffDocument: { groupBy: () => [] },
    financeExpenseAttachment: { groupBy: () => [] },
  };
  return { withTenant: (_c: unknown, fn: (t: typeof tx) => unknown) => fn(tx) };
});

vi.mock('@wizeworks/events', () => ({
  createPublisher: () => ({ publish: vi.fn() }),
  publishEvent: (...args: unknown[]) => {
    publishEventMock(...args);
    return Promise.resolve();
  },
}));

import { mintUploadToken, verifyUploadToken, type UploadTokenClaims } from '../src/upload-token';
import {
  MAX_PROXIED_UPLOAD_BYTES,
  MediaValidationError,
  createImageUpload,
  deleteMediaAsset,
} from '../src/asset-service';
import { _resetStorageEnvForTest } from '../src/env';

const SECRET = 'test-secret-test-secret-test-secret-01';
const CTX = { tenantId: 'tenant-1', actorId: 'user-1', tenantSlug: 'acme' };

const CLAIMS: UploadTokenClaims = {
  aid: 'asset-1',
  tid: 'tenant-1',
  key: 'tenant-1/originals/asset-1/hero.jpg',
  mime: 'image/jpeg',
  max: 40_000,
  exp: 4_102_444_800, // year 2100
};

beforeEach(() => {
  created.rows = [];
  findFirstResult.value = null;
  updateCalls.calls = [];
  productPhotos.count = 0;
  publishEventMock.mockClear();
  process.env.SPARX_INTERNAL_JWT_SECRET = SECRET;
  process.env.MEDIA_PUBLIC_URL = 'https://media.test';
  _resetStorageEnvForTest();
});

describe('upload-token', () => {
  it('round-trips: a minted token verifies to the same claims', () => {
    const token = mintUploadToken(CLAIMS, SECRET);
    const res = verifyUploadToken(token, { secret: SECRET });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.claims).toEqual(CLAIMS);
  });

  it('rejects a tampered signature (constant-time)', () => {
    const token = mintUploadToken(CLAIMS, SECRET);
    const bad = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    const res = verifyUploadToken(bad, { secret: SECRET });
    expect(res).toMatchObject({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const token = mintUploadToken(CLAIMS, SECRET);
    const [, sig] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ typ: 'media-upload', ...CLAIMS, max: 99_000_000 })
    ).toString('base64url');
    const res = verifyUploadToken(`${forgedBody}.${sig}`, { secret: SECRET });
    expect(res).toMatchObject({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintUploadToken(CLAIMS, 'another-secret-another-secret-xyz-99');
    const res = verifyUploadToken(token, { secret: SECRET });
    expect(res).toMatchObject({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a validly-signed token with the wrong typ (not a session JWT)', () => {
    // Correctly signed with SECRET, but typ != 'media-upload'.
    const body = Buffer.from(JSON.stringify({ typ: 'session', ...CLAIMS })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(body).digest().toString('base64url');
    const res = verifyUploadToken(`${body}.${sig}`, { secret: SECRET });
    expect(res).toMatchObject({ ok: false, reason: 'wrong-type' });
  });

  it('rejects an expired token', () => {
    const token = mintUploadToken({ ...CLAIMS, exp: 1000 }, SECRET);
    const res = verifyUploadToken(token, { secret: SECRET, now: 2000 });
    expect(res).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('rejects malformed tokens', () => {
    for (const t of ['', 'no-dot', '.', 'x.', '.y', 'not-base64!.sig']) {
      expect(verifyUploadToken(t, { secret: SECRET }).ok).toBe(false);
    }
  });
});

describe('createImageUpload', () => {
  it.each([
    { mimeType: 'application/pdf', byteSize: 100, why: 'non-image mime' },
    { mimeType: 'image/tiff', byteSize: 100, why: 'unsupported image mime' },
    { mimeType: 'image/png', byteSize: 0, why: 'zero byteSize' },
    { mimeType: 'image/png', byteSize: MAX_PROXIED_UPLOAD_BYTES + 1, why: 'over the cap' },
  ])('rejects $why before creating a row', async ({ mimeType, byteSize }) => {
    await expect(
      createImageUpload(CTX, { filename: 'a.png', mimeType, byteSize })
    ).rejects.toBeInstanceOf(MediaValidationError);
    expect(created.rows).toHaveLength(0);
  });

  it('creates an uploading asset and returns a verifiable, bound upload token', async () => {
    const res = await createImageUpload(CTX, {
      filename: 'shot.jpg',
      mimeType: 'image/jpeg',
      byteSize: 40_000,
      alt: 'App screenshot',
      width: 1100,
      height: 688,
    });

    // Row created status='uploading' with the finalised originals key.
    const row = created.rows[0]!.data;
    expect(row.status).toBe('uploading');
    expect(row.key).toBe('tenant-1/originals/asset-1/shot.jpg');
    expect(row.altText).toBe('App screenshot');

    // uploadUrl points at the public proxied endpoint on MEDIA_PUBLIC_URL.
    expect(
      res.uploadUrl.startsWith('https://media.test/v1/public/media/upload/asset-1?token=')
    ).toBe(true);
    expect(res.method).toBe('PUT');
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.maxBytes).toBe(40_000);
    expect(res.imageUrl).toBe('https://media.test/v1/public/media/asset-1?tenant=acme');

    // The embedded token verifies and is bound to THIS asset/tenant/key/mime/max.
    const token = decodeURIComponent(new URL(res.uploadUrl).searchParams.get('token')!);
    const verified = verifyUploadToken(token, { secret: SECRET });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims).toMatchObject({
        aid: 'asset-1',
        tid: 'tenant-1',
        key: 'tenant-1/originals/asset-1/shot.jpg',
        mime: 'image/jpeg',
        max: 40_000,
      });
      expect(verified.claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });
});

describe('deleteMediaAsset', () => {
  it('refuses a missing (or already-deleted) asset — no update, no event', async () => {
    findFirstResult.value = null;
    await expect(
      deleteMediaAsset(CTX, '00000000-0000-4000-8000-000000000000')
    ).rejects.toBeInstanceOf(MediaValidationError);
    expect(updateCalls.calls).toHaveLength(0);
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it('refuses an asset a product photograph still uses — no update, no event', async () => {
    findFirstResult.value = { id: 'asset-1' };
    productPhotos.count = 3;
    await expect(deleteMediaAsset(CTX, 'asset-1')).rejects.toBeInstanceOf(MediaValidationError);
    expect(updateCalls.calls).toHaveLength(0);
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it('says WHICH kind is using it, so the owner knows where to go', async () => {
    findFirstResult.value = { id: 'asset-1' };
    productPhotos.count = 2;
    await expect(deleteMediaAsset(CTX, 'asset-1')).rejects.toThrow(/2 product photos/);
  });

  it('refuses on a stale usage_count of zero when a reference really exists', async () => {
    // The exact shape of the defect: the column says nothing is using it and
    // something is. Counting is what makes the guard fire.
    findFirstResult.value = { id: 'asset-1', usageCount: 0 };
    productPhotos.count = 1;
    await expect(deleteMediaAsset(CTX, 'asset-1')).rejects.toBeInstanceOf(MediaValidationError);
    expect(updateCalls.calls).toHaveLength(0);
  });

  it('soft-deletes (sets deletedAt) and fans out media.deleted', async () => {
    findFirstResult.value = { id: 'asset-1' };
    productPhotos.count = 0;
    const res = await deleteMediaAsset(CTX, 'asset-1');
    expect(res).toEqual({ assetId: 'asset-1', status: 'deleted' });

    expect(updateCalls.calls).toHaveLength(1);
    expect(updateCalls.calls[0]!.data.deletedAt).toBeInstanceOf(Date);

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    const args = publishEventMock.mock.calls[0]!;
    expect(args[1]).toBe('media.deleted');
    expect(args[4]).toEqual({ assetId: 'asset-1' });
  });
});
