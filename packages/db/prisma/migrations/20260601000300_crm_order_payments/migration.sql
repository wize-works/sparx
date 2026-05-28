-- CRM — Order payments + refunds + refund-item lines.
--
-- Multiple payments per order supports partial payments, split tenders,
-- and net-terms B2B with multiple installments. Refunds reference the
-- payment they reverse (or NULL for goodwill credits issued against the
-- order header). order_refund_items lets refunds target specific lines.

-- ─────────────────────────────────────────────────────────────────────────
-- order_payments
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "order_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "processor" VARCHAR(63) NOT NULL,
    "processor_ref" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "failure_reason" VARCHAR(500),
    "authorized_at" TIMESTAMPTZ,
    "captured_at" TIMESTAMPTZ,
    "voided_at" TIMESTAMPTZ,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_payments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- Partial unique: only constrain rows that actually carry a processor ref.
-- Manual / check / wire payments without a processor reference can repeat.
CREATE UNIQUE INDEX "order_payments_processor_ref_unique"
    ON "order_payments" ("tenant_id", "processor", "processor_ref")
    WHERE "processor_ref" IS NOT NULL;
CREATE INDEX "order_payments_tenant_order_idx" ON "order_payments" ("tenant_id", "order_id");
CREATE INDEX "order_payments_tenant_status_idx" ON "order_payments" ("tenant_id", "status");

ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "order_payments"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- order_refunds
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "order_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "reason" VARCHAR(500),
    "processor_ref" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "refunded_at" TIMESTAMPTZ,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_refunds" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX "order_refunds_tenant_order_idx" ON "order_refunds" ("tenant_id", "order_id");
CREATE INDEX "order_refunds_tenant_status_idx" ON "order_refunds" ("tenant_id", "status");

ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "order_refunds"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- order_refund_items
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "order_refund_items" (
    "refund_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "order_refund_items_pkey" PRIMARY KEY ("refund_id", "order_item_id")
);

CREATE INDEX "order_refund_items_tenant_item_idx"
    ON "order_refund_items" ("tenant_id", "order_item_id");

ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_refund_id_fkey"
    FOREIGN KEY ("refund_id") REFERENCES "order_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_refund_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_refund_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "order_refund_items"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
