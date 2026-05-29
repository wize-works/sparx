-- Globally-unique user.email.
--
-- The previous `@@unique([tenantId, email])` was multi-tenant-correct in
-- isolation but useless in practice: signUpMerchant creates a fresh tenant
-- per registration, so the compound never collided. Duplicate users
-- (same email, different tenants) actually surfaced as "Invalid password
-- hash" failures during sign-in, because Better Auth's sign-in flow keys
-- on email alone and matched whichever row PostgreSQL returned first —
-- which, for our test-staff account, was an older argon2-hashed row that
-- the current scrypt verifier could not parse.
--
-- This migration drops the compound and adds a plain `UNIQUE (email)`
-- index named the way Prisma's `email @unique` schema annotation expects
-- (`users_email_key`), so the generated client's findUnique({ email })
-- maps to a single fast index lookup. Case-folding is enforced at the
-- application layer: signUpMerchant calls `.trim().toLowerCase()` before
-- insert, and Better Auth normalises in its stock endpoints.
--
-- No backfill is needed for production today (only the test-staff
-- duplicate ever existed and was cleaned up manually before this lands).

DROP INDEX IF EXISTS "users_tenant_id_email_key";

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
