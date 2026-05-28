-- Sparx CRM — module schema (docs/11-crm-prd.md, docs/05-data-model.md).
--
-- This migration introduces the shared customer-intelligence spine that
-- Commerce and B2B will later FK into rather than redefining. The CRM owns
-- the customer record; everything else hangs off it. See the locked
-- architectural commitments in memory/feedback_crm_architecture.md.
--
-- Conventions followed:
--   • Every tenant-scoped table gets ENABLE + FORCE ROW LEVEL SECURITY with a
--     tenant_isolation policy that filters on current_tenant_id() (defined in
--     20260527000100_rls). FORCE closes the BYPASSRLS hole per Decision F3.
--   • updated_at columns DROP DEFAULT after CREATE TABLE because Prisma manages
--     them with @updatedAt — leaving the table-level default in place causes
--     `prisma migrate diff` to flag drift on every subsequent run.
--   • crm_activities ships as a NORMAL (non-partitioned) table in Phase 1; the
--     append-only contract is enforced at the service layer (activityService
--     never issues UPDATE). Native RANGE partitioning by month + a rollover
--     scheduler land together in Phase 5 — converting later is a routine
--     pg_partman attach operation, no schema change required.
--   • deal_orders.order_id and deal_quotes.quote_id are uuid columns without
--     FK constraints — the orders/quotes tables ship with Commerce/B2B. The
--     FKs are added in a follow-up migration once those tables exist. The
--     join tables are empty in production until then. This is the locked
--     decision #5 architecture: deals never get a deal_id column on orders.

-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

-- customers ----------------------------------------------------------------

CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'prospect',
    "auth_user_id" UUID,
    "b2b_account_id" UUID,
    "assigned_rep_id" UUID,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "company" VARCHAR(255),
    "job_title" VARCHAR(255),
    "preferred_contact_method" VARCHAR(20),
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "gdpr_consent" JSONB NOT NULL DEFAULT '{}',
    "tags" VARCHAR(63)[] DEFAULT ARRAY[]::VARCHAR(63)[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "first_order_at" TIMESTAMPTZ,
    "last_order_at" TIMESTAMPTZ,
    "merged_into_customer_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- customer_addresses -------------------------------------------------------

CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "label" VARCHAR(120),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "recipient_name" VARCHAR(255),
    "company" VARCHAR(255),
    "line1" VARCHAR(255) NOT NULL,
    "line2" VARCHAR(255),
    "city" VARCHAR(120) NOT NULL,
    "region" VARCHAR(120),
    "postal_code" VARCHAR(32),
    "country" VARCHAR(2) NOT NULL,
    "phone" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- b2b_accounts -------------------------------------------------------------

CREATE TABLE "b2b_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "assigned_rep_id" UUID,
    "company_name" VARCHAR(255) NOT NULL,
    "tax_id" VARCHAR(64),
    "website" VARCHAR(2048),
    "pricing_tier" VARCHAR(63),
    "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_used" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_terms" VARCHAR(20),
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "fleet_size" INTEGER,
    "engine_profiles" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "tags" VARCHAR(63)[] DEFAULT ARRAY[]::VARCHAR(63)[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "b2b_accounts_pkey" PRIMARY KEY ("id")
);

-- pipelines ----------------------------------------------------------------

CREATE TABLE "pipelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- pipeline_stages ----------------------------------------------------------

CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "probability" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "stage_type" VARCHAR(20) NOT NULL DEFAULT 'open',
    "color" VARCHAR(9),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- deals --------------------------------------------------------------------

CREATE TABLE "deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "customer_id" UUID,
    "b2b_account_id" UUID,
    "assigned_rep_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "probability" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "expected_close_date" DATE,
    "closed_at" TIMESTAMPTZ,
    "closed_reason" VARCHAR(500),
    "source" VARCHAR(63),
    "tags" VARCHAR(63)[] DEFAULT ARRAY[]::VARCHAR(63)[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- deal_orders --------------------------------------------------------------

CREATE TABLE "deal_orders" (
    "deal_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_orders_pkey" PRIMARY KEY ("deal_id","order_id")
);

-- deal_quotes --------------------------------------------------------------

CREATE TABLE "deal_quotes" (
    "deal_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_quotes_pkey" PRIMARY KEY ("deal_id","quote_id")
);

-- crm_activities -----------------------------------------------------------
-- Append-only event log. The service layer (activityService.record) is the
-- single write path; it never issues UPDATE. Edits create a new row with
-- corrects_activity_id pointing at the original.

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
    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- tasks --------------------------------------------------------------------

CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "completed_by_user_id" UUID,
    "customer_id" UUID,
    "deal_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ,
    "priority" VARCHAR(10) NOT NULL DEFAULT 'medium',
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- segments -----------------------------------------------------------------

CREATE TABLE "segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "color" VARCHAR(9),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- segment_members ----------------------------------------------------------
-- Materialized membership table written by the segment-evaluator consumer
-- (Phase 4). Email broadcasts and dashboard filters join this table rather
-- than re-evaluating rules at query time — locked decision #4.

CREATE TABLE "segment_members" (
    "segment_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DECIMAL(10,4),
    CONSTRAINT "segment_members_pkey" PRIMARY KEY ("segment_id","customer_id")
);

-- saved_views --------------------------------------------------------------

CREATE TABLE "saved_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "target" VARCHAR(63) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX "customers_tenant_id_type_idx"             ON "customers"("tenant_id", "type");
CREATE INDEX "customers_tenant_id_assigned_rep_id_idx"  ON "customers"("tenant_id", "assigned_rep_id");
CREATE INDEX "customers_tenant_id_b2b_account_id_idx"   ON "customers"("tenant_id", "b2b_account_id");
CREATE INDEX "customers_tenant_id_last_order_at_idx"    ON "customers"("tenant_id", "last_order_at" DESC);
CREATE INDEX "customers_tenant_id_total_spent_idx"      ON "customers"("tenant_id", "total_spent" DESC);
CREATE INDEX "customers_tenant_id_updated_at_idx"       ON "customers"("tenant_id", "updated_at" DESC);
CREATE INDEX "customers_auth_user_id_idx"               ON "customers"("auth_user_id");
CREATE UNIQUE INDEX "customers_tenant_email_unique"     ON "customers"("tenant_id", "email");

CREATE INDEX "customer_addresses_tenant_id_customer_id_idx" ON "customer_addresses"("tenant_id", "customer_id");

CREATE INDEX "b2b_accounts_tenant_id_status_idx"           ON "b2b_accounts"("tenant_id", "status");
CREATE INDEX "b2b_accounts_tenant_id_assigned_rep_id_idx"  ON "b2b_accounts"("tenant_id", "assigned_rep_id");
CREATE INDEX "b2b_accounts_tenant_id_updated_at_idx"       ON "b2b_accounts"("tenant_id", "updated_at" DESC);

CREATE INDEX "pipelines_tenant_id_archived_at_idx"   ON "pipelines"("tenant_id", "archived_at");
CREATE UNIQUE INDEX "pipelines_tenant_id_slug_key"   ON "pipelines"("tenant_id", "slug");

CREATE INDEX "pipeline_stages_tenant_id_pipeline_id_idx"        ON "pipeline_stages"("tenant_id", "pipeline_id");
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_sort_order_key" ON "pipeline_stages"("pipeline_id", "sort_order");

CREATE INDEX "deals_tenant_id_pipeline_id_stage_id_idx"     ON "deals"("tenant_id", "pipeline_id", "stage_id");
CREATE INDEX "deals_tenant_id_assigned_rep_id_stage_id_idx" ON "deals"("tenant_id", "assigned_rep_id", "stage_id");
CREATE INDEX "deals_tenant_id_customer_id_idx"              ON "deals"("tenant_id", "customer_id");
CREATE INDEX "deals_tenant_id_b2b_account_id_idx"           ON "deals"("tenant_id", "b2b_account_id");
CREATE INDEX "deals_tenant_id_expected_close_date_idx"      ON "deals"("tenant_id", "expected_close_date");
CREATE INDEX "deals_tenant_id_closed_at_idx"                ON "deals"("tenant_id", "closed_at");
CREATE INDEX "deals_tenant_id_updated_at_idx"               ON "deals"("tenant_id", "updated_at" DESC);

CREATE INDEX "deal_orders_tenant_id_order_id_idx" ON "deal_orders"("tenant_id", "order_id");
CREATE INDEX "deal_quotes_tenant_id_quote_id_idx" ON "deal_quotes"("tenant_id", "quote_id");

CREATE INDEX "crm_activities_tenant_id_customer_id_occurred_at_idx"     ON "crm_activities"("tenant_id", "customer_id",     "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_deal_id_occurred_at_idx"         ON "crm_activities"("tenant_id", "deal_id",         "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_b2b_account_id_occurred_at_idx"  ON "crm_activities"("tenant_id", "b2b_account_id",  "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_type_occurred_at_idx"            ON "crm_activities"("tenant_id", "type",            "occurred_at" DESC);
CREATE INDEX "crm_activities_tenant_id_occurred_at_idx"                 ON "crm_activities"("tenant_id",                    "occurred_at" DESC);

CREATE INDEX "tasks_tenant_id_assigned_to_user_id_status_due_at_idx" ON "tasks"("tenant_id", "assigned_to_user_id", "status", "due_at");
CREATE INDEX "tasks_tenant_id_due_at_idx"      ON "tasks"("tenant_id", "due_at");
CREATE INDEX "tasks_tenant_id_customer_id_idx" ON "tasks"("tenant_id", "customer_id");
CREATE INDEX "tasks_tenant_id_deal_id_idx"     ON "tasks"("tenant_id", "deal_id");

CREATE INDEX "segments_tenant_id_archived_at_idx" ON "segments"("tenant_id", "archived_at");
CREATE UNIQUE INDEX "segments_tenant_id_slug_key" ON "segments"("tenant_id", "slug");

CREATE INDEX "segment_members_tenant_id_segment_id_entered_at_idx" ON "segment_members"("tenant_id", "segment_id", "entered_at" DESC);
CREATE INDEX "segment_members_tenant_id_customer_id_idx"           ON "segment_members"("tenant_id", "customer_id");

CREATE INDEX "saved_views_tenant_id_target_owner_user_id_idx" ON "saved_views"("tenant_id", "target", "owner_user_id");

-- ─────────────────────────────────────────────────────────────────────────
-- Foreign keys
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "customers"
    ADD CONSTRAINT "customers_tenant_id_fkey"               FOREIGN KEY ("tenant_id")               REFERENCES "tenants"("id")    ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "customers_b2b_account_id_fkey"          FOREIGN KEY ("b2b_account_id")          REFERENCES "b2b_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "customers_assigned_rep_id_fkey"         FOREIGN KEY ("assigned_rep_id")         REFERENCES "users"("id")      ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "customers_merged_into_customer_id_fkey" FOREIGN KEY ("merged_into_customer_id") REFERENCES "customers"("id")  ON DELETE SET NULL ON UPDATE CASCADE;

-- customers.auth_user_id intentionally has NO FK constraint — see schema
-- comment. Will be added in a follow-up migration when the customer-auth
-- layer table ships.

ALTER TABLE "customer_addresses"
    ADD CONSTRAINT "customer_addresses_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "b2b_accounts"
    ADD CONSTRAINT "b2b_accounts_tenant_id_fkey"       FOREIGN KEY ("tenant_id")       REFERENCES "tenants"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "b2b_accounts_assigned_rep_id_fkey" FOREIGN KEY ("assigned_rep_id") REFERENCES "users"("id")   ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pipelines"
    ADD CONSTRAINT "pipelines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deals"
    ADD CONSTRAINT "deals_tenant_id_fkey"        FOREIGN KEY ("tenant_id")        REFERENCES "tenants"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "deals_pipeline_id_fkey"      FOREIGN KEY ("pipeline_id")      REFERENCES "pipelines"("id")      ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "deals_stage_id_fkey"         FOREIGN KEY ("stage_id")         REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "deals_customer_id_fkey"      FOREIGN KEY ("customer_id")      REFERENCES "customers"("id")      ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "deals_b2b_account_id_fkey"   FOREIGN KEY ("b2b_account_id")   REFERENCES "b2b_accounts"("id")   ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "deals_assigned_rep_id_fkey"  FOREIGN KEY ("assigned_rep_id")  REFERENCES "users"("id")          ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deal_orders"
    ADD CONSTRAINT "deal_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "deal_orders_deal_id_fkey"   FOREIGN KEY ("deal_id")   REFERENCES "deals"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
-- deal_orders.order_id FK pending Commerce module — see header comment.

ALTER TABLE "deal_quotes"
    ADD CONSTRAINT "deal_quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "deal_quotes_deal_id_fkey"   FOREIGN KEY ("deal_id")   REFERENCES "deals"("id")   ON DELETE CASCADE ON UPDATE CASCADE;
-- deal_quotes.quote_id FK pending B2B module — see header comment.

ALTER TABLE "crm_activities"
    ADD CONSTRAINT "crm_activities_tenant_id_fkey"     FOREIGN KEY ("tenant_id")     REFERENCES "tenants"("id")     ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "crm_activities_customer_id_fkey"   FOREIGN KEY ("customer_id")   REFERENCES "customers"("id")   ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "crm_activities_deal_id_fkey"       FOREIGN KEY ("deal_id")       REFERENCES "deals"("id")       ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "crm_activities_b2b_account_id_fkey" FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_tenant_id_fkey"            FOREIGN KEY ("tenant_id")            REFERENCES "tenants"("id")    ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "tasks_assigned_to_user_id_fkey"  FOREIGN KEY ("assigned_to_user_id")  REFERENCES "users"("id")      ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "tasks_created_by_user_id_fkey"   FOREIGN KEY ("created_by_user_id")   REFERENCES "users"("id")      ON DELETE CASCADE  ON UPDATE CASCADE,
    ADD CONSTRAINT "tasks_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id")      ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "tasks_customer_id_fkey"          FOREIGN KEY ("customer_id")          REFERENCES "customers"("id")  ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "tasks_deal_id_fkey"              FOREIGN KEY ("deal_id")              REFERENCES "deals"("id")      ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "segments"
    ADD CONSTRAINT "segments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "segment_members"
    ADD CONSTRAINT "segment_members_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "segment_members_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "segment_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_views"
    ADD CONSTRAINT "saved_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — every CRM table is tenant-scoped
-- ─────────────────────────────────────────────────────────────────────────
-- Follows the convention from 20260527000100_rls: ENABLE + FORCE, policy
-- on tenant_id = current_tenant_id(). FORCE means even sparx_owner cannot
-- bypass — Decision F3 in docs/16 §4. The locked decision #6 architecture
-- (Pub/Sub subscribers only registered for active tenants) is enforced in
-- the application layer; the database layer is the backstop.

ALTER TABLE "customers"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers"          FORCE  ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_isolation ON "customers"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_addresses" FORCE  ROW LEVEL SECURITY;
CREATE POLICY customer_addresses_tenant_isolation ON "customer_addresses"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "b2b_accounts"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "b2b_accounts"       FORCE  ROW LEVEL SECURITY;
CREATE POLICY b2b_accounts_tenant_isolation ON "b2b_accounts"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "pipelines"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipelines"          FORCE  ROW LEVEL SECURITY;
CREATE POLICY pipelines_tenant_isolation ON "pipelines"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "pipeline_stages"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_stages"    FORCE  ROW LEVEL SECURITY;
CREATE POLICY pipeline_stages_tenant_isolation ON "pipeline_stages"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "deals"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deals"              FORCE  ROW LEVEL SECURITY;
CREATE POLICY deals_tenant_isolation ON "deals"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "deal_orders"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_orders"        FORCE  ROW LEVEL SECURITY;
CREATE POLICY deal_orders_tenant_isolation ON "deal_orders"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "deal_quotes"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_quotes"        FORCE  ROW LEVEL SECURITY;
CREATE POLICY deal_quotes_tenant_isolation ON "deal_quotes"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "crm_activities"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_activities"     FORCE  ROW LEVEL SECURITY;
CREATE POLICY crm_activities_tenant_isolation ON "crm_activities"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "tasks"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks"              FORCE  ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant_isolation ON "tasks"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "segments"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "segments"           FORCE  ROW LEVEL SECURITY;
CREATE POLICY segments_tenant_isolation ON "segments"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "segment_members"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "segment_members"    FORCE  ROW LEVEL SECURITY;
CREATE POLICY segment_members_tenant_isolation ON "segment_members"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "saved_views"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_views"        FORCE  ROW LEVEL SECURITY;
CREATE POLICY saved_views_tenant_isolation ON "saved_views"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- Align updated_at columns with Prisma's @updatedAt convention.
-- Drop the table-level DEFAULT now that the tables are created; Prisma's
-- generated client will set updated_at on every write. Without this, a
-- future `prisma migrate diff` flags drift on every run — same pattern as
-- 20260528100100_seed_builtin_content_types §"Align updated_at columns".
-- crm_activities has no updated_at (append-only).

ALTER TABLE "customers"          ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "customer_addresses" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "b2b_accounts"       ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "pipelines"          ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "pipeline_stages"    ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "deals"              ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "tasks"              ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "segments"           ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "saved_views"        ALTER COLUMN "updated_at" DROP DEFAULT;
