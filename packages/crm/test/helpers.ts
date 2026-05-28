// Per-test fixtures for @sparx/crm integration tests.
//
// Strategy: every test gets a fresh tenant + staff user. Tests use
// ON DELETE CASCADE on tenant_id to teardown via a single tenant delete.
// This mirrors services/api-rest/test/helpers.ts conventions so the two
// test surfaces are predictable together.

import crypto from 'node:crypto';

import { prisma } from '@sparx/db';
import { RecordingPublisher, setPublisher } from '../src/events.js';

export interface TestTenant {
  tenantId: string;
  userId: string;
  email: string;
  slug: string;
}

export interface TestContext {
  tenant: TestTenant;
  /** Service-layer ctx most service functions accept. */
  ctx: { tenantId: string; userId: string };
  /** Recording publisher swapped in for the test; .events asserts emissions. */
  publisher: RecordingPublisher;
}

/** Create a tenant + staff user. CRM module is enabled in `settings.modules.crm`
 *  so requireModule('crm') (when exercised in dashboard tests) passes. */
export async function createTestTenant(role = 'owner'): Promise<TestTenant> {
  const slug = `crm-test-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `CRM Test ${slug}`,
      email,
      plan: 'starter',
      status: 'active',
      settings: {
        modules: { crm: { enabled: true } },
      },
    },
  });

  // users has FORCE RLS — write via a tenant-scoped raw exec.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: { tenantId: tenant.id, email, name: `Test ${slug}`, role },
    });
  });

  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });

  return { tenantId: tenant.id, userId: user.id, email, slug };
}

export async function dropTestTenant(tenantId: string): Promise<void> {
  await prisma.tenant.delete({ where: { id: tenantId } });
}

/** Convenience — provisions a tenant, installs a RecordingPublisher, returns
 *  everything tests typically need. Pair with disposeTestContext() in afterAll. */
export async function makeTestContext(role = 'owner'): Promise<TestContext> {
  const tenant = await createTestTenant(role);
  const publisher = new RecordingPublisher();
  setPublisher(publisher);
  return {
    tenant,
    ctx: { tenantId: tenant.tenantId, userId: tenant.userId },
    publisher,
  };
}

export async function disposeTestContext(test: TestContext): Promise<void> {
  await dropTestTenant(test.tenant.tenantId);
  test.publisher.clear();
}
