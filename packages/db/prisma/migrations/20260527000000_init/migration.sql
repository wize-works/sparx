-- Sparx initial schema migration.
--
-- Hand-authored to match prisma/schema.prisma. Future schema changes should be
-- generated with `pnpm --filter @sparx/db db:migrate -- --name <change>` and
-- reviewed against this file's style.

-- Extensions ---------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- tenants ------------------------------------------------------------------

CREATE TABLE "tenants" (
    "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    "slug"                VARCHAR(63)  NOT NULL,
    "name"                VARCHAR(255) NOT NULL,
    "email"               VARCHAR(255) NOT NULL,
    "plan"                VARCHAR(50)  NOT NULL DEFAULT 'starter',
    "status"              VARCHAR(20)  NOT NULL DEFAULT 'active',
    "settings"            JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "stripe_customer_id"  VARCHAR(255),
    "trial_ends_at"       TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" ("slug");

-- users --------------------------------------------------------------------

CREATE TABLE "users" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "email"          VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN      NOT NULL DEFAULT false,
    "name"           VARCHAR(255),
    "image"          TEXT,
    "tenant_id"      UUID         NOT NULL,
    "role"           VARCHAR(50)  NOT NULL DEFAULT 'editor',
    "last_login_at"  TIMESTAMPTZ,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users" ("tenant_id", "email");
CREATE INDEX "users_tenant_id_idx" ON "users" ("tenant_id");

-- sessions -----------------------------------------------------------------

CREATE TABLE "sessions" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID         NOT NULL,
    "token"      VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ  NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" ("token");
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions" ("expires_at");

-- accounts -----------------------------------------------------------------

CREATE TABLE "accounts" (
    "id"                        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"                   UUID         NOT NULL,
    "provider_id"               VARCHAR(50)  NOT NULL,
    "account_id"                VARCHAR(255) NOT NULL,
    "password"                  TEXT,
    "access_token"              TEXT,
    "refresh_token"             TEXT,
    "access_token_expires_at"   TIMESTAMPTZ,
    "refresh_token_expires_at"  TIMESTAMPTZ,
    "scope"                     TEXT,
    "id_token"                  TEXT,
    "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "accounts_provider_id_account_id_key"
    ON "accounts" ("provider_id", "account_id");
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");

-- verifications ------------------------------------------------------------

CREATE TABLE "verifications" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "identifier" VARCHAR(255) NOT NULL,
    "value"      VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ  NOT NULL,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");
CREATE INDEX "verifications_expires_at_idx" ON "verifications" ("expires_at");

-- audit_logs ---------------------------------------------------------------

CREATE TABLE "audit_logs" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID         NOT NULL,
    "actor_id"    UUID,
    "actor_type"  VARCHAR(20),
    "action"      VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id"   UUID,
    "diff"        JSONB,
    "ip_address"  INET,
    "user_agent"  TEXT,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "audit_logs_tenant_id_created_at_idx"
    ON "audit_logs" ("tenant_id", "created_at" DESC);
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx"
    ON "audit_logs" ("tenant_id", "entity_type", "entity_id");

-- updated_at trigger -------------------------------------------------------
-- Prisma's @updatedAt handles this at the application layer, but a DB-level
-- trigger is the backstop for direct SQL access and for tables we may later
-- write to outside Prisma (workers, jobs, MCP server).

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_set_updated_at      BEFORE UPDATE ON "tenants"       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at        BEFORE UPDATE ON "users"         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sessions_set_updated_at     BEFORE UPDATE ON "sessions"      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER accounts_set_updated_at     BEFORE UPDATE ON "accounts"      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER verifications_set_updated_at BEFORE UPDATE ON "verifications" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
