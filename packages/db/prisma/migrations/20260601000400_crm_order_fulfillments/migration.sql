-- CRM — Order fulfillments + fulfillment-item lines.
--
-- Multiple fulfillments per order supports split shipments, digital +
-- physical mixed orders, drop-ship + own-warehouse splits. Per-line-item
-- fulfillment quantities live in order_fulfillment_items.

-- ─────────────────────────────────────────────────────────────────────────
-- order_fulfillments
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "order_fulfillments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "carrier" VARCHAR(63),
    "service" VARCHAR(63),
    "tracking_number" VARCHAR(127),
    "tracking_url" VARCHAR(2048),
    "shipped_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_fulfillments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_fulfillments" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX "order_fulfillments_tenant_order_idx" ON "order_fulfillments" ("tenant_id", "order_id");
CREATE INDEX "order_fulfillments_tenant_status_idx" ON "order_fulfillments" ("tenant_id", "status");
CREATE INDEX "order_fulfillments_tenant_tracking_idx" ON "order_fulfillments" ("tenant_id", "tracking_number");

ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_fulfillments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_fulfillments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "order_fulfillments"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────
-- order_fulfillment_items
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "order_fulfillment_items" (
    "fulfillment_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "order_fulfillment_items_pkey" PRIMARY KEY ("fulfillment_id", "order_item_id")
);

CREATE INDEX "order_fulfillment_items_tenant_item_idx"
    ON "order_fulfillment_items" ("tenant_id", "order_item_id");

ALTER TABLE "order_fulfillment_items" ADD CONSTRAINT "order_fulfillment_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_fulfillment_items" ADD CONSTRAINT "order_fulfillment_items_fulfillment_id_fkey"
    FOREIGN KEY ("fulfillment_id") REFERENCES "order_fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_fulfillment_items" ADD CONSTRAINT "order_fulfillment_items_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_fulfillment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_fulfillment_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "order_fulfillment_items"
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
