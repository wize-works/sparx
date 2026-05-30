-- Generalize fitment.
--
-- Replace VehicleMake / VehicleModel / VehicleEngine + ProductFitment's
-- vehicle-shaped columns with a domain-aware tree:
--   FitmentDomain → FitmentCategory → FitmentItem → FitmentVariant
-- plus ProductFitment that references {domain, category, item?, variant?,
-- rangeMin?, rangeMax?}.
--
-- The existing vehicle data is preserved by seeding a global FitmentDomain
-- (slug='vehicle') and migrating rows into it in-place. UUIDs are kept on
-- every row, so external FKs (none today, but defensive) survive the move.
--
-- This migration is *not* tenant-scoped. It runs once per environment and
-- mutates platform-seeded reference data. RLS comes back online for every
-- new table at the end (ENABLE + FORCE + tenant_isolation), except for
-- the four reference tables which support tenant_id IS NULL (global rows
-- visible to every tenant — same pattern the old vehicle tables used).

-- ─── 1. Create new tables ───────────────────────────────────────────────

CREATE TABLE "commerce_fitment_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "slug" VARCHAR(63) NOT NULL,
    "display_name" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "icon_key" VARCHAR(63),
    "labels" JSONB NOT NULL DEFAULT '{}',
    "range_unit" VARCHAR(20),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "commerce_fitment_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fitment_domains_tenant_slug_unique"
    ON "commerce_fitment_domains"("tenant_id", "slug");
CREATE INDEX "commerce_fitment_domains_tenant_id_idx"
    ON "commerce_fitment_domains"("tenant_id");

ALTER TABLE "commerce_fitment_domains"
    ADD CONSTRAINT "commerce_fitment_domains_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "commerce_fitment_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "domain_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "slug" VARCHAR(127) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "icon_media_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "commerce_fitment_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fitment_categories_domain_slug_unique"
    ON "commerce_fitment_categories"("domain_id", "slug");
CREATE INDEX "commerce_fitment_categories_tenant_id_idx"
    ON "commerce_fitment_categories"("tenant_id");
CREATE INDEX "commerce_fitment_categories_domain_id_idx"
    ON "commerce_fitment_categories"("domain_id");

ALTER TABLE "commerce_fitment_categories"
    ADD CONSTRAINT "commerce_fitment_categories_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commerce_fitment_categories"
    ADD CONSTRAINT "commerce_fitment_categories_domain_id_fkey"
    FOREIGN KEY ("domain_id") REFERENCES "commerce_fitment_domains"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "commerce_fitment_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "slug" VARCHAR(127) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "commerce_fitment_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fitment_items_category_slug_unique"
    ON "commerce_fitment_items"("category_id", "slug");
CREATE INDEX "commerce_fitment_items_tenant_id_idx"
    ON "commerce_fitment_items"("tenant_id");
CREATE INDEX "commerce_fitment_items_category_id_idx"
    ON "commerce_fitment_items"("category_id");

ALTER TABLE "commerce_fitment_items"
    ADD CONSTRAINT "commerce_fitment_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commerce_fitment_items"
    ADD CONSTRAINT "commerce_fitment_items_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "commerce_fitment_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "commerce_fitment_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "item_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "slug" VARCHAR(127) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "commerce_fitment_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fitment_variants_item_slug_unique"
    ON "commerce_fitment_variants"("item_id", "slug");
CREATE INDEX "commerce_fitment_variants_tenant_id_idx"
    ON "commerce_fitment_variants"("tenant_id");
CREATE INDEX "commerce_fitment_variants_item_id_idx"
    ON "commerce_fitment_variants"("item_id");

ALTER TABLE "commerce_fitment_variants"
    ADD CONSTRAINT "commerce_fitment_variants_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commerce_fitment_variants"
    ADD CONSTRAINT "commerce_fitment_variants_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "commerce_fitment_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2. Seed the global Vehicle domain ───────────────────────────────────

-- Fixed UUID so post-migration code can resolve the seed without a lookup.
-- (Sparx-only invariant; not a security boundary.)
INSERT INTO "commerce_fitment_domains" (
    "id", "tenant_id", "slug", "display_name", "description",
    "icon_key", "labels", "range_unit", "position", "updated_at"
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'vehicle',
    'Vehicle',
    'Automotive fitment — Make → Model → Engine, narrowable by year range.',
    'car',
    '{"l1":"Make","l2":"Model","l3":"Engine","range":"Year"}'::jsonb,
    'year',
    0,
    CURRENT_TIMESTAMP
);

-- ─── 3. Migrate VehicleMake → FitmentCategory (keep UUIDs) ───────────────

INSERT INTO "commerce_fitment_categories" (
    "id", "tenant_id", "domain_id", "name", "slug",
    "attributes", "icon_media_id", "position", "created_at", "updated_at"
)
SELECT
    m."id",
    m."tenant_id",
    '00000000-0000-0000-0000-000000000001',
    m."name",
    m."slug",
    jsonb_strip_nulls(jsonb_build_object('countryOfOrigin', m."country_of_origin")),
    m."logo_media_id",
    0,
    m."created_at",
    m."updated_at"
FROM "commerce_vehicle_makes" m;

-- ─── 4. Migrate VehicleModel → FitmentItem ───────────────────────────────

INSERT INTO "commerce_fitment_items" (
    "id", "tenant_id", "category_id", "name", "slug",
    "attributes", "position", "created_at", "updated_at"
)
SELECT
    mo."id",
    mo."tenant_id",
    mo."make_id",
    mo."name",
    mo."slug",
    jsonb_strip_nulls(jsonb_build_object('bodyStyle', mo."body_style")),
    0,
    mo."created_at",
    mo."updated_at"
FROM "commerce_vehicle_models" mo;

-- ─── 5. Migrate VehicleEngine → FitmentVariant ───────────────────────────

INSERT INTO "commerce_fitment_variants" (
    "id", "tenant_id", "item_id", "name", "slug",
    "attributes", "position", "created_at", "updated_at"
)
SELECT
    e."id",
    e."tenant_id",
    e."model_id",
    e."name",
    lower(regexp_replace(e."name", '[^a-zA-Z0-9]+', '-', 'g')),
    jsonb_strip_nulls(jsonb_build_object(
        'displacementCc', e."displacement_cc",
        'cylinders',      e."cylinders",
        'fuelType',       e."fuel_type",
        'aspiration',     e."aspiration"
    )),
    0,
    e."created_at",
    e."updated_at"
FROM "commerce_vehicle_engines" e;

-- ─── 6. Reshape ProductFitment in place ──────────────────────────────────

-- Drop old indexes that point at columns we're about to delete.
DROP INDEX IF EXISTS "commerce_product_fitments_tenant_id_make_id_idx";
DROP INDEX IF EXISTS "commerce_product_fitments_tenant_id_model_id_idx";
DROP INDEX IF EXISTS "commerce_product_fitments_tenant_id_engine_id_idx";
DROP INDEX IF EXISTS "commerce_product_fitments_tenant_id_year_min_year_max_idx";

-- Drop old FKs.
ALTER TABLE "commerce_product_fitments"
    DROP CONSTRAINT IF EXISTS "commerce_product_fitments_make_id_fkey";
ALTER TABLE "commerce_product_fitments"
    DROP CONSTRAINT IF EXISTS "commerce_product_fitments_model_id_fkey";
ALTER TABLE "commerce_product_fitments"
    DROP CONSTRAINT IF EXISTS "commerce_product_fitments_engine_id_fkey";

-- Add new columns nullable first so the backfill can populate them.
ALTER TABLE "commerce_product_fitments"
    ADD COLUMN "domain_id" UUID,
    ADD COLUMN "category_id" UUID,
    ADD COLUMN "item_id" UUID,
    ADD COLUMN "variant_id" UUID,
    ADD COLUMN "range_min" DECIMAL(12, 4),
    ADD COLUMN "range_max" DECIMAL(12, 4);

-- Backfill: every existing row is a vehicle fitment under the seed domain.
UPDATE "commerce_product_fitments"
SET
    "domain_id"   = '00000000-0000-0000-0000-000000000001',
    "category_id" = "make_id",
    "item_id"     = "model_id",
    "variant_id"  = "engine_id",
    "range_min"   = "year_min"::DECIMAL,
    "range_max"   = "year_max"::DECIMAL;

-- Now enforce NOT NULL on the required pair.
ALTER TABLE "commerce_product_fitments"
    ALTER COLUMN "domain_id" SET NOT NULL,
    ALTER COLUMN "category_id" SET NOT NULL;

-- New FKs.
ALTER TABLE "commerce_product_fitments"
    ADD CONSTRAINT "commerce_product_fitments_domain_id_fkey"
    FOREIGN KEY ("domain_id") REFERENCES "commerce_fitment_domains"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commerce_product_fitments"
    ADD CONSTRAINT "commerce_product_fitments_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "commerce_fitment_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commerce_product_fitments"
    ADD CONSTRAINT "commerce_product_fitments_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "commerce_fitment_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "commerce_product_fitments"
    ADD CONSTRAINT "commerce_product_fitments_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "commerce_fitment_variants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- New indexes.
CREATE INDEX "commerce_product_fitments_tenant_id_domain_id_category_id_idx"
    ON "commerce_product_fitments"("tenant_id", "domain_id", "category_id");
CREATE INDEX "commerce_product_fitments_tenant_id_item_id_idx"
    ON "commerce_product_fitments"("tenant_id", "item_id");
CREATE INDEX "commerce_product_fitments_tenant_id_variant_id_idx"
    ON "commerce_product_fitments"("tenant_id", "variant_id");
CREATE INDEX "commerce_product_fitments_tenant_id_range_min_range_max_idx"
    ON "commerce_product_fitments"("tenant_id", "range_min", "range_max");

-- Drop the old vehicle-shaped columns.
ALTER TABLE "commerce_product_fitments"
    DROP COLUMN "make_id",
    DROP COLUMN "model_id",
    DROP COLUMN "engine_id",
    DROP COLUMN "year_min",
    DROP COLUMN "year_max";

-- ─── 7. Drop the old vehicle reference tables ────────────────────────────

DROP TABLE "commerce_vehicle_engines";
DROP TABLE "commerce_vehicle_models";
DROP TABLE "commerce_vehicle_makes";

-- ─── 8. Row Level Security ───────────────────────────────────────────────
--
-- Per packages/db/scripts/rls-audit.ts: the four reference tables here
-- carry global rows (tenant_id IS NULL) shared across every tenant, so
-- they get ENABLE only (no FORCE) and an OR-clause policy that permits
-- both tenant-scoped and global reads. ProductFitment is per-tenant —
-- gets the standard ENABLE + FORCE + strict tenant_isolation policy.

ALTER TABLE "commerce_fitment_domains" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_or_global" ON "commerce_fitment_domains"
    USING ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id())
    WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id());

ALTER TABLE "commerce_fitment_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_or_global" ON "commerce_fitment_categories"
    USING ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id())
    WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id());

ALTER TABLE "commerce_fitment_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_or_global" ON "commerce_fitment_items"
    USING ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id())
    WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id());

ALTER TABLE "commerce_fitment_variants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_or_global" ON "commerce_fitment_variants"
    USING ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id())
    WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = current_tenant_id());
