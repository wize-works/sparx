// Per-test fixtures: provision tenants + users + JWTs against the local
// Postgres so each integration test starts from a known small state.
//
// Convention: tenants are named `test_${random()}` and deleted at the end
// of the test. ON DELETE CASCADE on tenant_id reaches every CMS table, so
// dropping the tenant drops every row the test created.

import crypto from 'node:crypto';
import { prisma } from '@sparx/db';
import type { FastifyInstance } from 'fastify';
import type { StaffRole } from '../src/plugins/auth.js';

export interface TestTenant {
  tenantId: string;
  userId: string;
  email: string;
}

export async function createTestTenant(role: StaffRole = 'owner'): Promise<TestTenant> {
  const slug = `test-${crypto.randomBytes(4).toString('hex')}`;
  const email = `${slug}@sparx.test`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `Test ${slug}`,
      email,
      plan: 'starter',
      status: 'active',
      settings: {},
    },
  });
  // users has FORCE RLS, so insert via a tenant-scoped raw exec.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: `Test ${slug}`,
        role,
      },
    });
  });
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    return tx.user.findFirstOrThrow({ where: { tenantId: tenant.id, email } });
  });
  return { tenantId: tenant.id, userId: user.id, email };
}

export async function dropTestTenant(tenantId: string): Promise<void> {
  // Cascade reaches every tenant-scoped table.
  await prisma.tenant.delete({ where: { id: tenantId } });
}

export async function signToken(
  app: FastifyInstance,
  fixture: TestTenant,
  role: StaffRole = 'owner',
): Promise<string> {
  return app.jwt.sign(
    { sub: fixture.userId, tid: fixture.tenantId, role },
    { expiresIn: '5m' },
  );
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
