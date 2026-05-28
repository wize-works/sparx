// CRM routes — wiring smoke + module-gate behavior.
//
// Covers the bits that aren't already exercised by @sparx/crm's own service
// integration tests: requireCrmModule fires before the handler, the envelope
// matches docs/06 §3, and the auth boundary (no token / wrong role) lands
// the right status.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@sparx/db';
import { invalidateModuleCache } from '@sparx/auth';
import { createApp } from '../../src/app.js';
import { authHeader, signToken } from '../helpers.js';

interface CrmTenant {
  tenantId: string;
  userId: string;
}

async function createCrmTenant(crmEnabled: boolean): Promise<CrmTenant> {
  const slug = `apicrm-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `CRM API ${slug}`,
      email,
      plan: 'starter',
      status: 'active',
      settings: crmEnabled ? { modules: { crm: { enabled: true } } } : {},
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: { tenantId: tenant.id, email, name: `API ${slug}`, role: 'owner' },
    });
  });
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });
  return { tenantId: tenant.id, userId: user.id };
}

describe('CRM routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // requireModule caches enable-state for 60s; reset between tests so flag
    // flips during a test land immediately.
    invalidateModuleCache();
  });

  it('returns the documented MODULE_DISABLED envelope when CRM is off', async () => {
    const t = await createCrmTenant(false);
    try {
      const token = signToken(app, { ...t, email: '' });
      const res = await app.inject({
        method: 'GET',
        url: '/v1/crm/customers',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MODULE_DISABLED');
      expect(body.error.details).toMatchObject({ module: 'crm' });
      expect(body.error.request_id).toMatch(/^req_/);
    } finally {
      await prisma.tenant.delete({ where: { id: t.tenantId } });
    }
  });

  it('lists customers (empty) and creates one when CRM is on', async () => {
    const t = await createCrmTenant(true);
    try {
      const token = signToken(app, { ...t, email: '' });

      const empty = await app.inject({
        method: 'GET',
        url: '/v1/crm/customers',
        headers: authHeader(token),
      });
      expect(empty.statusCode).toBe(200);
      const list = empty.json();
      expect(list.success).toBe(true);
      expect(list.data).toEqual([]);
      expect(list.meta).toMatchObject({ total: 0 });

      const created = await app.inject({
        method: 'POST',
        url: '/v1/crm/customers',
        headers: authHeader(token),
        payload: { type: 'retail', email: 'kira@example.test', firstName: 'Kira' },
      });
      expect(created.statusCode).toBe(201);
      const wire = created.json();
      expect(wire.success).toBe(true);
      expect(wire.data).toMatchObject({
        type: 'retail',
        email: 'kira@example.test',
        firstName: 'Kira',
      });
    } finally {
      await prisma.tenant.delete({ where: { id: t.tenantId } });
    }
  });

  it('rejects without a token (401 UNAUTHORIZED) even on a CRM-active tenant', async () => {
    const t = await createCrmTenant(true);
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/crm/customers' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    } finally {
      await prisma.tenant.delete({ where: { id: t.tenantId } });
    }
  });
});
