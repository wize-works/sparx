-- Site Builder P-B — target registry (docs/36 §4, docs/handoffs/sitebuilder-pb-spec.md).
--
-- Generalizes the fixed `scope` enum to data-driven target ids. Three things in
-- one migration (all on a zero-real-merchant DB):
--   1. The physical rename deferred from P-A: sitebuilder_templates →
--      sitebuilder_page_layouts and sitebuilder_sections.template_id →
--      page_layout_id (+ their indexes/constraints/policy — Postgres does NOT
--      auto-rename these on ALTER TABLE RENAME).
--   2. scope → target_id (widen VARCHAR(31) → VARCHAR(63)) + re-key the stored
--      draft PageLayout values to namespaced target ids.
--   3. Rewrite the immutable sections_snapshot JSON on every SiteVersion so each
--      element's `scope` becomes a `targetId` (full re-key, no compat shim —
--      owner decision 2026-05-31). Pre-3.0 elements (no `scope`) are left as-is;
--      the storefront's orthogonal pageKey→target fallback still covers them.
--
-- The DATA updates (#2 value re-key, #3 snapshot rewrite) touch FORCE-RLS tables
-- (sitebuilder_page_layouts, sitebuilder_versions). The migration role in prod
-- (sparx_owner) is NON-superuser, so a bare UPDATE sees ZERO rows unless
-- app.tenant_id is set — same idiom as 20260611000000_sitebuilder_templates and
-- 20260610000000_tenant_brand. So they run inside a per-tenant DO loop. The DDL
-- (#1) is not row-filtered and runs once, up front.

-- ─────────────────────────────────────────────────────────────────────────
-- 1 + 2 (DDL): physical rename + scope → target_id (widen). Rename every
--     dependent object to the name Prisma expects for the renamed model/fields.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "sitebuilder_templates" RENAME TO "sitebuilder_page_layouts";
ALTER TABLE "sitebuilder_page_layouts" RENAME CONSTRAINT "sitebuilder_templates_pkey" TO "sitebuilder_page_layouts_pkey";
ALTER TABLE "sitebuilder_page_layouts" RENAME CONSTRAINT "sitebuilder_templates_tenant_id_fkey" TO "sitebuilder_page_layouts_tenant_id_fkey";

ALTER TABLE "sitebuilder_page_layouts" RENAME COLUMN "scope" TO "target_id";
ALTER TABLE "sitebuilder_page_layouts" ALTER COLUMN "target_id" TYPE VARCHAR(63);

ALTER INDEX "sitebuilder_templates_tenant_id_scope_key_key" RENAME TO "sitebuilder_page_layouts_tenant_id_target_id_key_key";
ALTER INDEX "sitebuilder_templates_tenant_id_scope_idx" RENAME TO "sitebuilder_page_layouts_tenant_id_target_id_idx";

ALTER POLICY "sitebuilder_templates_tenant_isolation" ON "sitebuilder_page_layouts" RENAME TO "sitebuilder_page_layouts_tenant_isolation";

-- sitebuilder_sections.template_id → page_layout_id (+ its index + FK).
ALTER TABLE "sitebuilder_sections" RENAME COLUMN "template_id" TO "page_layout_id";
ALTER INDEX "sitebuilder_sections_tenant_id_template_id_position_idx" RENAME TO "sitebuilder_sections_tenant_id_page_layout_id_position_idx";
ALTER TABLE "sitebuilder_sections" RENAME CONSTRAINT "sitebuilder_sections_template_id_fkey" TO "sitebuilder_sections_page_layout_id_fkey";

-- ─────────────────────────────────────────────────────────────────────────
-- 3 (DATA, RLS-aware): re-key draft values + rewrite snapshot JSON, per tenant.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id FROM "tenants" LOOP
        PERFORM set_config('app.tenant_id', t.id::text, true);

        -- Re-key the draft PageLayout target ids.
        UPDATE "sitebuilder_page_layouts" SET "target_id" = CASE "target_id"
            WHEN 'home'       THEN 'site:home'
            WHEN 'product'    THEN 'commerce:product'
            WHEN 'collection' THEN 'commerce:collection'
            WHEN 'cms-page'   THEN 'cms:content-page'
            WHEN 'custom'     THEN 'cms:content-page'
            ELSE "target_id"
        END;

        -- Rewrite each SiteVersion's sections_snapshot: element `scope` → `targetId`
        -- (re-keyed). Leave pre-3.0 elements (no `scope`) untouched. Order preserved.
        UPDATE "sitebuilder_versions" v SET "sections_snapshot" = (
            SELECT COALESCE(
                jsonb_agg(
                    CASE WHEN jsonb_exists(e, 'scope')
                        THEN (e - 'scope') || jsonb_build_object('targetId', CASE e->>'scope'
                            WHEN 'home'       THEN 'site:home'
                            WHEN 'product'    THEN 'commerce:product'
                            WHEN 'collection' THEN 'commerce:collection'
                            WHEN 'cms-page'   THEN 'cms:content-page'
                            WHEN 'custom'     THEN 'cms:content-page'
                            ELSE e->>'scope'
                        END)
                        ELSE e
                    END
                    ORDER BY ord
                ),
                '[]'::jsonb
            )
            FROM jsonb_array_elements(v."sections_snapshot") WITH ORDINALITY AS arr(e, ord)
        )
        WHERE jsonb_typeof(v."sections_snapshot") = 'array';
    END LOOP;

    PERFORM set_config('app.tenant_id', '', true);
END $$;
