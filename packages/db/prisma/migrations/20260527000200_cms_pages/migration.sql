-- CMS pages (docs/12 §3) — first module-owned table on top of the init
-- foundation. Tenant-scoped + FORCE RLS so a Prisma callsite that forgets
-- `withTenant()` returns nothing rather than leaking cross-tenant content.

CREATE TABLE "pages" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL,
    "slug"             VARCHAR(255) NOT NULL,
    "title"            VARCHAR(255) NOT NULL,
    "status"           VARCHAR(20)  NOT NULL DEFAULT 'draft',
    "content"          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "seo_title"        VARCHAR(255),
    "meta_description" TEXT,
    "published_at"     TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pages_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pages_tenant_id_slug_key" ON "pages" ("tenant_id", "slug");
CREATE INDEX "pages_tenant_id_status_idx"      ON "pages" ("tenant_id", "status");
CREATE INDEX "pages_tenant_id_updated_at_idx"  ON "pages" ("tenant_id", "updated_at" DESC);

CREATE TRIGGER pages_set_updated_at
    BEFORE UPDATE ON "pages"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS — same pattern as users / audit_logs.

ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pages" FORCE ROW LEVEL SECURITY;

CREATE POLICY pages_tenant_isolation ON "pages"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
