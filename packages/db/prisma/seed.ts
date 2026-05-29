// Dev seed — idempotent: re-running upserts in place, so it's safe to call
// `pnpm --filter @sparx/db db:seed` repeatedly.
//
// Creates the "E2E Store" tenant with one staff user
// (e2e-staff@sparx.test / e2e-test-password) — these credentials are baked
// into Playwright tests and any local dashboard smoke test. The password
// hash uses argon2id with Better Auth's default parameters so the same
// row works against the live login flow once the auth service is wired in.

import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { seedMarketingContent } from './seeds/marketing.js';

// `Algorithm.Argon2id` from @node-rs/argon2 is a const enum, which
// verbatimModuleSyntax disallows. Inline the numeric value instead.
const ARGON2ID = 2;

const prisma = new PrismaClient();

const TENANT_SLUG = 'e2e-store';
const STAFF_EMAIL = 'e2e-staff@sparx.test';
const STAFF_PASSWORD = 'e2e-test-password';

async function main(): Promise<void> {
  // tenants has no RLS — safe to upsert outside a tenant context. Default
  // settings (incl. the module activation registry read by
  // @sparx/auth#requireModule) are JSON-merged via raw SQL so re-running
  // the seed adds new module flags without clobbering unrelated keys (e.g.
  // the onboarding tracker).
  const defaultSettings = {
    primaryDomain: 'e2e.sparx.test',
    modules: {
      storefront: { enabled: true },
      commerce: { enabled: true },
      cms: { enabled: true },
      crm: { enabled: true },
    },
  };

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      slug: TENANT_SLUG,
      name: 'E2E Store',
      email: STAFF_EMAIL,
      plan: 'starter',
      status: 'active',
      settings: defaultSettings,
    },
  });

  // Merge module flags onto existing settings without overwriting other
  // top-level keys. jsonb || jsonb does a shallow merge — fine here since
  // each module slot is independently structured.
  await prisma.$executeRaw`
    UPDATE tenants
    SET settings = settings || ${JSON.stringify(defaultSettings)}::jsonb
    WHERE id = ${tenant.id}::uuid
  `;

  // Better Auth defaults to argon2id with these parameters (docs/16 §1).
  // Match them here so the seeded hash verifies against the live login flow.
  const passwordHash = await hash(STAFF_PASSWORD, {
    algorithm: ARGON2ID,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // users and accounts are RLS-protected; set the tenant context inside a
  // transaction so SET LOCAL applies to every statement that follows. Account
  // RLS keys on user_id, so we set app.user_id once we know the owner row id.
  //
  // Wrapped in try/catch so a prod re-seed (where the e2e staff user may
  // already exist under a stale tenant — email is globally unique) doesn't
  // block the marketing seed that follows.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);

      const owner = await tx.user.upsert({
        where: { email: STAFF_EMAIL },
        update: {},
        create: {
          tenantId: tenant.id,
          email: STAFF_EMAIL,
          name: 'E2E Staff',
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
        update: { password: passwordHash },
        create: {
          userId: owner.id,
          providerId: 'credential',
          accountId: owner.id,
          password: passwordHash,
        },
      });

      console.log(`Seeded tenant "${tenant.name}" (${tenant.id}) with staff user ${owner.email}`);
    });
  } catch (err) {
    console.warn(
      `[seed] e2e-store staff user upsert skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Seed the Sparx Marketing tenant + its module/feature content entries.
  // Idempotent; safe to re-run.
  await seedMarketingContent(prisma);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
