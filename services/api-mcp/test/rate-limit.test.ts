// MCP rate-limit policy — docs/07 §7. Three things to prove:
//   1. Starter plan can't use MCP at all (429, scope=plan_not_eligible).
//   2. Pro plan's per-minute cap fires (60/min) and includes retry_after.
//   3. The write-bucket fires independently (10 writes/min), even when the
//      per-minute and per-day caps are nowhere near tripped.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@sparx/db';
import { invalidateModuleCache } from '@sparx/auth';
import { createApp } from '../src/app.js';
import { __resetRateLimitState } from '../src/rate-limit.js';

interface RlTenant {
  tenantId: string;
  userId: string;
  token: string;
}

async function createTenant(app: FastifyInstance, plan: 'starter' | 'pro'): Promise<RlTenant> {
  const slug = `rl-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `RL ${slug}`,
      email,
      plan,
      status: 'active',
      settings: { modules: { crm: { enabled: true } } },
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: { tenantId: tenant.id, email, name: `RL ${slug}`, role: 'owner' },
    });
  });
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });
  const token = app.jwt.sign({ sub: user.id, tid: tenant.id, role: 'owner' }, { expiresIn: '5m' });
  return { tenantId: tenant.id, userId: user.id, token };
}

async function postMcp(
  app: FastifyInstance,
  token: string,
  body: object
): Promise<{ statusCode: number; body: string; headers: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/mcp',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    payload: body,
  });
  return { statusCode: res.statusCode, body: res.body, headers: res.headers };
}

function rpc(method: string, params: object, id: number): object {
  return { jsonrpc: '2.0', id, method, params };
}

describe('mcp rate limiting', () => {
  let app: FastifyInstance;
  const tenants: string[] = [];

  beforeAll(async () => {
    process.env.SPARX_INTERNAL_JWT_SECRET ??= 'a'.repeat(40);
    app = await createApp();
    invalidateModuleCache();
  });

  afterAll(async () => {
    await app.close();
    for (const id of tenants) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  });

  beforeEach(() => {
    __resetRateLimitState();
    invalidateModuleCache();
  });

  it('rejects starter plan with plan_not_eligible (429)', async () => {
    const t = await createTenant(app, 'starter');
    tenants.push(t.tenantId);
    const res = await postMcp(
      app,
      t.token,
      rpc(
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
        1
      )
    );
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details.scope).toBe('plan_not_eligible');
  });

  it('enforces the 60/min cap on pro and surfaces retry_after_seconds', async () => {
    const t = await createTenant(app, 'pro');
    tenants.push(t.tenantId);

    // Burn the 60 budget on cheap initialize calls.
    for (let i = 0; i < 60; i++) {
      const res = await postMcp(
        app,
        t.token,
        rpc(
          'initialize',
          {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 't', version: '1' },
          },
          i + 1
        )
      );
      // Pre-cap calls should not be 429.
      expect(res.statusCode).not.toBe(429);
    }

    const over = await postMcp(
      app,
      t.token,
      rpc(
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
        999
      )
    );
    expect(over.statusCode).toBe(429);
    const body = JSON.parse(over.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details.scope).toBe('tenant');
    expect(body.error.details.window).toBe('minute');
    expect(body.error.details.limit).toBe(60);
    expect(body.error.details.retry_after_seconds).toBeGreaterThan(0);
    expect(over.headers['retry-after']).toBeDefined();
  });

  it('enforces the 10/min write cap independently of the per-minute cap', async () => {
    const t = await createTenant(app, 'pro');
    tenants.push(t.tenantId);

    // 10 write tool calls (well under the 60/min cap) should fit.
    for (let i = 0; i < 10; i++) {
      const res = await postMcp(
        app,
        t.token,
        rpc('tools/call', { name: 'add_crm_activity', arguments: {} }, i + 1)
      );
      // Tool input validation will throw inside the SDK; we don't care here —
      // only that the HTTP layer accepted the request through the rate-limit
      // gate. 429 is the failure mode we're guarding against.
      expect(res.statusCode).not.toBe(429);
    }

    const blocked = await postMcp(
      app,
      t.token,
      rpc('tools/call', { name: 'add_crm_activity', arguments: {} }, 99)
    );
    expect(blocked.statusCode).toBe(429);
    const body = JSON.parse(blocked.body);
    expect(body.error.details.scope).toBe('tenant_writes');
    expect(body.error.details.limit).toBe(10);

    // A read tool should still succeed — the read bucket has only consumed
    // 10 slots out of 60, and reads don't draw on the write bucket.
    const read = await postMcp(
      app,
      t.token,
      rpc('tools/call', { name: 'get_customers', arguments: {} }, 100)
    );
    expect(read.statusCode).not.toBe(429);
  });
});
