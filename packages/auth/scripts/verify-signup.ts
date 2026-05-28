// One-shot script that exercises the sign-up + sign-in path end-to-end.
//   pnpm --filter @sparx/auth exec tsx scripts/verify-signup.ts
//
// Verifies:
//   1. signUpMerchant() creates Tenant + User + Account in one transaction
//   2. Better Auth's signInEmail() then accepts those credentials
//   3. The session row lands in `sessions` keyed to the new user
//
// Cleans up on success so it can run repeatedly.

import 'dotenv/config';
import { authPrisma } from '../src/prisma';
import { auth } from '../src/server';
import { signUpMerchant, SignUpError } from '../src/sign-up';

const email = `verify-${Date.now()}@example.test`;
const password = 'verification-password';
const storeName = `Verify Store ${Date.now()}`;

async function main() {
  console.log(`Signing up ${email} (store "${storeName}")…`);

  const result = await signUpMerchant({
    email,
    password,
    name: 'Verification Tester',
    storeName,
  });

  console.log('  ↳ tenantId:', result.tenantId);
  console.log('  ↳ userId  :', result.userId);

  const user = await authPrisma.user.findUnique({ where: { id: result.userId } });
  const tenant = await authPrisma.tenant.findUnique({ where: { id: result.tenantId } });
  const account = await authPrisma.account.findFirst({ where: { userId: result.userId } });

  if (!user || !tenant || !account) {
    throw new Error('Expected Tenant + User + Account rows after sign-up.');
  }
  if (user.role !== 'owner') {
    throw new Error(`Expected first user to have role=owner, got ${user.role}`);
  }
  if (!account.password) {
    throw new Error('Expected hashed password on the credential account.');
  }
  console.log('✓ Tenant + User + Account rows present, role=owner, password hashed');

  console.log('Signing in via Better Auth…');
  // sessions.ip_address is INET — when this runs inside a Next.js request the
  // IP comes from the request socket. From a CLI script there is none, so we
  // forge a header pair Better Auth will pull from.
  const signIn = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1', 'user-agent': 'verify-signup-script' }),
    asResponse: false,
  });
  if (!signIn?.user?.id) {
    throw new Error('signInEmail did not return a user.');
  }
  if (signIn.user.id !== result.userId) {
    throw new Error(`Sign-in returned a different user id (${signIn.user.id} ≠ ${result.userId})`);
  }
  console.log('✓ Sign-in succeeded for the new user');

  const sessions = await authPrisma.session.count({ where: { userId: result.userId } });
  if (sessions < 1) {
    throw new Error('Expected at least one Session row after sign-in.');
  }
  console.log(`✓ ${sessions} session row(s) created`);

  console.log('Cleaning up…');
  await authPrisma.tenant.delete({ where: { id: result.tenantId } });
  await authPrisma.$disconnect();

  console.log('\nAll auth wiring verified end-to-end.');
}

main().catch(async (err) => {
  if (err instanceof SignUpError) {
    console.error(`SignUpError [${err.code}]:`, err.message);
  } else {
    console.error(err);
  }
  await authPrisma.$disconnect();
  process.exit(1);
});
