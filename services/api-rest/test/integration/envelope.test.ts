// Response envelope conformance — every status code maps to the canonical
// `{ success, ... }` shape from docs/06-api-specification.md §3.

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

describe('response envelope', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    app = await createApp();
    tenant = await createTestTenant('owner');
    token = signToken(app, tenant);
  });

  afterAll(async () => {
    await app.close();
    await dropTestTenant(tenant.tenantId);
  });

  it('success: 200 returns { success: true, data, meta? }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/content/types',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Built-ins are visible to every tenant via the platform-tenant RLS
    // exception. Exactly six were seeded by 20260528100100.
    expect(body.data.length).toBeGreaterThanOrEqual(6);
  });

  it('401: missing token returns the error envelope (not Fastify default)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/content/types',
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.request_id).toMatch(/^req_/);
  });

  it('404: unknown route returns the error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/no-such-thing' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toMatch(/^req_/);
  });

  it('422: validation errors carry details + map field paths', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(token),
      payload: {
        type_key: 'blog_post',
        // body.title is required by the blog_post schema; omit to trigger 422.
        body: { excerpt: 'no title.', body: { type: 'doc', content: [] } },
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('x-request-id is propagated on every response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/content/types',
      headers: { ...authHeader(token), 'x-request-id': 'req_envelope_propagation' },
    });
    expect(res.headers['x-request-id']).toBe('req_envelope_propagation');
  });
});
