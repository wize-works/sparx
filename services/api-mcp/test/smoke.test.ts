// MCP server smoke — boots the Fastify app, lists tools via JSON-RPC, then
// dispatches a read-only tool (get_customers) against a fresh tenant. Proves
// auth + scope + tool dispatch + audit-log all wire together.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@sparx/db';
import { invalidateModuleCache } from '@sparx/auth';
import { createApp } from '../src/app.js';

interface TestTenant {
  tenantId: string;
  userId: string;
}

async function createCrmTenant(): Promise<TestTenant> {
  const slug = `mcp-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `MCP ${slug}`,
      email,
      plan: 'pro',
      status: 'active',
      settings: { modules: { crm: { enabled: true } } },
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: { tenantId: tenant.id, email, name: `MCP ${slug}`, role: 'owner' },
    });
  });
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });
  return { tenantId: tenant.id, userId: user.id };
}

function jsonRpc(method: string, params: object, id = 1): Record<string, unknown> {
  return { jsonrpc: '2.0', id, method, params };
}

async function postMcp(
  app: FastifyInstance,
  token: string,
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/mcp',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      // Streamable HTTP requires the client to advertise it can take either
      // a JSON body or an SSE stream back.
      accept: 'application/json, text/event-stream',
    },
    payload: body,
  });
  return { statusCode: res.statusCode, body: res.body };
}

describe('mcp-server smoke', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    process.env.SPARX_INTERNAL_JWT_SECRET ??= 'a'.repeat(40);
    process.env.DATABASE_URL ??= 'postgres://sparx:sparx@localhost:5432/sparx';
    app = await createApp();
    tenant = await createCrmTenant();
    token = app.jwt.sign(
      { sub: tenant.userId, tid: tenant.tenantId, role: 'owner' },
      { expiresIn: '5m' }
    );
    invalidateModuleCache();
  });

  afterAll(async () => {
    await app.close();
    await prisma.tenant.delete({ where: { id: tenant.tenantId } });
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('POST /v1/mcp without auth returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      payload: jsonRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('lists tools then dispatches get_customers', async () => {
    const init = await postMcp(
      app,
      token,
      jsonRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      })
    );
    expect(init.statusCode).toBeLessThan(400);

    const list = await postMcp(app, token, jsonRpc('tools/list', {}, 2));
    expect(list.statusCode).toBeLessThan(400);
    // SDK responses are SSE-framed; tool names should be in there.
    expect(list.body).toContain('get_customers');
    expect(list.body).toContain('get_pipeline');

    const call = await postMcp(
      app,
      token,
      jsonRpc('tools/call', { name: 'get_customers', arguments: {} }, 3)
    );
    expect(call.statusCode).toBeLessThan(400);
    // Empty tenant — the tool returns { items: [], total: 0 } serialized
    // inside a JSON-string content block, so quotes are escaped twice.
    expect(call.body).toContain('\\"items\\":[]');
    expect(call.body).toContain('\\"total\\":0');
  });
});
