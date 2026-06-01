-- Site Builder P-C — layout assignment (docs/36 §6, docs/handoffs/sitebuilder-pc-spec.md).
--
-- Two SB-owned tables: the per-target tenant default (sitebuilder_layout_defaults)
-- and the per-item override (sitebuilder_layout_assignments). Both reference a
-- PageLayout (ON DELETE CASCADE — deleting a layout drops its assignments) and
-- carry ENABLE+FORCE RLS with a tenant_isolation policy on current_tenant_id()
-- (defined in 20260527000100_rls), mirroring the other sitebuilder tables.
-- Additive, no backfill: a tenant with no rows resolves to the target's default
-- layout (today's behavior).

-- CreateTable
CREATE TABLE "sitebuilder_layout_defaults" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "target_id" VARCHAR(63) NOT NULL,
    "page_layout_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_layout_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitebuilder_layout_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "target_id" VARCHAR(63) NOT NULL,
    "item_ref" VARCHAR(255) NOT NULL,
    "page_layout_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sitebuilder_layout_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sitebuilder_layout_defaults_tenant_id_target_id_key" ON "sitebuilder_layout_defaults"("tenant_id", "target_id");
CREATE INDEX "sitebuilder_layout_defaults_tenant_id_idx" ON "sitebuilder_layout_defaults"("tenant_id");
CREATE UNIQUE INDEX "sitebuilder_layout_assignments_tenant_id_target_id_item_ref_key" ON "sitebuilder_layout_assignments"("tenant_id", "target_id", "item_ref");
CREATE INDEX "sitebuilder_layout_assignments_tenant_id_target_id_idx" ON "sitebuilder_layout_assignments"("tenant_id", "target_id");

-- AddForeignKey
ALTER TABLE "sitebuilder_layout_defaults" ADD CONSTRAINT "sitebuilder_layout_defaults_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sitebuilder_layout_defaults" ADD CONSTRAINT "sitebuilder_layout_defaults_page_layout_id_fkey" FOREIGN KEY ("page_layout_id") REFERENCES "sitebuilder_page_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sitebuilder_layout_assignments" ADD CONSTRAINT "sitebuilder_layout_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sitebuilder_layout_assignments" ADD CONSTRAINT "sitebuilder_layout_assignments_page_layout_id_fkey" FOREIGN KEY ("page_layout_id") REFERENCES "sitebuilder_page_layouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security — tenant isolation (ENABLE + FORCE) on both tables.
ALTER TABLE "sitebuilder_layout_defaults" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_layout_defaults" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_layout_defaults_tenant_isolation ON "sitebuilder_layout_defaults"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "sitebuilder_layout_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sitebuilder_layout_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY sitebuilder_layout_assignments_tenant_isolation ON "sitebuilder_layout_assignments"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
