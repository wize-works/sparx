// Integration tests — exercise the full service against a real Postgres with
// RLS enforced (sparx_app, NOBYPASSRLS). DB-gated: skipped unless RUN_DB_TESTS
// is set, so CI without a database stays green. Run locally with:
//
//   DATABASE_URL="postgresql://sparx_app:devpassword@localhost:5544/sparx" \
//   RUN_DB_TESTS=1 pnpm --filter @sparx/customer-auth test
//
// The key claim under test is tenant isolation: a session minted for tenant A
// must be invisible under tenant B, enforced by RLS — not by application code.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@sparx/db';

import {
  authenticateCustomer,
  CustomerAuthError,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  revokeCustomerSession,
  verifyCustomerSession,
} from './index';

const RUN = !!process.env.RUN_DB_TESTS;

describe.skipIf(!RUN)('customer-auth service (integration)', () => {
  const suffix = Math.floor(Math.random() * 1e9).toString(36);
  const email = `shopper-${suffix}@example.test`;
  let tenantA = '';
  let tenantB = '';
  let customerIdA = '';

  beforeAll(async () => {
    const a = await prisma.tenant.create({
      data: { slug: `catest-a-${suffix}`, name: 'CA Test A', email: 'a@test' },
      select: { id: true },
    });
    const b = await prisma.tenant.create({
      data: { slug: `catest-b-${suffix}`, name: 'CA Test B', email: 'b@test' },
      select: { id: true },
    });
    tenantA = a.id;
    tenantB = b.id;
  });

  afterAll(async () => {
    // Cascade removes customers/credentials/sessions/resets.
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it('registers a shopper and opens a session', async () => {
    const res = await registerCustomer({ tenantId: tenantA }, { email, password: 'hunter2-good' });
    expect(res.customerId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.sessionToken.length).toBeGreaterThan(20);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
    customerIdA = res.customerId;
  });

  it('allows the SAME email to register at a different tenant as a separate account', async () => {
    const resB = await registerCustomer({ tenantId: tenantB }, { email, password: 'other-pw-99' });
    expect(resB.customerId).not.toBe(customerIdA);
  });

  it('rejects a duplicate registration at the same tenant', async () => {
    await expect(
      registerCustomer({ tenantId: tenantA }, { email, password: 'whatever-123' })
    ).rejects.toBeInstanceOf(CustomerAuthError);
  });

  it('authenticates with the right password and rejects wrong/unknown', async () => {
    await expect(
      authenticateCustomer({ tenantId: tenantA }, { email, password: 'hunter2-good' })
    ).resolves.not.toBeNull();
    await expect(
      authenticateCustomer({ tenantId: tenantA }, { email, password: 'wrong-pw' })
    ).resolves.toBeNull();
    await expect(
      authenticateCustomer(
        { tenantId: tenantA },
        { email: `nobody-${suffix}@x.test`, password: 'x' }
      )
    ).resolves.toBeNull();
  });

  it('isolates sessions across tenants via RLS', async () => {
    const session = await authenticateCustomer(
      { tenantId: tenantA },
      { email, password: 'hunter2-good' }
    );
    expect(session).not.toBeNull();
    const token = session!.sessionToken;

    // Resolvable under the tenant that minted it…
    await expect(verifyCustomerSession({ tenantId: tenantA }, token)).resolves.not.toBeNull();
    // …but invisible under another tenant (RLS, not app code).
    await expect(verifyCustomerSession({ tenantId: tenantB }, token)).resolves.toBeNull();

    // Revoke kills it.
    await revokeCustomerSession({ tenantId: tenantA }, token);
    await expect(verifyCustomerSession({ tenantId: tenantA }, token)).resolves.toBeNull();
  });

  it('resets a password, invalidating old sessions and the old password', async () => {
    const live = await authenticateCustomer(
      { tenantId: tenantA },
      { email, password: 'hunter2-good' }
    );
    const oldToken = live!.sessionToken;

    const reset = await requestPasswordReset({ tenantId: tenantA }, { email });
    expect(reset).not.toBeNull();

    const ok = await resetPassword(
      { tenantId: tenantA },
      { token: reset!.resetToken, password: 'brand-new-pw-1' }
    );
    expect(ok).toBe(true);

    // Old session revoked, old password dead, new password works.
    await expect(verifyCustomerSession({ tenantId: tenantA }, oldToken)).resolves.toBeNull();
    await expect(
      authenticateCustomer({ tenantId: tenantA }, { email, password: 'hunter2-good' })
    ).resolves.toBeNull();
    await expect(
      authenticateCustomer({ tenantId: tenantA }, { email, password: 'brand-new-pw-1' })
    ).resolves.not.toBeNull();

    // A used reset token can't be replayed.
    await expect(
      resetPassword({ tenantId: tenantA }, { token: reset!.resetToken, password: 'try-again-pw' })
    ).resolves.toBe(false);

    // Enumeration-safe: unknown email returns null (caller still 200s).
    await expect(
      requestPasswordReset({ tenantId: tenantA }, { email: `ghost-${suffix}@x.test` })
    ).resolves.toBeNull();
  });
});
