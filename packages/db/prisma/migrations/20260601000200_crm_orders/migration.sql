-- CRM — Orders + order_items.
--
-- The order spine the whole platform agrees on. Commerce will layer a
-- product catalog and checkout flow on top; B2B will add credit checks and
-- approval workflows on top of the quote lifecycle (next migration).
--
-- Tenant-scoped + FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (defined in 20260527000100_rls).

-- ─────────────────────────────────────────────────────────────────────────
-- orders
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_number" VARCHAR(63) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'placed',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'unpaid',
    "channel" VARCHAR(63),
    "source" VARCHAR(63),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "placed_at" TIMESTAMPTZ NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "fulfilled_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_reason" VARCHAR(500),
    "refunded_at" TIMESTAMPTZ,
    "customer_note" TEXT,
    "internal_note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "orders" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE UNIQUE INDEX "orders_tenant_number_unique" ON "orders" ("tenant_id", "order_number");
CREATE INDEX "orders_tenant_customer_placed_idx" ON "orders" ("tenant_id", "customer_id", "placed_at" DESC);
CREATE INDEX "orders_tenant_status_placed_idx" ON "orders" ("tenant_id", "status", "placed_at" DESC);
CREATE INDEX "orders_tenant_payment_status_idx" ON "orders" ("tenant_id", "payment_status");
CREATE INDEX "orders_tenant_placed_idx" ON "orders" ("tenant_id", "placed_at" DESC);

ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "orders"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- order_items
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "sku" VARCHAR(127) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity_fulfilled" INTEGER NOT NULL DEFAULT 0,
    "quantity_refunded" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_items" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX "order_items_tenant_order_idx" ON "order_items" ("tenant_id", "order_id");
CREATE INDEX "order_items_tenant_sku_idx" ON "order_items" ("tenant_id", "sku");
CREATE INDEX "order_items_product_idx" ON "order_items" ("product_id");

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "order_items"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
