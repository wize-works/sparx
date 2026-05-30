-- Sitebuilder module — theme/layout/page composition + publish lifecycle.
-- See docs/29-sitebuilder-architecture.md.
--
-- Five tenant-scoped tables, all ENABLE + FORCE RLS with a tenant_isolation
-- policy on current_tenant_id() (defined in 20260527000100_rls). Plus a
-- find_due_site_publishes(int) SECURITY DEFINER scan so the in-process
-- scheduled-publish tick (sparx_app, FORCE RLS-bound) can find due schedules
-- across tenants without itself gaining RLS bypass — mirrors the CMS
-- scheduled-publish helper (20260601100000).

-- CreateTable
CREATE TABLE "sitebuilder_configs" (
    "tenant_id" UUID NOT NULL,
    "theme_key" VARCHAR(63) NOT NULL DEFAULT 'apex',
    "appearance_policy" VARCHAR(20) NOT NULL DEFAULT 'light-only',
    "draft_settings" JSONB NOT NULL DEFAULT '{}',
    "published_version_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_configs_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "sitebuilder_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "theme_key" VARCHAR(63) NOT NULL,
    "appearance_policy" VARCHAR(20) NOT NULL,
    "settings_snapshot" JSONB NOT NULL,
    "sections_snapshot" JSONB NOT NULL,
    "layout_snapshot" JSONB NOT NULL,
    "compiled_tokens" JSONB NOT NULL,
    "published_by_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sitebuilder_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitebuilder_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "page_key" VARCHAR(255) NOT NULL,
    "section_type" VARCHAR(63) NOT NULL,
    "position" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitebuilder_layout_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "slot" VARCHAR(31) NOT NULL,
    "navigation_menu_id" UUID,
    "config" JSONB NOT NULL DEFAULT '{}',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_layout_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitebuilder_publish_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "note" VARCHAR(500),
    "created_by_id" UUID,
    "processed_at" TIMESTAMPTZ,
    "result_version_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_publish_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitebuilder_configs_published_version_id_key" ON "sitebuilder_configs"("published_version_id");

-- CreateIndex
CREATE INDEX "sitebuilder_versions_tenant_id_created_at_idx" ON "sitebuilder_versions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sitebuilder_versions_tenant_id_version_number_key" ON "sitebuilder_versions"("tenant_id", "version_number");

-- CreateIndex
CREATE INDEX "sitebuilder_sections_tenant_id_page_key_position_idx" ON "sitebuilder_sections"("tenant_id", "page_key", "position");

-- CreateIndex
CREATE INDEX "sitebuilder_layout_blocks_tenant_id_idx" ON "sitebuilder_layout_blocks"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sitebuilder_layout_blocks_tenant_id_slot_key" ON "sitebuilder_layout_blocks"("tenant_id", "slot");

-- CreateIndex
CREATE INDEX "sitebuilder_publish_schedules_status_scheduled_at_idx" ON "sitebuilder_publish_schedules"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "sitebuilder_publish_schedules_tenant_id_scheduled_at_idx" ON "sitebuilder_publish_schedules"("tenant_id", "scheduled_at" DESC);

-- AddForeignKey
ALTER TABLE "sitebuilder_configs" ADD CONSTRAINT "sitebuilder_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitebuilder_configs" ADD CONSTRAINT "sitebuilder_configs_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "sitebuilder_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitebuilder_versions" ADD CONSTRAINT "sitebuilder_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitebuilder_sections" ADD CONSTRAINT "sitebuilder_sections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitebuilder_layout_blocks" ADD CONSTRAINT "sitebuilder_layout_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitebuilder_layout_blocks" ADD CONSTRAINT "sitebuilder_layout_blocks_navigation_menu_id_fkey" FOREIGN KEY ("navigation_menu_id") REFERENCES "navigation_menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitebuilder_publish_schedules" ADD CONSTRAINT "sitebuilder_publish_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation (ENABLE + FORCE) on all five tables.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "sitebuilder_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_configs_tenant_isolation ON "sitebuilder_configs"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "sitebuilder_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_versions_tenant_isolation ON "sitebuilder_versions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "sitebuilder_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_sections_tenant_isolation ON "sitebuilder_sections"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "sitebuilder_layout_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_layout_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_layout_blocks_tenant_isolation ON "sitebuilder_layout_blocks"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "sitebuilder_publish_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_publish_schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_publish_schedules_tenant_isolation ON "sitebuilder_publish_schedules"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- Scheduled-publish scan. SECURITY DEFINER (owned by sparx_owner) so the
-- in-process tick running as sparx_app can find due schedules across tenants
-- without RLS bypass; per-row publish still rides withTenant(). Mirrors
-- find_due_scheduled_entries (20260601100000).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION find_due_site_publishes(p_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  scheduled_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT id, tenant_id, scheduled_at
  FROM sitebuilder_publish_schedules
  WHERE status = 'pending'
    AND scheduled_at <= NOW()
  ORDER BY scheduled_at ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION find_due_site_publishes(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_due_site_publishes(int) TO sparx_app;

COMMENT ON FUNCTION find_due_site_publishes IS
  'Returns up to p_limit sitebuilder publish schedules with status=pending whose scheduled_at <= NOW(). SECURITY DEFINER (sparx_owner) so the tick scans across tenants without sparx_app having RLS bypass.';
