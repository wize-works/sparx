-- Saved themes — the tenant's own NAMED presentation variants (docs/36
-- Brand+Theme tier). One tenant-scoped table, ENABLE + FORCE RLS with a
-- tenant_isolation policy on current_tenant_id() (defined in 20260527000100_rls).
-- Distinct from the read-only platform presets, which stay code-first in
-- @sparx/storefront-themes. Also adds an optional theme_id to the publish
-- schedule so a scheduled publish can apply a saved theme to the draft first
-- (seasonal / holiday swaps).
--
-- ADDITIVE + non-destructive: a new empty table + a nullable column. No backfill,
-- so no per-tenant app.tenant_id loop is needed (cf. 20260610000000_tenant_brand).

-- CreateTable
CREATE TABLE "sitebuilder_themes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "base_preset_key" VARCHAR(63) NOT NULL,
    "presentation" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitebuilder_themes_tenant_id_name_key" ON "sitebuilder_themes"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "sitebuilder_themes_tenant_id_idx" ON "sitebuilder_themes"("tenant_id");

-- AddForeignKey
ALTER TABLE "sitebuilder_themes" ADD CONSTRAINT "sitebuilder_themes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable — scheduled publish may apply a saved theme first (nullable; the FK
-- nulls out if the saved theme is later deleted).
ALTER TABLE "sitebuilder_publish_schedules" ADD COLUMN "theme_id" UUID;
ALTER TABLE "sitebuilder_publish_schedules" ADD CONSTRAINT "sitebuilder_publish_schedules_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "sitebuilder_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation (ENABLE + FORCE). Mirrors
-- 20260527000100_rls / 20260610000000_tenant_brand.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "sitebuilder_themes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_themes" FORCE  ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_themes_tenant_isolation ON "sitebuilder_themes"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- Align updated_at with Prisma's @updatedAt convention (the client sets it on
-- every write; no DB default). Keeps `prisma migrate diff` clean.
ALTER TABLE "sitebuilder_themes" ALTER COLUMN "updated_at" DROP DEFAULT;
