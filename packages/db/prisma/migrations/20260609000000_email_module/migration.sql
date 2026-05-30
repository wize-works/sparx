-- Email Platform module — management surface (docs/13-email-platform-prd.md).
--
-- Eight tenant-scoped tables, all ENABLE + FORCE RLS with a tenant_isolation
-- policy on current_tenant_id() (defined in 20260527000100_rls). Plus a
-- find_due_scheduled_sends(int) SECURITY DEFINER scan so the in-process
-- email-dispatch tick (sparx_app, FORCE RLS-bound) can find due ScheduledSend
-- rows across tenants without itself gaining RLS bypass — mirrors the CMS
-- scheduled-publish helper (20260601100000) and sitebuilder's
-- find_due_site_publishes (20260608000000).
--
-- The send PIPELINE (email.send Pub/Sub → email-worker → Mailgun) already
-- exists; these tables are the templates/automations/broadcasts/domains/
-- suppressions/analytics management layer. customer_id / segment_id are plain
-- UUID soft references (no FK) so the email module stays decoupled from CRM
-- being enabled.

-- CreateTable
CREATE TABLE "email_settings" (
    "tenant_id" UUID NOT NULL,
    "from_name" VARCHAR(255),
    "from_address" VARCHAR(255),
    "reply_to" VARCHAR(255),
    "physical_address" TEXT,
    "branding_override" JSONB NOT NULL DEFAULT '{}',
    "default_sending_domain_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "email_sending_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "mailgun_domain_id" VARCHAR(255),
    "region" VARCHAR(8) NOT NULL DEFAULT 'us',
    "state" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "dns_records" JSONB NOT NULL DEFAULT '[]',
    "dkim_selector" VARCHAR(63),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMPTZ,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_sending_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'authored',
    "key" VARCHAR(63),
    "kind" VARCHAR(20) NOT NULL DEFAULT 'marketing',
    "name" VARCHAR(160) NOT NULL,
    "subject" VARCHAR(255),
    "preheader" VARCHAR(255),
    "body" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(63),
    "name" VARCHAR(160) NOT NULL,
    "trigger_event" VARCHAR(63) NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "delay_seconds" INTEGER NOT NULL DEFAULT 0,
    "template_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "can_disable" BOOLEAN NOT NULL DEFAULT true,
    "frequency_cap_seconds" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_scheduled_sends" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "automation_id" UUID,
    "broadcast_id" UUID,
    "template_id" UUID,
    "recipient" VARCHAR(255) NOT NULL,
    "customer_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "due_at" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "dedupe_key" VARCHAR(255),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_scheduled_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_broadcasts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "template_id" UUID,
    "body" JSONB NOT NULL DEFAULT '{}',
    "subject" VARCHAR(255) NOT NULL,
    "preheader" VARCHAR(255),
    "segment_id" UUID,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "campaign_tag" VARCHAR(120),
    "sending_domain_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "message_id" VARCHAR(255),
    "recipient" VARCHAR(255) NOT NULL,
    "customer_id" UUID,
    "broadcast_id" UUID,
    "automation_key" VARCHAR(63),
    "type" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'all',
    "reason" VARCHAR(20) NOT NULL,
    "source" VARCHAR(63),
    "customer_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_sending_domains_tenant_id_state_idx" ON "email_sending_domains"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "email_sending_domains_tenant_id_domain_key" ON "email_sending_domains"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "email_templates_tenant_id_kind_status_idx" ON "email_templates"("tenant_id", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_tenant_id_key_key" ON "email_templates"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "email_automations_tenant_id_trigger_event_enabled_idx" ON "email_automations"("tenant_id", "trigger_event", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "email_automations_tenant_id_key_key" ON "email_automations"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "email_scheduled_sends_status_due_at_idx" ON "email_scheduled_sends"("status", "due_at");

-- CreateIndex
CREATE INDEX "email_scheduled_sends_tenant_id_status_due_at_idx" ON "email_scheduled_sends"("tenant_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_scheduled_sends_tenant_id_dedupe_key_key" ON "email_scheduled_sends"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "email_broadcasts_tenant_id_status_created_at_idx" ON "email_broadcasts"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "email_broadcasts_tenant_id_campaign_tag_idx" ON "email_broadcasts"("tenant_id", "campaign_tag");

-- CreateIndex
CREATE INDEX "email_events_tenant_id_broadcast_id_idx" ON "email_events"("tenant_id", "broadcast_id");

-- CreateIndex
CREATE INDEX "email_events_tenant_id_occurred_at_idx" ON "email_events"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "email_events_tenant_id_type_idx" ON "email_events"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "email_events_tenant_id_message_id_idx" ON "email_events"("tenant_id", "message_id");

-- CreateIndex
CREATE INDEX "email_suppressions_tenant_id_email_idx" ON "email_suppressions"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "email_suppressions_tenant_id_email_scope_key" ON "email_suppressions"("tenant_id", "email", "scope");

-- AddForeignKey
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_default_sending_domain_id_fkey" FOREIGN KEY ("default_sending_domain_id") REFERENCES "email_sending_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sending_domains" ADD CONSTRAINT "email_sending_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_scheduled_sends" ADD CONSTRAINT "email_scheduled_sends_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_scheduled_sends" ADD CONSTRAINT "email_scheduled_sends_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "email_automations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_scheduled_sends" ADD CONSTRAINT "email_scheduled_sends_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "email_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_scheduled_sends" ADD CONSTRAINT "email_scheduled_sends_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "email_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — tenant isolation (ENABLE + FORCE) on all eight tables.
-- Mirrors 20260527000100_rls / 20260601000000_crm_module.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "email_settings"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_settings"         FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_settings_tenant_isolation ON "email_settings"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_sending_domains"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_sending_domains"  FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_sending_domains_tenant_isolation ON "email_sending_domains"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_templates"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_templates"        FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_templates_tenant_isolation ON "email_templates"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_automations"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_automations"      FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_automations_tenant_isolation ON "email_automations"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_scheduled_sends"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_scheduled_sends"  FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_scheduled_sends_tenant_isolation ON "email_scheduled_sends"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_broadcasts"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_broadcasts"       FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_broadcasts_tenant_isolation ON "email_broadcasts"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_events"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_events"           FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_events_tenant_isolation ON "email_events"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "email_suppressions"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_suppressions"     FORCE  ROW LEVEL SECURITY;
CREATE POLICY email_suppressions_tenant_isolation ON "email_suppressions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- Align updated_at columns with Prisma's @updatedAt convention. Drop the
-- table-level DEFAULT now that the tables are created; Prisma's client sets
-- updated_at on every write. Without this, `prisma migrate diff` flags drift.
-- email_events / email_suppressions are append-only (no updated_at).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "email_settings"        ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "email_sending_domains" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "email_templates"       ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "email_automations"     ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "email_scheduled_sends" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "email_broadcasts"      ALTER COLUMN "updated_at" DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────
-- Due-send scan. SECURITY DEFINER (owned by sparx_owner) so the in-process
-- email-dispatch tick running as sparx_app can find due ScheduledSend rows
-- across tenants without RLS bypass; per-row publish still rides withTenant().
-- Mirrors find_due_scheduled_entries (20260601100000) and
-- find_due_site_publishes (20260608000000).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION find_due_scheduled_sends(p_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  due_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT id, tenant_id, due_at
  FROM email_scheduled_sends
  WHERE status = 'pending'
    AND due_at <= NOW()
  ORDER BY due_at ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION find_due_scheduled_sends(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_due_scheduled_sends(int) TO sparx_app;

COMMENT ON FUNCTION find_due_scheduled_sends IS
  'Returns up to p_limit email_scheduled_sends with status=pending whose due_at <= NOW(). SECURITY DEFINER (sparx_owner) so the email-dispatch tick scans across tenants without sparx_app having RLS bypass.';
