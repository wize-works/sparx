// Preview-token lifecycle.
//
//   1. Mint a token for a draft entry → token + expiresAt + jti returned.
//   2. Public GET without token → published-only (entry is draft, so 404).
//   3. Public GET with token via Authorization: Preview <jwt> → draft body.
//   4. Public GET with token via ?preview=<jwt> query param → also works.
//   5. Token issued for one entry doesn't unlock a different draft entry.
//   6. Revoking via DELETE makes subsequent reads 401.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@sparx/db';
import { createApp } from '../../src/app.js';
import {
  type TestTenant,
  authHeader,
  createTestTenant,
  dropTestTenant,
  signToken,
} from '../helpers.js';

describe('preview tokens', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;
  let entryAId: string;
  let entryBId: string;
  let previewJwt: string;
  let previewJti: string;
  let tenantSlug: string;

  beforeAll(async () => {
    app = await createApp();
    tenant = await createTestTenant('editor');
    token = signToken(app, tenant, 'editor');

    const t = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.tenantId },
      select: { slug: true },
    });
    tenantSlug = t.slug;

    const a = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(token),
      payload: {
        type_key: 'page',
        slug: 'preview-target',
        body: { title: 'Draft A', body: { type: 'doc', content: [] } },
      },
    });
    expect(a.statusCode).toBe(201);
    entryAId = a.json().data.id;

    const b = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(token),
      payload: {
        type_key: 'page',
        slug: 'preview-other',
        body: { title: 'Draft B', body: { type: 'doc', content: [] } },
      },
    });
    expect(b.statusCode).toBe(201);
    entryBId = b.json().data.id;

    const mint = await app.inject({
      method: 'POST',
      url: `/v1/content/entries/${entryAId}/preview-tokens`,
      headers: authHeader(token),
    });
    expect(mint.statusCode).toBe(200);
    previewJwt = mint.json().data.token;
    previewJti = mint.json().data.jti;
    expect(previewJwt).toBeTruthy();
    expect(previewJti).toBeTruthy();
  });

  afterAll(async () => {
    await dropTestTenant(tenant.tenantId);
    await app.close();
  });

  it('public GET without token returns 404 for a draft entry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/content/entries/by-slug?tenant=${tenantSlug}&type=page&slug=preview-target`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('public GET with Authorization: Preview <jwt> returns the draft', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/content/entries/by-slug?tenant=${tenantSlug}&type=page&slug=preview-target`,
      headers: { authorization: `Preview ${previewJwt}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.body.title).toBe('Draft A');
    expect(res.json().data.status).toBe('draft');
  });

  it('public GET with ?preview=<jwt> query string also works', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/content/entries/by-slug?tenant=${tenantSlug}&type=page&slug=preview-target&preview=${encodeURIComponent(previewJwt)}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.body.title).toBe('Draft A');
  });

  it('token for entry A does NOT unlock entry B', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/content/entries/by-slug?tenant=${tenantSlug}&type=page&slug=preview-other`,
      headers: { authorization: `Preview ${previewJwt}` },
    });
    expect(res.statusCode).toBe(404);
    void entryBId; // entryB is what slug=preview-other resolves to internally
  });

  it('revoked token returns 401', async () => {
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/v1/content/entries/${entryAId}/preview-tokens/${previewJti}`,
      headers: authHeader(token),
    });
    expect(revoke.statusCode).toBe(204);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/public/content/entries/by-slug?tenant=${tenantSlug}&type=page&slug=preview-target`,
      headers: { authorization: `Preview ${previewJwt}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_PREVIEW_TOKEN');
  });
});
