-- External API keys (docs/07 §5).
--
-- Issued via the dashboard's AI Integrations page; verified at the MCP
-- transport's auth boundary. Hash is Argon2id of the key suffix; the
-- 12-char `key_prefix` (sk_live_xxxx) is stored separately so verification
-- can do a single row lookup before the expensive hash compare.

CREATE TABLE "api_keys" (
    "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"           UUID         NOT NULL,
    "name"                VARCHAR(120) NOT NULL,
    "key_prefix"          VARCHAR(16)  NOT NULL,
    "key_hash"            TEXT         NOT NULL,
    "scopes"              TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at"          TIMESTAMPTZ,
    "last_used_at"        TIMESTAMPTZ,
    "revoked_at"          TIMESTAMPTZ,
    "created_by_user_id"  UUID,
    "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_keys" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys" ("key_prefix");
CREATE        INDEX "api_keys_tenant_id_idx"  ON "api_keys" ("tenant_id");
CREATE        INDEX "api_keys_tenant_id_revoked_at_idx" ON "api_keys" ("tenant_id", "revoked_at");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS. Same template as the CRM tables — FORCE so even a connection running
-- as the table owner can't bypass tenant scoping by accident.
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE  ROW LEVEL SECURITY;
CREATE POLICY api_keys_tenant_isolation ON "api_keys"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
