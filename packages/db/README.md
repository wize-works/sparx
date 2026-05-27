# @sparx/db

Sparx data layer. Owns the Prisma schema, generated client, migrations, and the tenant-context helper that every API request handler uses to wrap its DB work.

## What's in scope here

This package is the **foundation tables only** — tenants, staff users, sessions, accounts, verifications, audit log. Module-specific tables (products, orders, customers, B2B accounts, CMS pages, etc. — see [docs/05-data-model.md](../../docs/05-data-model.md)) are added by their owning modules in follow-up migrations.

## First-time setup

```bash
# 1. Bring up local Postgres 18 (matches Cloud SQL production).
pnpm db:up

# 2. Copy the env template.
cp packages/db/.env.example packages/db/.env

# 3. Generate the Prisma client and apply migrations.
pnpm --filter @sparx/db db:generate
pnpm --filter @sparx/db db:migrate:deploy

# 4. Seed Gillett Diesel + the owner user.
pnpm db:seed
```

Subsequent runs only need `pnpm db:up`.

## Tenant context (the critical pattern)

Every API request handler that touches tenant data **must** wrap its DB work in `withTenant`. RLS policies on tenant-scoped tables filter against `app.tenant_id`, set via `SET LOCAL` inside a transaction.

```ts
import { withTenant } from '@sparx/db';

const orders = await withTenant({ tenantId: req.tenant.id }, (tx) =>
  tx.order.findMany({ where: { status: 'pending' } }),
);
```

A query outside `withTenant` against an RLS-protected table sees zero rows. That is the intended failure mode — it's the database backstop the application tier is allowed to bug-out behind.

## Why two database URLs

- `DATABASE_URL` → `sparx_app` (NOBYPASSRLS) — used by the Prisma client at runtime.
- `MIGRATION_DATABASE_URL` → `sparx_owner` — used by `prisma migrate`. Schema changes need privileges the runtime role doesn't have.

Decision F3 ([docs/16-auth-security.md](../../docs/16-auth-security.md) §4): tenant-scoped tables use `FORCE ROW LEVEL SECURITY` so even table owners can't bypass policies. The auth service's bootstrap reads (login, magic-link callback) run through a `SECURITY DEFINER` function — that lives with the auth service, not here.

## Better Auth alignment

The `User`, `Session`, `Account`, and `Verification` shapes match what Better Auth's Prisma adapter expects ([docs/16-auth-security.md](../../docs/16-auth-security.md) §1). Once the auth service lands, Better Auth uses these tables directly via `user.additionalFields` for the Sparx columns (`tenantId`, `role`, `lastLoginAt`).
