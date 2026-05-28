-- CRM — Quotes + quote_items + deal join-table FKs.
--
-- Full quote lifecycle: draft → submitted → (accepted | declined | expired |
-- converted). Accepted quotes convert to an Order via convertedToOrderId —
-- the service stamps the pointer + status transition + activity row in one
-- transaction.
--
-- Also wires the deal_orders.order_id and deal_quotes.quote_id FKs that
-- shipped without FK constraints in 20260601000000_crm_module (orders and
-- quotes didn't exist yet). Now they do.

-- ─────────────────────────────────────────────────────────────────────────
-- quotes
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "b2b_account_id" UUID,
    "quote_number" VARCHAR(63) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "payment_terms" VARCHAR(20),
    "valid_until" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "viewed_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "declined_at" TIMESTAMPTZ,
    "declined_reason" VARCHAR(500),
    "expired_at" TIMESTAMPTZ,
    "converted_to_order_id" UUID,
    "converted_at" TIMESTAMPTZ,
    "customer_note" TEXT,
    "internal_note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "quotes" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE UNIQUE INDEX "quotes_tenant_number_unique" ON "quotes" ("tenant_id", "quote_number");
CREATE INDEX "quotes_tenant_customer_idx" ON "quotes" ("tenant_id", "customer_id", "created_at" DESC);
CREATE INDEX "quotes_tenant_b2b_idx" ON "quotes" ("tenant_id", "b2b_account_id", "created_at" DESC);
CREATE INDEX "quotes_tenant_status_valid_idx" ON "quotes" ("tenant_id", "status", "valid_until");
CREATE INDEX "quotes_tenant_converted_idx" ON "quotes" ("tenant_id", "converted_to_order_id");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_b2b_account_id_fkey"
    FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_to_order_id_fkey"
    FOREIGN KEY ("converted_to_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "quotes"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- quote_items
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "quote_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
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
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "quote_items" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX "quote_items_tenant_quote_idx" ON "quote_items" ("tenant_id", "quote_id");
CREATE INDEX "quote_items_tenant_sku_idx" ON "quote_items" ("tenant_id", "sku");
CREATE INDEX "quote_items_product_idx" ON "quote_items" ("product_id");

ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "quote_items"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- deal_orders / deal_quotes — wire the FKs now that orders/quotes exist
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "deal_orders" ADD CONSTRAINT "deal_orders_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_quotes" ADD CONSTRAINT "deal_quotes_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
