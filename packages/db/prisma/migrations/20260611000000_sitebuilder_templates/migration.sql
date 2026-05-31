-- Site Builder Phase 3 — layouts as templates.
-- See docs/30-sitebuilder-redesign.md §4 and docs/handoffs/sitebuilder-phase3-spec.md §3.
--
-- Introduces sitebuilder_templates and re-keys sitebuilder_sections from a bare
-- `page_key` string to a `template_id` FK. Per-tenant, RLS-aware backfill: one
-- template per distinct (tenant_id, page_key) — page_key='home' → (home,
-- default), every other key → a standalone (custom, <page_key>) layout
-- (doc 30 §4.1). The new table is ENABLE + FORCE RLS with a tenant_isolation
-- policy on current_tenant_id() (defined in 20260527000100_rls), mirroring the
-- other sitebuilder tables (20260608000000).

-- CreateTable
CREATE TABLE "sitebuilder_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "scope" VARCHAR(31) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitebuilder_templates_tenant_id_scope_key_key" ON "sitebuilder_templates"("tenant_id", "scope", "key");

-- CreateIndex
CREATE INDEX "sitebuilder_templates_tenant_id_scope_idx" ON "sitebuilder_templates"("tenant_id", "scope");

-- AddForeignKey
ALTER TABLE "sitebuilder_templates" ADD CONSTRAINT "sitebuilder_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Re-key sitebuilder_sections: add template_id (nullable first), backfill it
-- per tenant, enforce NOT NULL + FK, swap the index, and drop page_key.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "sitebuilder_sections" ADD COLUMN "template_id" UUID;

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill (RLS-aware) — one template per distinct (tenant_id, page_key) in
-- use, then point each section at it. sitebuilder_sections is FORCE RLS, so
-- even sparx_owner (the migration role) sees ZERO rows with app.tenant_id
-- unset (current_tenant_id() → NULL → no rows; the prior SET NOT NULL scan
-- then failed on the un-backfilled rows). Loop per tenant and set app.tenant_id
-- locally before each read/write — the same GUC withTenant sets, and the same
-- idiom as 20260610000000_tenant_brand. tenants has no RLS (dispatch table);
-- sitebuilder_templates has no RLS yet (enabled below), so its INSERT and the
-- UPDATE's join read are unconstrained — the per-tenant context only scopes the
-- sitebuilder_sections reads/writes.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id FROM "tenants" LOOP
        PERFORM set_config('app.tenant_id', t.id::text, true);

        INSERT INTO "sitebuilder_templates" ("id", "tenant_id", "scope", "key", "name", "created_at", "updated_at")
        SELECT gen_random_uuid(),
               d.tenant_id,
               CASE WHEN d.page_key = 'home' THEN 'home'    ELSE 'custom'   END,
               CASE WHEN d.page_key = 'home' THEN 'default' ELSE d.page_key END,
               CASE WHEN d.page_key = 'home' THEN 'Home'    ELSE d.page_key END,
               CURRENT_TIMESTAMP,
               CURRENT_TIMESTAMP
        FROM (SELECT DISTINCT tenant_id, page_key FROM "sitebuilder_sections") d;

        UPDATE "sitebuilder_sections" s
        SET "template_id" = tpl.id
        FROM "sitebuilder_templates" tpl
        WHERE tpl.tenant_id = s.tenant_id
          AND tpl.scope = CASE WHEN s.page_key = 'home' THEN 'home'    ELSE 'custom'   END
          AND tpl.key   = CASE WHEN s.page_key = 'home' THEN 'default' ELSE s.page_key END;
    END LOOP;

    PERFORM set_config('app.tenant_id', '', true);
END $$;

ALTER TABLE "sitebuilder_sections" ALTER COLUMN "template_id" SET NOT NULL;

DROP INDEX "sitebuilder_sections_tenant_id_page_key_position_idx";

ALTER TABLE "sitebuilder_sections" DROP COLUMN "page_key";

-- CreateIndex
CREATE INDEX "sitebuilder_sections_tenant_id_template_id_position_idx" ON "sitebuilder_sections"("tenant_id", "template_id", "position");

-- AddForeignKey
ALTER TABLE "sitebuilder_sections" ADD CONSTRAINT "sitebuilder_sections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sitebuilder_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation (ENABLE + FORCE) on the new table.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "sitebuilder_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_templates_tenant_isolation ON "sitebuilder_templates"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
