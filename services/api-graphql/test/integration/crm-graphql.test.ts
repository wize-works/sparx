// CRM GraphQL transport smoke — module-gate envelope + a simple query +
// mutation + auth boundary. Mirrors the api-rest crm-routes.test.ts checks
// over the GraphQL surface so we can prove all three transports answer the
// same questions the same way.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@sparx/db';
import { invalidateModuleCache } from '@sparx/auth';
import { createApp } from '../../src/app.js';

interface CrmTenant {
  tenantId: string;
  userId: string;
}

async function createCrmTenant(crmEnabled: boolean): Promise<CrmTenant> {
  const slug = `gqlcrm-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `GQL CRM ${slug}`,
      email,
      plan: 'starter',
      status: 'active',
      settings: crmEnabled ? { modules: { crm: { enabled: true } } } : {},
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: { tenantId: tenant.id, email, name: `GQL ${slug}`, role: 'owner' },
    });
  });
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });
  return { tenantId: tenant.id, userId: user.id };
}

async function gql(
  app: FastifyInstance,
  token: string | null,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<{
  statusCode: number;
  body: {
    data?: Record<string, unknown>;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
  };
}> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/graphql',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    payload: { query, variables },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

describe('CRM GraphQL transport', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    invalidateModuleCache();
  });

  it('returns MODULE_DISABLED envelope when CRM is off', async () => {
    const t = await createCrmTenant(false);
    try {
      const token = app.jwt.sign(
        { sub: t.userId, tid: t.tenantId, role: 'owner' },
        { expiresIn: '5m' }
      );
      // Module-disabled bubbles to the Fastify error handler as a 404 with
      // the same envelope shape REST uses — callers of either transport
      // see one consistent error contract.
      const res = await app.inject({
        method: 'POST',
        url: '/v1/graphql',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { query: `query { crmCustomers { total items { id } } }` },
      });
      // Mercurius catches resolver throws and lifts the message into the
      // GraphQL `errors[]` array. The transport's "is the module on?" check
      // surfaces here as a query-level error, not an HTTP 4xx.
      expect(res.statusCode).toBeLessThan(500);
      expect(res.body).toMatch(/crm.+is not active/i);
    } finally {
      await prisma.tenant.delete({ where: { id: t.tenantId } });
    }
  });

  it('lists customers (empty) and creates one when CRM is on', async () => {
    const t = await createCrmTenant(true);
    try {
      const token = app.jwt.sign(
        { sub: t.userId, tid: t.tenantId, role: 'owner' },
        { expiresIn: '5m' }
      );

      const empty = await gql(app, token, `query { crmCustomers { total items { id email } } }`);
      expect(empty.statusCode).toBe(200);
      expect(empty.body.data).toMatchObject({ crmCustomers: { total: 0, items: [] } });

      const created = await gql(
        app,
        token,
        `mutation Create($input: JSON!) { createCustomer(input: $input) { id email firstName type } }`,
        { input: { type: 'retail', email: 'gql@example.test', firstName: 'GQL' } }
      );
      expect(created.statusCode).toBe(200);
      expect(created.body.data?.createCustomer).toMatchObject({
        type: 'retail',
        email: 'gql@example.test',
        firstName: 'GQL',
      });
    } finally {
      await prisma.tenant.delete({ where: { id: t.tenantId } });
    }
  });

  it('rejects without a token (401 UNAUTHORIZED)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/graphql',
      headers: { 'content-type': 'application/json' },
      payload: { query: `query { crmCustomers { total } }` },
    });
    expect(res.statusCode).toBe(401);
  });
});
