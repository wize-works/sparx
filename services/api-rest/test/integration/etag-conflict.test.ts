// Optimistic-concurrency guard for entry PATCH.
//
// Two clients edit the same entry; the first wins; the second's PATCH
// with the stale ETag must 412. Then the second client refetches, sends
// the fresh ETag, and succeeds.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app.js';
import {
  type TestTenant,
  authHeader,
  createTestTenant,
  dropTestTenant,
  signToken,
} from '../helpers.js';

describe('entry PATCH ETag / If-Match', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;
  let entryId: string;
  let etag: string;

  beforeAll(async () => {
    app = await createApp();
    tenant = await createTestTenant('owner');
    token = signToken(app, tenant);

    const create = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(token),
      payload: {
        type_key: 'page',
        slug: 'etag-test',
        body: { title: 'Initial', body: { type: 'doc', content: [] } },
      },
    });
    expect(create.statusCode).toBe(201);
    entryId = create.json().data.id;
    etag = create.headers.etag!;
    expect(etag).toBeTruthy();
  });

  afterAll(async () => {
    await dropTestTenant(tenant.tenantId);
    await app.close();
  });

  it('GET returns an ETag header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/content/entries/${entryId}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBeTruthy();
  });

  it('PATCH with matching If-Match succeeds and returns a fresh ETag', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/content/entries/${entryId}`,
      headers: { ...authHeader(token), 'if-match': etag },
      payload: { body: { title: 'Updated', body: { type: 'doc', content: [] } } },
    });
    expect(res.statusCode).toBe(200);
    const newEtag = res.headers.etag!;
    expect(newEtag).toBeTruthy();
    expect(newEtag).not.toBe(etag);
    etag = newEtag;
  });

  it('PATCH with stale If-Match returns 412 PRECONDITION_FAILED', async () => {
    // Simulate "stale" by sending the prior tag — which we already moved past
    // in the previous test. Use a fabricated old tag with an earlier ms.
    const staleEtag = etag.replace(/\.[a-z0-9]+"$/, '.0"');
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/content/entries/${entryId}`,
      headers: { ...authHeader(token), 'if-match': staleEtag },
      payload: { body: { title: 'Should not land', body: { type: 'doc', content: [] } } },
    });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.code).toBe('PRECONDITION_FAILED');

    // Verify the body wasn't actually updated.
    const after = await app.inject({
      method: 'GET',
      url: `/v1/content/entries/${entryId}`,
      headers: authHeader(token),
    });
    expect(after.json().data.body.title).toBe('Updated');
  });

  it('PATCH without If-Match still works (header is optional)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/content/entries/${entryId}`,
      headers: authHeader(token),
      payload: { body: { title: 'Header-less', body: { type: 'doc', content: [] } } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('If-Match: * always matches (RFC 7232 wildcard)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/content/entries/${entryId}`,
      headers: { ...authHeader(token), 'if-match': '*' },
      payload: { body: { title: 'Wildcard', body: { type: 'doc', content: [] } } },
    });
    expect(res.statusCode).toBe(200);
  });
});
