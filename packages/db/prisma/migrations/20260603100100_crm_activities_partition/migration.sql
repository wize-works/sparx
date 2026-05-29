-- Convert crm_activities to a native RANGE-partitioned table.
--
-- Phase 1 shipped crm_activities as a normal table (per the inline note in
-- 20260601000000_crm_module). Phase 5 calls for monthly partitioning + a
-- rollover scheduler. This migration is the conversion.
--
-- Strategy:
--   1. Stash the existing table as crm_activities_legacy.
--   2. Recreate crm_activities as PARTITION BY RANGE (occurred_at) with
--      the composite (id, occurred_at) primary key Postgres requires.
--   3. Recreate every index, FK, and RLS policy on the new partitioned
--      parent.
--   4. Create initial partitions for the months around the conversion
--      so inserts on day-of-deploy land somewhere valid.
--   5. Backfill rows from the legacy table (best-effort — Phase 1 data
--      is empty in prod; dev installs may carry stray rows). Drop legacy.
--
-- Future partitions land via ensure_crm_activities_partition() (the
-- SECURITY DEFINER helper from 20260603100000) called by the daily
-- /internal/crm/partition-rollover cron tick.

-- 1. Stash existing. Rename the table AND its primary-key constraint so
-- the constraint name `crm_activities_pkey` is free for the new
-- partitioned table to claim. Without this rename, the CREATE TABLE
-- below trips a "relation crm_activities_pkey already exists" error.
--
-- Indexes also need explicit renames: Postgres does NOT rename indexes
-- when their parent table is renamed (index names live in pg_class at
-- schema scope), so without these the CREATE INDEX statements below
-- trip "relation crm_activities_*_idx already exists".
ALTER TABLE "crm_activities" RENAME TO "crm_activities_legacy";
ALTER TABLE "crm_activities_legacy"
    RENAME CONSTRAINT "crm_activities_pkey" TO "crm_activities_legacy_pkey";
ALTER INDEX "crm_activities_tenant_id_customer_id_occurred_at_idx"
    RENAME TO "crm_activities_legacy_tenant_id_customer_id_occurred_at_idx";
ALTER INDEX "crm_activities_tenant_id_deal_id_occurred_at_idx"
    RENAME TO "crm_activities_legacy_tenant_id_deal_id_occurred_at_idx";
ALTER INDEX "crm_activities_tenant_id_b2b_account_id_occurred_at_idx"
    RENAME TO "crm_activities_legacy_tenant_id_b2b_account_id_occurred_at_idx";
ALTER INDEX "crm_activities_tenant_id_type_occurred_at_idx"
    RENAME TO "crm_activities_legacy_tenant_id_type_occurred_at_idx";
ALTER INDEX "crm_activities_tenant_id_occurred_at_idx"
    RENAME TO "crm_activities_legacy_tenant_id_occurred_at_idx";

-- 2. Recreate as partitioned. The PK must include the partition key.
CREATE TABLE "crm_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "deal_id" UUID,
    "b2b_account_id" UUID,
    "type" VARCHAR(63) NOT NULL,
    "description" TEXT,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "linked_entity_type" VARCHAR(63),
    "linked_entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "corrects_activity_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id", "occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- 3a. Indexes (Postgres creates these on every partition automatically
-- when CREATE INDEX is run on the partitioned parent).
CREATE INDEX "crm_activities_tenant_id_customer_id_occurred_at_idx"
    ON "crm_activities" ("tenant_id", "customer_id", "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_deal_id_occurred_at_idx"
    ON "crm_activities" ("tenant_id", "deal_id", "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_b2b_account_id_occurred_at_idx"
    ON "crm_activities" ("tenant_id", "b2b_account_id", "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_type_occurred_at_idx"
    ON "crm_activities" ("tenant_id", "type", "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_occurred_at_idx"
    ON "crm_activities" ("tenant_id", "occurred_at" DESC);

-- 3b. FKs (also cascade to partitions automatically).
ALTER TABLE "crm_activities"
    ADD CONSTRAINT "crm_activities_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "crm_activities_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "crm_activities_deal_id_fkey"
        FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "crm_activities_b2b_account_id_fkey"
        FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3c. RLS. Same policy template as everywhere else.
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_activities" FORCE  ROW LEVEL SECURITY;
CREATE POLICY crm_activities_tenant_isolation ON "crm_activities"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- 4. Initial partitions. Seed the current month and the next month so any
-- insert at any time-of-day on deploy lands somewhere valid. The daily
-- rollover cron then extends the runway forward.
SELECT ensure_crm_activities_partition(
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
);
SELECT ensure_crm_activities_partition(
    (date_trunc('month', CURRENT_DATE) + interval '1 month')::date,
    (date_trunc('month', CURRENT_DATE) + interval '2 months')::date
);

-- 5. Backfill from legacy. Dev installs occasionally hold rows from
-- earlier integration runs; prod is empty. Either way this is idempotent
-- — partitions accept the inserts because we just created them above.
-- Rows whose occurred_at falls outside the seeded window would fail; we
-- guard with a partition-creation pass for any out-of-range months too.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT date_trunc('month', occurred_at)::date AS month_start
    FROM crm_activities_legacy
  LOOP
    PERFORM ensure_crm_activities_partition(
      r.month_start,
      (r.month_start + interval '1 month')::date
    );
  END LOOP;
END $$;

INSERT INTO crm_activities (
    id, tenant_id, customer_id, deal_id, b2b_account_id, type, description,
    actor_id, actor_type, occurred_at, linked_entity_type, linked_entity_id,
    metadata, corrects_activity_id, created_at
)
SELECT
    id, tenant_id, customer_id, deal_id, b2b_account_id, type, description,
    actor_id, actor_type, occurred_at, linked_entity_type, linked_entity_id,
    metadata, corrects_activity_id, created_at
FROM crm_activities_legacy;

DROP TABLE "crm_activities_legacy";
