-- Customer auth — Layer 2 storefront shopper accounts.
-- See docs/27-customer-accounts-storefront-auth.md.
--
-- These tables hang off the CRM `customers` spine (credentials + sessions +
-- reset tokens only); the CRM owns the customer record. Passwords are stored
-- ONLY as Argon2id hashes; session/reset tokens ONLY as SHA-256 hashes.
--
-- RLS: every table is ENABLE + FORCE with a tenant_isolation policy on
-- current_tenant_id() (defined in 20260527000100_rls). FORCE is correct here —
-- unlike the staff users/sessions/accounts (NO FORCE, read pre-tenant by the
-- owner connection), customer auth ALWAYS knows the tenant up front (it's the
-- storefront hostname), so every query runs inside withTenant() on sparx_app.
-- There is no pre-tenant read path to exempt.

-- CreateTable
CREATE TABLE "customer_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customer_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_password_resets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_credentials_customer_id_key" ON "customer_credentials"("customer_id");

-- CreateIndex
CREATE INDEX "customer_credentials_tenant_id_idx" ON "customer_credentials"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_tenant_id_customer_id_idx" ON "customer_sessions"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_password_resets_token_hash_key" ON "customer_password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "customer_password_resets_tenant_id_customer_id_idx" ON "customer_password_resets"("tenant_id", "customer_id");

-- AddForeignKey
ALTER TABLE "customer_credentials" ADD CONSTRAINT "customer_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credentials" ADD CONSTRAINT "customer_credentials_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "customer_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_password_resets" ADD CONSTRAINT "customer_password_resets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_password_resets" ADD CONSTRAINT "customer_password_resets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation (ENABLE + FORCE) on all three tables.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "customer_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_credentials_tenant_isolation ON "customer_credentials"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "customer_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_sessions_tenant_isolation ON "customer_sessions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "customer_password_resets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_password_resets" FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_password_resets_tenant_isolation ON "customer_password_resets"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
