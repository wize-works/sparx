// The canonical test: two tenants, identical entry slugs, neither can see
// the other's row even when the request id matches.
//
// If this test starts passing for the wrong reason (e.g. an empty list
// because nothing was created), the fixtures will fail their own pre-
// conditions. The "before" assertions in each test guard against silent
// false positives.

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

describe('cross-tenant RLS isolation', () => {
  let app: FastifyInstance;
  let alice: TestTenant;
  let bob: TestTenant;
  let aliceToken: string;
  let bobToken: string;
  let aliceEntryId: string;
  let bobEntryId: string;

  beforeAll(async () => {
    app = await createApp();
    alice = await createTestTenant('owner');
    bob = await createTestTenant('owner');
    aliceToken = signToken(app, alice);
    bobToken = signToken(app, bob);

    // Each tenant creates an entry with the SAME slug ("hello-world") under
    // the same content type. Without RLS this would collide on the
    // (tenant_id, type_key, slug) UNIQUE only inside each tenant — but if
    // the policy were broken, Bob could see Alice's row.
    const aliceRes = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(aliceToken),
      payload: {
        type_key: 'blog_post',
        slug: 'hello-world',
        body: {
          title: 'Alice post',
          excerpt: 'Alice excerpt.',
          body: { type: 'doc', content: [] },
        },
      },
    });
    expect(aliceRes.statusCode).toBe(201);
    aliceEntryId = aliceRes.json().data.id;

    const bobRes = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(bobToken),
      payload: {
        type_key: 'blog_post',
        slug: 'hello-world',
        body: {
          title: 'Bob post',
          excerpt: 'Bob excerpt.',
          body: { type: 'doc', content: [] },
        },
      },
    });
    expect(bobRes.statusCode).toBe(201);
    bobEntryId = bobRes.json().data.id;
  });

  afterAll(async () => {
    await app.close();
    await dropTestTenant(alice.tenantId);
    await dropTestTenant(bob.tenantId);
  });

  it("Alice's list returns exactly her own entries", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/content/entries',
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.map((e: { id: string }) => e.id)).toEqual([aliceEntryId]);
  });

  it("Bob's list returns exactly his own entries", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/content/entries',
      headers: authHeader(bobToken),
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.map((e: { id: string }) => e.id)).toEqual([bobEntryId]);
  });

  it("Bob cannot fetch Alice's entry by id (404 not 200)", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/content/entries/${aliceEntryId}`,
      headers: authHeader(bobToken),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it("Bob cannot PATCH Alice's entry", async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/content/entries/${aliceEntryId}`,
      headers: authHeader(bobToken),
      payload: { body: { title: 'pwned' } },
    });
    expect(res.statusCode).toBe(404);
  });

  it("Bob cannot DELETE Alice's entry", async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/content/entries/${aliceEntryId}`,
      headers: authHeader(bobToken),
    });
    expect(res.statusCode).toBe(404);
  });
});
