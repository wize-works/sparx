// Internal CRM cron endpoints — auth boundary + happy path for each
// scheduled job. We don't need to exercise the schedulers themselves
// (those have dedicated unit tests in @sparx/crm); the point here is to
// prove the route is wired, the token check is enforced, and that the
// per-tenant fan-out finds the active tenant.

import crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@sparx/db';

import { createApp } from '../../src/app.js';

const CRON_TOKEN_HEADER = 'x-sparx-internal-cron-token';

interface ActiveCrmTenant {
  tenantId: string;
}

async function createActiveCrmTenant(): Promise<ActiveCrmTenant> {
  const slug = `cron-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: slug,
      email,
      plan: 'starter',
      status: 'active',
      settings: { modules: { crm: { enabled: true } } },
    },
  });
  return { tenantId: tenant.id };
}

describe('internal CRM cron endpoints', () => {
  let app: FastifyInstance;
  const cleanup: string[] = [];

  beforeAll(async () => {
    // Token is set by test/setup.ts before env.ts evaluates.
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    for (const id of cleanup) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  });

  beforeEach(() => {
    // No-op: each test creates its own fresh tenant so order doesn't matter.
  });

  it('rejects calls with no token (401)', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/crm/partition-rollover' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects calls with a wrong token (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/crm/partition-rollover',
      headers: { [CRON_TOKEN_HEADER]: 'wrong-token-but-same-length-ish' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('partition-rollover succeeds and reports ensured partition names', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/crm/partition-rollover',
      headers: { [CRON_TOKEN_HEADER]: 'test-cron-token-1234567890abcdef' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.ensured)).toBe(true);
    expect(body.data.ensured.length).toBeGreaterThanOrEqual(2);
    expect(body.data.ensured[0]).toMatch(/^crm_activities_\d{4}_\d{2}$/);
  });

  it('automation-triggers fans out to the active tenant and skips the rest', async () => {
    const t = await createActiveCrmTenant();
    cleanup.push(t.tenantId);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/crm/automation-triggers',
      headers: { [CRON_TOKEN_HEADER]: 'test-cron-token-1234567890abcdef' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // tenants includes any other CRM-active tenants left over from earlier
    // suites — assert it includes ours, not that it equals 1.
    expect(body.data.tenants).toBeGreaterThanOrEqual(1);
    const ours = body.data.outcomes.find((o: { tenantId: string }) => o.tenantId === t.tenantId);
    expect(ours).toBeDefined();
    expect(ours.ok).toBe(true);
  });

  it('overdue-reminders runs against the active tenant', async () => {
    const t = await createActiveCrmTenant();
    cleanup.push(t.tenantId);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/crm/overdue-reminders',
      headers: { [CRON_TOKEN_HEADER]: 'test-cron-token-1234567890abcdef' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ours = body.data.outcomes.find((o: { tenantId: string }) => o.tenantId === t.tenantId);
    expect(ours?.ok).toBe(true);
  });

  it('segment-recompute runs against the active tenant', async () => {
    const t = await createActiveCrmTenant();
    cleanup.push(t.tenantId);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/crm/segment-recompute',
      headers: { [CRON_TOKEN_HEADER]: 'test-cron-token-1234567890abcdef' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ours = body.data.outcomes.find((o: { tenantId: string }) => o.tenantId === t.tenantId);
    expect(ours?.ok).toBe(true);
  });
});
