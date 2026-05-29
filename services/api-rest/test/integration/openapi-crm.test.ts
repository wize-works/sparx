// CRM routes must show up in the OpenAPI spec served at /v1/openapi.json.
//
// The spec is what packages/api-client and external consumers generate
// typed SDKs from — any route missing here is silently inaccessible to
// every typed caller. We assert path coverage rather than full schema
// fidelity (we know Zod-bodied routes are documented as `object` until
// fastify-type-provider-zod lands; that's tracked in plugins/openapi.ts).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app.js';

const REQUIRED_CRM_PATHS = [
  // customers (already-covered group, kept here as a smoke for path emission)
  '/v1/crm/customers',
  '/v1/crm/customers/{id}',
  // the 7 remaining groups
  '/v1/crm/pipelines',
  '/v1/crm/pipelines/{id}',
  '/v1/crm/pipelines/{id}/stages',
  '/v1/crm/deals',
  '/v1/crm/deals/{id}',
  '/v1/crm/b2b-accounts',
  '/v1/crm/b2b-accounts/{id}',
  '/v1/crm/activities',
  '/v1/crm/tasks',
  '/v1/crm/tasks/{id}',
  '/v1/crm/segments',
  '/v1/crm/segments/{id}',
  '/v1/crm/reports/snapshot',
  '/v1/crm/reports/pipeline-funnel',
  '/v1/crm/reports/win-loss',
  '/v1/crm/reports/acquisition',
];

describe('OpenAPI — CRM coverage', () => {
  let app: FastifyInstance;
  let spec: { paths: Record<string, unknown>; tags?: { name: string }[] };

  beforeAll(async () => {
    app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    spec = res.json();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers the `crm` tag in the spec', () => {
    const names = (spec.tags ?? []).map((t) => t.name);
    expect(names).toContain('crm');
  });

  it.each(REQUIRED_CRM_PATHS)('emits %s in spec.paths', (path) => {
    expect(spec.paths[path], `missing path: ${path}`).toBeDefined();
  });
});
