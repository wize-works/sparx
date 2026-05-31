-- Tenant brand — the platform-wide source of truth for brand identity (docs/30 §6).
--
-- One tenant-scoped table, ENABLE + FORCE RLS with a tenant_isolation policy on
-- current_tenant_id() (defined in 20260527000100_rls). Brand is owned ABOVE
-- every module: it survives module gating and is read-only to consumers.
--
-- This migration is ADDITIVE. It creates tenant_brands and backfills it from the
-- existing fragmented sources (Commerce StorefrontTheme logo/favicon/palette/
-- fonts, tenants.name, EmailSettings.branding_override). The source columns are
-- LEFT IN PLACE — a later migration drops them once every reader is rewired to
-- brand (deploy-small: additive first, the destructive drop after the code
-- cutover, so no deployed image ever reads a column that has gone away).
--
-- Backfill note: commerce_storefront_themes and email_settings are FORCE RLS,
-- so even the migration role cannot read them cross-tenant with app.tenant_id
-- unset (current_tenant_id() → NULL → no rows). The backfill therefore loops
-- per tenant and sets app.tenant_id locally before each read — the same GUC the
-- app sets via withTenant. tenants itself has no RLS (the dispatch table).

-- CreateTable
CREATE TABLE "tenant_brands" (
    "tenant_id" UUID NOT NULL,
    "business_name" VARCHAR(255),
    "tagline" VARCHAR(255),
    "logo_light_media_id" UUID,
    "logo_dark_media_id" UUID,
    "favicon_media_id" UUID,
    "color_primary" VARCHAR(7),
    "color_primary_foreground" VARCHAR(7),
    "color_accent" VARCHAR(7),
    "font_heading" VARCHAR(127),
    "font_body" VARCHAR(127),
    "socials" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_brands_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "tenant_brands" ADD CONSTRAINT "tenant_brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill — one brand row per tenant, consolidating the fragmented sources.
-- Runs BEFORE RLS is enabled on tenant_brands (so the INSERT is unconstrained),
-- but sets app.tenant_id per tenant so the FORCE-RLS source tables are visible.
-- StorefrontTheme wins over the email branding_override (mirrors the old
-- resolveEmailBrand priority); business_name comes from tenants.name.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id, name FROM "tenants" LOOP
        PERFORM set_config('app.tenant_id', t.id::text, true);

        INSERT INTO "tenant_brands" (
            "tenant_id", "business_name",
            "logo_light_media_id", "logo_dark_media_id", "favicon_media_id",
            "color_primary", "color_primary_foreground", "color_accent",
            "font_heading", "font_body",
            "created_at", "updated_at"
        )
        SELECT
            t.id,
            t.name,
            COALESCE(st.logo_media_id, NULLIF(es.branding_override->>'logoMediaId', '')::uuid),
            st.logo_dark_media_id,
            st.favicon_media_id,
            COALESCE(st.color_primary, NULLIF(es.branding_override->'colors'->>'primary', '')),
            st.color_primary_foreground,
            st.color_accent,
            st.font_heading,
            st.font_body,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM (SELECT 1) AS _one
        LEFT JOIN "commerce_storefront_themes" st ON st.tenant_id = t.id
        LEFT JOIN "email_settings" es ON es.tenant_id = t.id;
    END LOOP;

    PERFORM set_config('app.tenant_id', '', true);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation (ENABLE + FORCE). Mirrors
-- 20260527000100_rls / 20260609000000_email_module.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "tenant_brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_brands" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_brands_tenant_isolation ON "tenant_brands"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- Align updated_at with Prisma's @updatedAt convention (drop the table-level
-- DEFAULT; the client sets updated_at on every write). Without this,
-- `prisma migrate diff` flags drift.
ALTER TABLE "tenant_brands" ALTER COLUMN "updated_at" DROP DEFAULT;
