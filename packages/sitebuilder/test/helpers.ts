// Per-test fixtures for @sparx/sitebuilder integration tests. Mirrors
// packages/crm/test/helpers.ts: every test gets a fresh tenant + staff user,
// torn down via a single ON DELETE CASCADE tenant delete.

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
  ctx: { tenantId: string; userId: string };
  publisher: RecordingPublisher;
}

export async function createTestTenant(role = 'owner'): Promise<TestTenant> {
  const slug = `sb-test-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `Site Builder Test ${slug}`,
      email,
      plan: 'starter',
      status: 'active',
      settings: { modules: { storefront: { enabled: true } } },
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

/** Reads the commerce StorefrontTheme row written through on publish. */
export function readStorefrontTheme(tenantId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return tx.storefrontTheme.findUnique({ where: { tenantId } });
  });
}
