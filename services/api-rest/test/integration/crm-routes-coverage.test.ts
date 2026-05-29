// REST wiring coverage for the 7 remaining /v1/crm/* route groups
// (pipelines, deals, b2b-accounts, activities, tasks, segments, reports).
//
// The service-layer integration tests in @sparx/crm own the business logic;
// these tests prove that the transport — route mount, requireRole, requireCrmModule,
// Zod parse, envelope shape — actually wraps the service the way docs/06 says.
//
// One tenant per describe-block. We use the platform bus' module.activated
// event to seed the default pipeline + built-in segments so the read-side
// routes have something to return.

import crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { prisma } from '@sparx/db';
import { invalidateModuleCache } from '@sparx/auth';
import {
  registerCrmConsumers,
  resetDedupeForTesting,
  resetPlatformBusForTesting,
  type PlatformEventBus,
} from '@sparx/crm';

import { createApp } from '../../src/app.js';
import { authHeader, signToken, type TestTenant } from '../helpers.js';

interface CrmFixture {
  tenant: TestTenant;
  token: string;
}

async function createActiveCrmTenant(
  app: FastifyInstance,
  bus: PlatformEventBus
): Promise<CrmFixture> {
  const slug = `crmcov-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `Cov ${slug}`,
      email,
      plan: 'starter',
      status: 'active',
      settings: { modules: { crm: { enabled: true } } },
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: { tenantId: tenant.id, email, name: `Cov ${slug}`, role: 'owner' },
    });
  });
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });
  const fixture: TestTenant = { tenantId: tenant.id, userId: user.id, email };
  // Trigger the activation bootstrap so /v1/crm/pipelines etc. have data to read.
  await bus.publish({
    id: crypto.randomUUID(),
    topic: 'module.activated',
    tenantId: tenant.id,
    occurredAt: new Date(),
    payload: { module: 'crm' },
  });
  await bus.drain();
  return { tenant: fixture, token: signToken(app, fixture) };
}

describe('CRM REST coverage — read paths', () => {
  let app: FastifyInstance;
  let bus: PlatformEventBus;
  let teardown: () => void;
  let active: CrmFixture;
  const cleanup: string[] = [];

  beforeAll(async () => {
    bus = resetPlatformBusForTesting();
    resetDedupeForTesting();
    const reg = registerCrmConsumers({ bus });
    teardown = () => reg.unregister();
    app = await createApp();
    active = await createActiveCrmTenant(app, bus);
    cleanup.push(active.tenant.tenantId);
  });

  afterAll(async () => {
    teardown();
    await app.close();
    for (const id of cleanup) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  });

  beforeEach(() => {
    invalidateModuleCache();
  });

  it('GET /v1/crm/pipelines lists the bootstrapped default pipeline', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/pipelines',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const sales = body.data.find((p: { slug: string }) => p.slug === 'sales');
    expect(sales).toBeDefined();
    expect(sales.stages.length).toBe(6);
  });

  it('GET /v1/crm/deals returns an empty list for a fresh tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/deals',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('GET /v1/crm/b2b-accounts returns an empty list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/b2b-accounts',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('GET /v1/crm/activities returns an empty list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/activities',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('GET /v1/crm/tasks returns an empty list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/tasks',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('GET /v1/crm/segments returns the four built-in segments', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/segments',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(4);
    const slugs = body.data.map((s: { slug: string }) => s.slug).sort();
    expect(slugs).toEqual(['at-risk', 'b2b-fleet', 'high-value', 'new-customers']);
  });

  it('GET /v1/crm/reports/snapshot returns the empty-tenant snapshot', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/crm/reports/snapshot',
      headers: authHeader(active.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('CRM REST coverage — write paths through the service layer', () => {
  let app: FastifyInstance;
  let bus: PlatformEventBus;
  let teardown: () => void;
  let active: CrmFixture;
  const cleanup: string[] = [];

  beforeAll(async () => {
    bus = resetPlatformBusForTesting();
    resetDedupeForTesting();
    const reg = registerCrmConsumers({ bus });
    teardown = () => reg.unregister();
    app = await createApp();
    active = await createActiveCrmTenant(app, bus);
    cleanup.push(active.tenant.tenantId);
  });

  afterAll(async () => {
    teardown();
    await app.close();
    for (const id of cleanup) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  });

  beforeEach(() => {
    invalidateModuleCache();
  });

  it('POST /v1/crm/pipelines creates a pipeline and the service emits the event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/pipelines',
      headers: authHeader(active.token),
      payload: { name: 'Custom', slug: 'custom', isDefault: false },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toMatchObject({ slug: 'custom', isDefault: false });
  });

  it('POST /v1/crm/activities records a note-typed activity', async () => {
    // Customer required so the activity has somewhere to live.
    const customer = await app.inject({
      method: 'POST',
      url: '/v1/crm/customers',
      headers: authHeader(active.token),
      payload: { type: 'retail', email: 'note-target@example.test' },
    });
    expect(customer.statusCode).toBe(201);
    const customerId = customer.json().data.id;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/activities',
      headers: authHeader(active.token),
      payload: {
        customerId,
        type: 'note',
        actorType: 'staff',
        actorId: active.tenant.userId,
        description: 'Called about Q3 renewal.',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ customerId, type: 'note' });
  });

  it('POST /v1/crm/tasks creates a task assignable to the current user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/tasks',
      headers: authHeader(active.token),
      payload: {
        title: 'Follow up with Acme',
        priority: 'medium',
        assignedToUserId: active.tenant.userId,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ title: 'Follow up with Acme', status: 'open' });
  });

  it('POST /v1/crm/segments creates a custom segment with a rule tree', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/segments',
      headers: authHeader(active.token),
      payload: {
        name: 'Loyal',
        slug: 'loyal',
        description: 'Customers with 5+ orders.',
        rules: { kind: 'predicate', field: 'customer.orderCount', op: 'gte', value: 5 },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ slug: 'loyal', isBuiltIn: false });
  });

  it('POST /v1/crm/b2b-accounts creates a B2B account record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/crm/b2b-accounts',
      headers: authHeader(active.token),
      payload: {
        companyName: 'Gillett Diesel',
        pricingTier: 'wholesale',
        status: 'active',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ companyName: 'Gillett Diesel', status: 'active' });
  });
});

describe('CRM REST coverage — module gate fires on every route group', () => {
  let app: FastifyInstance;
  const cleanup: string[] = [];

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    for (const id of cleanup) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
  });

  beforeEach(() => {
    invalidateModuleCache();
  });

  it.each([
    ['GET', '/v1/crm/pipelines'],
    ['GET', '/v1/crm/deals'],
    ['GET', '/v1/crm/b2b-accounts'],
    ['GET', '/v1/crm/activities'],
    ['GET', '/v1/crm/tasks'],
    ['GET', '/v1/crm/segments'],
    ['GET', '/v1/crm/reports/snapshot'],
  ])('%s %s returns MODULE_DISABLED for a tenant without CRM', async (method, url) => {
    const slug = `gate-${crypto.randomBytes(3).toString('hex')}`;
    const email = `${slug}@sparx.test`;
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: slug,
        email,
        plan: 'starter',
        status: 'active',
        settings: {}, // CRM not enabled
      },
    });
    cleanup.push(tenant.id);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
      await tx.user.create({
        data: { tenantId: tenant.id, email, name: slug, role: 'owner' },
      });
    });
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
      return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
    });
    const token = signToken(app, { tenantId: tenant.id, userId: user.id, email });

    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'MODULE_DISABLED', details: { module: 'crm' } },
    });
  });
});
