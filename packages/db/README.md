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

## Applying a migration

**You don't run migrations manually against Cloud SQL.** The Cloud SQL instance is private-IP only — the Auth Proxy can't reach it from a laptop. The pipeline at [.github/workflows/db-migrate.yml](../../.github/workflows/db-migrate.yml) is the only path to prod.

### The flow

1. **Author the migration locally** against the docker Postgres:

   ```bash
   pnpm db:up
   # Edit prisma/schema.prisma…
   pnpm --filter @sparx/db prisma migrate dev --name <descriptive_name>
   ```

   Prisma generates `prisma/migrations/<timestamp>_<name>/migration.sql` by diffing the schema against the local DB.

2. **Hand-edit the SQL** for anything Prisma can't model:
   - RLS / FORCE RLS toggles
   - `current_tenant_id()` / `current_user_id()` policies
   - `ALTER DEFAULT PRIVILEGES`
   - Triggers (e.g. the `set_updated_at` pattern)

   Prisma will only generate `CREATE TABLE` / `ALTER TABLE` / index DDL; the rest is on you. The existing [20260527000100_rls/migration.sql](prisma/migrations/20260527000100_rls/migration.sql) is the reference template.

3. **Commit + push to `main`.** The push triggers `DB Migrate` if any of these paths changed:
   - `packages/db/prisma/schema.prisma`
   - `packages/db/prisma/migrations/**`
   - `packages/db/sql/**`
   - `packages/db/scripts/run-migrations.ts`
   - `packages/db/Dockerfile`
   - `k8s/sparx-prod/db-migrate-job.yaml`
   - `.github/workflows/db-migrate.yml`

   The workflow builds the migrate image, pushes to Artifact Registry (`us-central1-docker.pkg.dev/sparxworks/sparx/db-migrate:<sha>`), and applies a K8s Job in `sparx-prod` that runs `cloud-sql-bootstrap.sql` (idempotent grants) and `prisma migrate deploy` through the Cloud SQL Auth Proxy sidecar.

4. **Re-seed (rare):** trigger the workflow manually with `run_seed=true`:

   ```bash
   gh workflow run db-migrate.yml -f run_seed=true --ref main
   ```

   The seed is idempotent (upsert), so it's safe to re-run.

5. **Rollback:** there is none. Write a forward migration that reverses the change. The pipeline always moves the schema forward; never edit a migration that has already been applied.

### What you give up by going through CI

- The image build + push step takes ~30 s — you can't iterate as fast as `prisma migrate dev` against local docker. Develop migrations locally first.
- Prisma's drift detection still runs in CI, so a migration that was applied to local docker but never committed will block a future migration. Always commit local migrations or `prisma migrate reset` the local DB.

## Tenant context (the critical pattern)

Every API request handler that touches tenant data **must** wrap its DB work in `withTenant`. RLS policies on tenant-scoped tables filter against `app.tenant_id`, set via `SET LOCAL` inside a transaction.

```ts
import { withTenant } from '@sparx/db';

const orders = await withTenant({ tenantId: req.tenant.id }, (tx) =>
  tx.order.findMany({ where: { status: 'pending' } })
);
```

A query outside `withTenant` against an RLS-protected table sees zero rows. That is the intended failure mode — it's the database backstop the application tier is allowed to bug-out behind.

## Why two database URLs

- `DATABASE_URL` → `sparx_app` (NOBYPASSRLS) — used by the Prisma client at runtime.
- `MIGRATION_DATABASE_URL` → `sparx_owner` — used by `prisma migrate`. Schema changes need privileges the runtime role doesn't have.

Decision F3 ([docs/16-auth-security.md](../../docs/16-auth-security.md) §4): tenant-scoped tables use `FORCE ROW LEVEL SECURITY` so even table owners can't bypass policies. The auth service's bootstrap reads (login, magic-link callback) run through a `SECURITY DEFINER` function — that lives with the auth service, not here.

## Better Auth alignment

The `User`, `Session`, `Account`, and `Verification` shapes match what Better Auth's Prisma adapter expects ([docs/16-auth-security.md](../../docs/16-auth-security.md) §1). Once the auth service lands, Better Auth uses these tables directly via `user.additionalFields` for the Sparx columns (`tenantId`, `role`, `lastLoginAt`).
