// Dev seed — one tenant + one owner user. Idempotent: re-running upserts in
// place, so `pnpm --filter @sparx/db db:seed` is safe to call repeatedly.
//
// Gillett Diesel is the named pilot tenant in CLAUDE.md / docs/01; using it
// here means local dev mirrors the data that will exist in staging.
//
// The owner's password hash is a placeholder. Better Auth issues Argon2
// hashes once the auth service is wired up — at that point this seed will
// switch to calling Better Auth's signUp API instead of writing accounts
// directly.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // tenants has no RLS — safe to upsert outside a tenant context.
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'gillett-diesel' },
    update: {},
    create: {
      slug: 'gillett-diesel',
      name: 'Gillett Diesel Service',
      email: 'owner@gillettdiesel.example',
      plan: 'enterprise',
      status: 'active',
      settings: {
        primaryDomain: 'gillettdiesel.example',
        modules: ['storefront', 'commerce', 'b2b', 'crm'],
      },
    },
  });

  // users and accounts are RLS-protected; set the tenant context inside a
  // transaction so SET LOCAL applies to every statement that follows. Account
  // RLS keys on user_id, so we set app.user_id once we know the owner row id.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);

    const owner = await tx.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: 'brandon@wizeworks.example',
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        email: 'brandon@wizeworks.example',
        name: 'Brandon Korous',
        role: 'owner',
        emailVerified: true,
      },
    });

    await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${owner.id}'`);

    await tx.account.upsert({
      where: {
        providerId_accountId: {
          providerId: 'credential',
          accountId: owner.id,
        },
      },
      update: {},
      create: {
        userId: owner.id,
        providerId: 'credential',
        accountId: owner.id,
        // Placeholder — replaced by a real Argon2 hash once Better Auth is wired.
        password: 'SEED_PLACEHOLDER_NOT_A_REAL_HASH',
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      `Seeded tenant ${tenant.slug} (${tenant.id}) with owner ${owner.email}`,
    );
  });
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
