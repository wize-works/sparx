-- Commerce module — initial schema.
--
-- Adds ~70 commerce_* tables covering products, variants, categories,
-- collections, fitment (vehicle make/model/engine + product fitment),
-- inventory (warehouses, lots, serials, adjustments, reservations),
-- pricing (lists, bulk tiers, contract prices), discounts (with gift
-- cards + store credit), bundles + configurator, cart + checkout,
-- subscriptions + dunning, reviews + Q&A + wishlists, returns/RMA,
-- shipping (zones + profiles + rates), tax (zones + rates + exemptions),
-- provider installations + webhook events, and storefront settings/theme.
--
-- Also reconciles cosmetic drift in the existing orders/quotes index
-- naming and a leftover api_keys default-drop from the api-keys-no-force
-- migration so the schema and DB are in sync going forward.
--
-- Tenant-scoped + FORCE ROW LEVEL SECURITY with the standard
-- tenant_isolation policy (current_tenant_id() helper defined in
-- 20260527000100_rls). RLS block lives at the bottom of this file; pure
-- join tables (option/category/collection/shipping-profile joins) carry
-- no tenant_id and inherit isolation via FK ON DELETE CASCADE.
-- AlterTable
ALTER TABLE "api_keys" ALTER COLUMN "scopes" DROP DEFAULT;

-- CreateTable
CREATE TABLE "commerce_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "handle" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "product_type" VARCHAR(127),
    "vendor" VARCHAR(127),
    "tags" VARCHAR(63)[] DEFAULT ARRAY[]::VARCHAR(63)[],
    "fulfillment_type" VARCHAR(20) NOT NULL DEFAULT 'physical',
    "weight_grams" INTEGER,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "hazmat_class" VARCHAR(32) NOT NULL DEFAULT 'none',
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "tax_class" VARCHAR(63),
    "origin_country" VARCHAR(2),
    "hs_code" VARCHAR(15),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(512),
    "og_image_id" UUID,
    "default_warehouse_id" UUID,
    "price_min_cents" INTEGER,
    "price_max_cents" INTEGER,
    "in_stock" BOOLEAN NOT NULL DEFAULT false,
    "best_seller_rank" INTEGER,
    "average_rating" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(63) NOT NULL,
    "display_type" VARCHAR(20) NOT NULL DEFAULT 'dropdown',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_option_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "value" VARCHAR(127) NOT NULL,
    "swatch_hex" VARCHAR(7),
    "swatch_image_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(127) NOT NULL,
    "barcode" VARCHAR(14),
    "title" VARCHAR(255),
    "price_cents" INTEGER NOT NULL,
    "compare_at_price_cents" INTEGER,
    "cost_cents" INTEGER,
    "currency" VARCHAR(3) NOT NULL,
    "weight_grams" INTEGER,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "inventory_policy" VARCHAR(20) NOT NULL DEFAULT 'deny',
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "fulfillment_type" VARCHAR(20),
    "dropship_source_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_variant_option_values" (
    "variant_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "commerce_product_variant_option_values_pkey" PRIMARY KEY ("variant_id","option_value_id")
);

-- CreateTable
CREATE TABLE "commerce_variant_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "alt" VARCHAR(512),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_variant_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_variant_image_option_values" (
    "variant_image_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "commerce_variant_image_option_values_pkey" PRIMARY KEY ("variant_image_id","option_value_id")
);

-- CreateTable
CREATE TABLE "commerce_product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "path" VARCHAR(2000) NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "handle" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "icon_media_id" UUID,
    "hero_media_id" UUID,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(512),
    "og_image_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_category_products" (
    "category_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commerce_category_products_pkey" PRIMARY KEY ("category_id","product_id")
);

-- CreateTable
CREATE TABLE "commerce_product_collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "handle" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "rule_set" JSONB NOT NULL DEFAULT '{}',
    "hero_media_id" UUID,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(512),
    "og_image_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_product_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_collection_products" (
    "collection_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "added_by" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "commerce_collection_products_pkey" PRIMARY KEY ("collection_id","product_id")
);

-- CreateTable
CREATE TABLE "commerce_vehicle_makes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "name" VARCHAR(63) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "country_of_origin" VARCHAR(2),
    "logo_media_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_vehicle_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_vehicle_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "make_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "slug" VARCHAR(127) NOT NULL,
    "body_style" VARCHAR(63),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_vehicle_engines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "model_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "displacement_cc" INTEGER,
    "cylinders" INTEGER,
    "fuel_type" VARCHAR(20),
    "aspiration" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_vehicle_engines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_fitments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "make_id" UUID NOT NULL,
    "model_id" UUID,
    "engine_id" UUID,
    "year_min" INTEGER,
    "year_max" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_product_fitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_warehouses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "code" VARCHAR(15) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'owned',
    "line1" VARCHAR(255),
    "line2" VARCHAR(255),
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "postal_code" VARCHAR(32),
    "country" VARCHAR(2),
    "phone" VARCHAR(50),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "default_for_channel" JSONB NOT NULL DEFAULT '[]',
    "hours_of_operation" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_inventory_levels" (
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "reorder_point" INTEGER,
    "reorder_quantity" INTEGER,
    "lead_time_days" INTEGER,
    "unit_cost_cents" INTEGER,
    "as_of" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_inventory_levels_pkey" PRIMARY KEY ("variant_id","warehouse_id")
);

-- CreateTable
CREATE TABLE "commerce_inventory_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "reference_type" VARCHAR(63),
    "reference_id" UUID,
    "actor_user_id" UUID,
    "note" TEXT,
    "unit_cost_cents" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_inventory_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "holder_type" VARCHAR(20) NOT NULL,
    "holder_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_lot_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "lot_number" VARCHAR(63) NOT NULL,
    "manufactured_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "hazmat_class" VARCHAR(32) NOT NULL DEFAULT 'none',
    "supplier_batch_ref" VARCHAR(127),
    "coa_media_id" UUID,
    "recall_status" VARCHAR(20),
    "recall_reason" TEXT,
    "recalled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_lot_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_serial_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "lot_batch_id" UUID,
    "serial" VARCHAR(127) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'in_stock',
    "sold_on_order_item_id" UUID,
    "sold_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_serial_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_price_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "currency" VARCHAR(3) NOT NULL,
    "channel" VARCHAR(20),
    "customer_segment_id" UUID,
    "b2b_account_id" UUID,
    "collection_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ,
    "valid_to" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_price_list_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "fixed_price_cents" INTEGER,
    "percent_off_list" DOUBLE PRECISION,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_price_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_bulk_price_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID,
    "price_list_id" UUID,
    "min_quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_bulk_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_contract_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "b2b_account_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "signed_agreement_media_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_contract_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(63),
    "name" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'order',
    "value_cents" INTEGER,
    "value_percent" DOUBLE PRECISION,
    "currency" VARCHAR(3),
    "collection_id" UUID,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ,
    "total_usage_limit" INTEGER,
    "per_customer_limit" INTEGER NOT NULL DEFAULT 1,
    "stacking" VARCHAR(40) NOT NULL DEFAULT 'none',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_discount_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "discount_id" UUID NOT NULL,
    "customer_id" UUID,
    "order_id" UUID,
    "cart_id" UUID,
    "redeemed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_cents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commerce_discount_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_gift_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(63) NOT NULL,
    "initial_balance_cents" INTEGER NOT NULL,
    "balance_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ,
    "recipient_email" VARCHAR(255),
    "recipient_name" VARCHAR(127),
    "message" TEXT,
    "purchasing_order_item_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_gift_card_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "gift_card_id" UUID NOT NULL,
    "order_id" UUID,
    "delta_cents" INTEGER NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_gift_card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_store_credit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_store_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_store_credit_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "store_credit_id" UUID NOT NULL,
    "delta_cents" INTEGER NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "reference_type" VARCHAR(63),
    "reference_id" UUID,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_store_credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_bundles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bundle_product_id" UUID NOT NULL,
    "pricing_mode" VARCHAR(20) NOT NULL DEFAULT 'sum_of_components',
    "fixed_price_cents" INTEGER,
    "percent_off_sum" DOUBLE PRECISION,
    "inventory_mode" VARCHAR(30) NOT NULL DEFAULT 'decrement_components',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_bundle_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bundle_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_id_swappable" UUID,
    "default_quantity" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_swappable" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commerce_bundle_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_configuration_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_configuration_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_configuration_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "key" VARCHAR(63) NOT NULL,
    "label" VARCHAR(127) NOT NULL,
    "help_text" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "min_selections" INTEGER,
    "max_selections" INTEGER,
    "default_choice_keys" JSONB NOT NULL DEFAULT '[]',
    "group_header" VARCHAR(127),
    "position" INTEGER NOT NULL DEFAULT 0,
    "choices" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "commerce_configuration_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_configuration_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "match" VARCHAR(10) NOT NULL DEFAULT 'all',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commerce_configuration_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_configuration_addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "default_included" BOOLEAN NOT NULL DEFAULT false,
    "price_override_cents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commerce_configuration_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "guest_token" VARCHAR(127),
    "channel" VARCHAR(20) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "from_quote_id" UUID,
    "from_subscription_id" UUID,
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_total_cents" INTEGER NOT NULL DEFAULT 0,
    "shipping_total_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_total_cents" INTEGER NOT NULL DEFAULT 0,
    "gift_card_applied_cents" INTEGER NOT NULL DEFAULT 0,
    "store_credit_applied_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "pricing_trace" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ,
    "abandoned_at" TIMESTAMPTZ,
    "recovered_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "configuration_payload" JSONB,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "unit_price_trace" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_cart_discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "discount_id" UUID NOT NULL,
    "applied_cents" INTEGER NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_cart_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_checkout_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "step" VARCHAR(20) NOT NULL DEFAULT 'cart_review',
    "channel" VARCHAR(20) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "customer_id" UUID,
    "b2b_account_id" UUID,
    "customer_email" VARCHAR(255),
    "customer_phone" VARCHAR(50),
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "shipping_provider_slug" VARCHAR(63),
    "shipping_rate_ref" VARCHAR(255),
    "shipping_description" VARCHAR(255),
    "payment_provider_slug" VARCHAR(63),
    "payment_ref" VARCHAR(255),
    "tax_provider_slug" VARCHAR(63),
    "tax_breakdown_ref" VARCHAR(255),
    "tax_breakdown" JSONB,
    "po_number" VARCHAR(63),
    "payment_terms_requested" VARCHAR(20),
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_total_cents" INTEGER NOT NULL DEFAULT 0,
    "shipping_total_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_total_cents" INTEGER NOT NULL DEFAULT 0,
    "gift_card_applied_cents" INTEGER NOT NULL DEFAULT 0,
    "store_credit_applied_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(127),
    "result_order_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'storefront',
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "provider_slug" VARCHAR(63) NOT NULL,
    "provider_customer_ref" VARCHAR(255),
    "provider_schedule_ref" VARCHAR(255),
    "interval_unit" VARCHAR(10) NOT NULL,
    "interval_count" INTEGER NOT NULL,
    "deliveries_per_cycle" INTEGER NOT NULL DEFAULT 1,
    "anchor_day_of_month" INTEGER,
    "anchor_day_of_week" INTEGER,
    "end_after_occurrences" INTEGER,
    "end_on_date" TIMESTAMPTZ,
    "shipping_address" JSONB NOT NULL,
    "billing_address" JSONB,
    "started_at" TIMESTAMPTZ,
    "trial_ends_at" TIMESTAMPTZ,
    "current_period_start" TIMESTAMPTZ,
    "current_period_end" TIMESTAMPTZ,
    "next_occurrence_at" TIMESTAMPTZ,
    "paused_until" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "dunning_policy" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_subscription_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "configuration_payload" JSONB,
    "addon_of_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_subscription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_subscription_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "event" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_dunning_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "payment_ref" VARCHAR(255),
    "attempt_number" INTEGER NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_retry_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_dunning_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "customer_id" UUID,
    "order_id" UUID,
    "rating" SMALLINT NOT NULL,
    "title" VARCHAR(127) NOT NULL,
    "body" TEXT NOT NULL,
    "display_name" VARCHAR(63),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "moderation_note" TEXT,
    "moderated_by" UUID,
    "moderated_at" TIMESTAMPTZ,
    "response" TEXT,
    "response_author_id" UUID,
    "responded_at" TIMESTAMPTZ,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "unhelpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commerce_product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_review_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_review_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_review_helpful_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "customer_id" UUID,
    "voter_fingerprint" VARCHAR(127) NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_review_helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_review_moderation_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_review_moderation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "customer_id" UUID,
    "display_name" VARCHAR(63),
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_product_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_product_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "author_customer_id" UUID,
    "author_user_id" UUID,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_product_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_wishlists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL DEFAULT 'My Wishlist',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "share_token" VARCHAR(63),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_wishlist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "wishlist_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_return_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "requested_by" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'requested',
    "preferred_outcome" VARCHAR(20) NOT NULL DEFAULT 'refund',
    "staff_note" TEXT,
    "refunded_amount_cents" INTEGER,
    "restocking_fee_cents" INTEGER,
    "refund_issued_as" VARCHAR(20),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "received_at" TIMESTAMPTZ,
    "refunded_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_return_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "approved_quantity" INTEGER NOT NULL DEFAULT 0,
    "reason_code" VARCHAR(40) NOT NULL,
    "customer_note" TEXT,
    "media_asset_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_return_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_return_inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "return_line_item_id" UUID NOT NULL,
    "condition" VARCHAR(20) NOT NULL,
    "restockable" BOOLEAN NOT NULL,
    "warehouse_id" UUID,
    "photo_media_ids" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "inspected_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_return_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_return_labels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "provider_slug" VARCHAR(63) NOT NULL,
    "label_ref" VARCHAR(255) NOT NULL,
    "tracking_number" VARCHAR(127),
    "tracking_url" VARCHAR(2048),
    "label_media_id" UUID,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_return_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_shipping_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_shipping_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "description" TEXT,
    "allowed_carrier_services" JSONB NOT NULL DEFAULT '[]',
    "hazmat_classes_allowed" JSONB NOT NULL DEFAULT '["none"]',
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "requires_freight" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_shipping_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_shipping_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "amount_cents" INTEGER,
    "free_above_cents" INTEGER,
    "bands" JSONB,
    "currency" VARCHAR(3) NOT NULL,
    "carrier" VARCHAR(63),
    "estimated_delivery_days" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_shipping_profile_products" (
    "profile_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "commerce_shipping_profile_products_pkey" PRIMARY KEY ("profile_id","product_id")
);

-- CreateTable
CREATE TABLE "commerce_shipping_profile_variants" (
    "profile_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,

    CONSTRAINT "commerce_shipping_profile_variants_pkey" PRIMARY KEY ("profile_id","variant_id")
);

-- CreateTable
CREATE TABLE "commerce_shipping_profile_collections" (
    "profile_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,

    CONSTRAINT "commerce_shipping_profile_collections_pkey" PRIMARY KEY ("profile_id","collection_id")
);

-- CreateTable
CREATE TABLE "commerce_tax_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "region" VARCHAR(6),
    "nexus_type" VARCHAR(20) NOT NULL,
    "registration_number" VARCHAR(63),
    "registered_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_tax_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_tax_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "name" VARCHAR(127) NOT NULL,
    "rate_basis_points" INTEGER NOT NULL,
    "applies_to_shipping" BOOLEAN NOT NULL DEFAULT false,
    "product_tax_class" VARCHAR(63),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_tax_exemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "b2b_account_id" UUID,
    "jurisdiction" VARCHAR(6) NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "certificate_number" VARCHAR(127) NOT NULL,
    "certificate_media_id" UUID,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_tax_exemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_provider_installations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider_slug" VARCHAR(63) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'production',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending_configuration',
    "label" VARCHAR(127),
    "config_encrypted" JSONB NOT NULL DEFAULT '{}',
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "provider_account_id" VARCHAR(255),
    "last_health_check_at" TIMESTAMPTZ,
    "last_health_status" VARCHAR(40),
    "last_health_detail" TEXT,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_at" TIMESTAMPTZ,
    "installed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_provider_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_provider_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "provider_slug" VARCHAR(63) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "provider_event_type" VARCHAR(127) NOT NULL,
    "signature_verified_at" TIMESTAMPTZ NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'received',
    "processed_at" TIMESTAMPTZ,
    "error_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_storefront_settings" (
    "tenant_id" UUID NOT NULL,
    "default_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "default_locale" VARCHAR(10) NOT NULL DEFAULT 'en-US',
    "default_warehouse_id" UUID,
    "channels_enabled" JSONB NOT NULL DEFAULT '["storefront"]',
    "cart_abandonment_minutes" INTEGER NOT NULL DEFAULT 120,
    "show_stock_below" INTEGER NOT NULL DEFAULT 10,
    "hide_prices_when_signed_out" BOOLEAN NOT NULL DEFAULT false,
    "require_auth_for_checkout" BOOLEAN NOT NULL DEFAULT false,
    "default_dunning_policy" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_storefront_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "commerce_storefront_themes" (
    "tenant_id" UUID NOT NULL,
    "color_primary" VARCHAR(7),
    "color_primary_foreground" VARCHAR(7),
    "color_accent" VARCHAR(7),
    "color_background" VARCHAR(7),
    "color_muted" VARCHAR(7),
    "font_heading" VARCHAR(127),
    "font_body" VARCHAR(127),
    "radius_base" VARCHAR(15),
    "logo_media_id" UUID,
    "logo_dark_media_id" UUID,
    "favicon_media_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commerce_storefront_themes_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE INDEX "commerce_products_tenant_id_status_idx" ON "commerce_products"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_products_tenant_id_product_type_idx" ON "commerce_products"("tenant_id", "product_type");

-- CreateIndex
CREATE INDEX "commerce_products_tenant_id_vendor_idx" ON "commerce_products"("tenant_id", "vendor");

-- CreateIndex
CREATE INDEX "commerce_products_tenant_id_updated_at_idx" ON "commerce_products"("tenant_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_products_tenant_id_deleted_at_idx" ON "commerce_products"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_handle_unique" ON "commerce_products"("tenant_id", "handle");

-- CreateIndex
CREATE INDEX "commerce_product_translations_tenant_id_idx" ON "commerce_product_translations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_locale_unique" ON "commerce_product_translations"("product_id", "locale");

-- CreateIndex
CREATE INDEX "commerce_product_options_tenant_id_product_id_idx" ON "commerce_product_options"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_name_unique" ON "commerce_product_options"("product_id", "name");

-- CreateIndex
CREATE INDEX "commerce_product_option_values_tenant_id_option_id_idx" ON "commerce_product_option_values"("tenant_id", "option_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_values_value_unique" ON "commerce_product_option_values"("option_id", "value");

-- CreateIndex
CREATE INDEX "commerce_product_variants_tenant_id_product_id_idx" ON "commerce_product_variants"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "commerce_product_variants_tenant_id_dropship_source_id_idx" ON "commerce_product_variants"("tenant_id", "dropship_source_id");

-- CreateIndex
CREATE INDEX "commerce_product_variants_tenant_id_deleted_at_idx" ON "commerce_product_variants"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_unique" ON "commerce_product_variants"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "commerce_product_variant_option_values_option_value_id_idx" ON "commerce_product_variant_option_values"("option_value_id");

-- CreateIndex
CREATE INDEX "commerce_variant_images_tenant_id_product_id_idx" ON "commerce_variant_images"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "commerce_variant_images_tenant_id_variant_id_idx" ON "commerce_variant_images"("tenant_id", "variant_id");

-- CreateIndex
CREATE INDEX "commerce_variant_images_media_asset_id_idx" ON "commerce_variant_images"("media_asset_id");

-- CreateIndex
CREATE INDEX "commerce_variant_image_option_values_option_value_id_idx" ON "commerce_variant_image_option_values"("option_value_id");

-- CreateIndex
CREATE INDEX "commerce_product_categories_tenant_id_parent_id_idx" ON "commerce_product_categories"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "commerce_product_categories_tenant_id_path_idx" ON "commerce_product_categories"("tenant_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenant_handle_unique" ON "commerce_product_categories"("tenant_id", "handle");

-- CreateIndex
CREATE INDEX "commerce_category_products_product_id_idx" ON "commerce_category_products"("product_id");

-- CreateIndex
CREATE INDEX "commerce_product_collections_tenant_id_type_idx" ON "commerce_product_collections"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "commerce_product_collections_tenant_id_updated_at_idx" ON "commerce_product_collections"("tenant_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "product_collections_tenant_handle_unique" ON "commerce_product_collections"("tenant_id", "handle");

-- CreateIndex
CREATE INDEX "commerce_collection_products_product_id_idx" ON "commerce_collection_products"("product_id");

-- CreateIndex
CREATE INDEX "commerce_vehicle_makes_tenant_id_idx" ON "commerce_vehicle_makes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_tenant_slug_unique" ON "commerce_vehicle_makes"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "commerce_vehicle_models_tenant_id_idx" ON "commerce_vehicle_models"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_slug_unique" ON "commerce_vehicle_models"("make_id", "slug");

-- CreateIndex
CREATE INDEX "commerce_vehicle_engines_tenant_id_model_id_idx" ON "commerce_vehicle_engines"("tenant_id", "model_id");

-- CreateIndex
CREATE INDEX "commerce_product_fitments_tenant_id_product_id_idx" ON "commerce_product_fitments"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "commerce_product_fitments_tenant_id_make_id_idx" ON "commerce_product_fitments"("tenant_id", "make_id");

-- CreateIndex
CREATE INDEX "commerce_product_fitments_tenant_id_model_id_idx" ON "commerce_product_fitments"("tenant_id", "model_id");

-- CreateIndex
CREATE INDEX "commerce_product_fitments_tenant_id_engine_id_idx" ON "commerce_product_fitments"("tenant_id", "engine_id");

-- CreateIndex
CREATE INDEX "commerce_product_fitments_tenant_id_year_min_year_max_idx" ON "commerce_product_fitments"("tenant_id", "year_min", "year_max");

-- CreateIndex
CREATE INDEX "commerce_warehouses_tenant_id_is_active_idx" ON "commerce_warehouses"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_code_unique" ON "commerce_warehouses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "commerce_inventory_levels_tenant_id_warehouse_id_idx" ON "commerce_inventory_levels"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "commerce_inventory_levels_tenant_id_on_hand_idx" ON "commerce_inventory_levels"("tenant_id", "on_hand");

-- CreateIndex
CREATE INDEX "commerce_inventory_adjustments_tenant_id_variant_id_created_idx" ON "commerce_inventory_adjustments"("tenant_id", "variant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_inventory_adjustments_tenant_id_warehouse_id_creat_idx" ON "commerce_inventory_adjustments"("tenant_id", "warehouse_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_inventory_adjustments_tenant_id_reference_type_ref_idx" ON "commerce_inventory_adjustments"("tenant_id", "reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "commerce_inventory_reservations_tenant_id_variant_id_status_idx" ON "commerce_inventory_reservations"("tenant_id", "variant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_inventory_reservations_tenant_id_holder_type_holde_idx" ON "commerce_inventory_reservations"("tenant_id", "holder_type", "holder_id");

-- CreateIndex
CREATE INDEX "commerce_inventory_reservations_status_expires_at_idx" ON "commerce_inventory_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "commerce_lot_batches_tenant_id_expires_at_idx" ON "commerce_lot_batches"("tenant_id", "expires_at");

-- CreateIndex
CREATE INDEX "commerce_lot_batches_tenant_id_recall_status_idx" ON "commerce_lot_batches"("tenant_id", "recall_status");

-- CreateIndex
CREATE UNIQUE INDEX "lot_batches_variant_lot_unique" ON "commerce_lot_batches"("variant_id", "lot_number");

-- CreateIndex
CREATE INDEX "commerce_serial_units_tenant_id_status_idx" ON "commerce_serial_units"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_serial_units_tenant_id_lot_batch_id_idx" ON "commerce_serial_units"("tenant_id", "lot_batch_id");

-- CreateIndex
CREATE INDEX "commerce_serial_units_sold_on_order_item_id_idx" ON "commerce_serial_units"("sold_on_order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "serial_units_variant_serial_unique" ON "commerce_serial_units"("variant_id", "serial");

-- CreateIndex
CREATE INDEX "commerce_price_lists_tenant_id_status_idx" ON "commerce_price_lists"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_price_lists_tenant_id_channel_idx" ON "commerce_price_lists"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "commerce_price_lists_tenant_id_b2b_account_id_idx" ON "commerce_price_lists"("tenant_id", "b2b_account_id");

-- CreateIndex
CREATE INDEX "commerce_price_list_entries_tenant_id_variant_id_idx" ON "commerce_price_list_entries"("tenant_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_entries_unique" ON "commerce_price_list_entries"("price_list_id", "variant_id", "min_quantity");

-- CreateIndex
CREATE INDEX "commerce_bulk_price_tiers_tenant_id_variant_id_min_quantity_idx" ON "commerce_bulk_price_tiers"("tenant_id", "variant_id", "min_quantity");

-- CreateIndex
CREATE INDEX "commerce_bulk_price_tiers_tenant_id_price_list_id_min_quant_idx" ON "commerce_bulk_price_tiers"("tenant_id", "price_list_id", "min_quantity");

-- CreateIndex
CREATE INDEX "commerce_contract_prices_tenant_id_b2b_account_id_idx" ON "commerce_contract_prices"("tenant_id", "b2b_account_id");

-- CreateIndex
CREATE INDEX "commerce_contract_prices_tenant_id_variant_id_idx" ON "commerce_contract_prices"("tenant_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_prices_unique" ON "commerce_contract_prices"("b2b_account_id", "variant_id", "valid_from");

-- CreateIndex
CREATE INDEX "commerce_discounts_tenant_id_status_idx" ON "commerce_discounts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_discounts_tenant_id_start_at_end_at_idx" ON "commerce_discounts"("tenant_id", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_tenant_code_unique" ON "commerce_discounts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "commerce_discount_usages_tenant_id_discount_id_idx" ON "commerce_discount_usages"("tenant_id", "discount_id");

-- CreateIndex
CREATE INDEX "commerce_discount_usages_tenant_id_customer_id_idx" ON "commerce_discount_usages"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_discount_usages_order_id_idx" ON "commerce_discount_usages"("order_id");

-- CreateIndex
CREATE INDEX "commerce_gift_cards_tenant_id_status_idx" ON "commerce_gift_cards"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_gift_cards_tenant_id_recipient_email_idx" ON "commerce_gift_cards"("tenant_id", "recipient_email");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_tenant_code_unique" ON "commerce_gift_cards"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "commerce_gift_card_transactions_tenant_id_gift_card_id_crea_idx" ON "commerce_gift_card_transactions"("tenant_id", "gift_card_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_gift_card_transactions_order_id_idx" ON "commerce_gift_card_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_credit_unique" ON "commerce_store_credit"("tenant_id", "customer_id", "currency");

-- CreateIndex
CREATE INDEX "commerce_store_credit_transactions_tenant_id_store_credit_i_idx" ON "commerce_store_credit_transactions"("tenant_id", "store_credit_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_bundles_tenant_id_idx" ON "commerce_bundles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_product_unique" ON "commerce_bundles"("bundle_product_id");

-- CreateIndex
CREATE INDEX "commerce_bundle_components_tenant_id_bundle_id_idx" ON "commerce_bundle_components"("tenant_id", "bundle_id");

-- CreateIndex
CREATE INDEX "commerce_configuration_templates_tenant_id_product_id_idx" ON "commerce_configuration_templates"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "commerce_configuration_templates_tenant_id_status_idx" ON "commerce_configuration_templates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_configuration_options_tenant_id_template_id_idx" ON "commerce_configuration_options"("tenant_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_options_key_unique" ON "commerce_configuration_options"("template_id", "key");

-- CreateIndex
CREATE INDEX "commerce_configuration_rules_tenant_id_template_id_idx" ON "commerce_configuration_rules"("tenant_id", "template_id");

-- CreateIndex
CREATE INDEX "commerce_configuration_addons_tenant_id_template_id_idx" ON "commerce_configuration_addons"("tenant_id", "template_id");

-- CreateIndex
CREATE INDEX "commerce_configuration_addons_variant_id_idx" ON "commerce_configuration_addons"("variant_id");

-- CreateIndex
CREATE INDEX "commerce_carts_tenant_id_customer_id_idx" ON "commerce_carts"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_carts_tenant_id_guest_token_idx" ON "commerce_carts"("tenant_id", "guest_token");

-- CreateIndex
CREATE INDEX "commerce_carts_tenant_id_abandoned_at_idx" ON "commerce_carts"("tenant_id", "abandoned_at");

-- CreateIndex
CREATE INDEX "commerce_carts_tenant_id_updated_at_idx" ON "commerce_carts"("tenant_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_cart_items_tenant_id_cart_id_idx" ON "commerce_cart_items"("tenant_id", "cart_id");

-- CreateIndex
CREATE INDEX "commerce_cart_items_variant_id_idx" ON "commerce_cart_items"("variant_id");

-- CreateIndex
CREATE INDEX "commerce_cart_discounts_tenant_id_cart_id_idx" ON "commerce_cart_discounts"("tenant_id", "cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_discounts_unique" ON "commerce_cart_discounts"("cart_id", "discount_id");

-- CreateIndex
CREATE INDEX "commerce_checkout_sessions_tenant_id_cart_id_idx" ON "commerce_checkout_sessions"("tenant_id", "cart_id");

-- CreateIndex
CREATE INDEX "commerce_checkout_sessions_tenant_id_customer_id_idx" ON "commerce_checkout_sessions"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_checkout_sessions_tenant_id_step_idx" ON "commerce_checkout_sessions"("tenant_id", "step");

-- CreateIndex
CREATE INDEX "commerce_checkout_sessions_tenant_id_expires_at_idx" ON "commerce_checkout_sessions"("tenant_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_idempotency_unique" ON "commerce_checkout_sessions"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "commerce_subscriptions_tenant_id_customer_id_idx" ON "commerce_subscriptions"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_subscriptions_tenant_id_status_idx" ON "commerce_subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_subscriptions_next_occurrence_at_idx" ON "commerce_subscriptions"("next_occurrence_at");

-- CreateIndex
CREATE INDEX "commerce_subscription_items_tenant_id_subscription_id_idx" ON "commerce_subscription_items"("tenant_id", "subscription_id");

-- CreateIndex
CREATE INDEX "commerce_subscription_items_variant_id_idx" ON "commerce_subscription_items"("variant_id");

-- CreateIndex
CREATE INDEX "commerce_subscription_events_tenant_id_subscription_id_occu_idx" ON "commerce_subscription_events"("tenant_id", "subscription_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_dunning_attempts_tenant_id_subscription_id_attempt_idx" ON "commerce_dunning_attempts"("tenant_id", "subscription_id", "attempted_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_product_reviews_tenant_id_product_id_status_idx" ON "commerce_product_reviews"("tenant_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "commerce_product_reviews_tenant_id_status_created_at_idx" ON "commerce_product_reviews"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_product_reviews_tenant_id_customer_id_idx" ON "commerce_product_reviews"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_review_media_tenant_id_review_id_idx" ON "commerce_review_media"("tenant_id", "review_id");

-- CreateIndex
CREATE INDEX "commerce_review_media_media_asset_id_idx" ON "commerce_review_media"("media_asset_id");

-- CreateIndex
CREATE INDEX "commerce_review_helpful_votes_tenant_id_review_id_idx" ON "commerce_review_helpful_votes"("tenant_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_helpful_votes_unique" ON "commerce_review_helpful_votes"("review_id", "voter_fingerprint");

-- CreateIndex
CREATE INDEX "commerce_review_moderation_log_tenant_id_review_id_created__idx" ON "commerce_review_moderation_log"("tenant_id", "review_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_product_questions_tenant_id_product_id_status_idx" ON "commerce_product_questions"("tenant_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "commerce_product_answers_tenant_id_question_id_idx" ON "commerce_product_answers"("tenant_id", "question_id");

-- CreateIndex
CREATE INDEX "commerce_wishlists_tenant_id_customer_id_idx" ON "commerce_wishlists"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_share_token_unique" ON "commerce_wishlists"("tenant_id", "share_token");

-- CreateIndex
CREATE INDEX "commerce_wishlist_items_tenant_id_wishlist_id_idx" ON "commerce_wishlist_items"("tenant_id", "wishlist_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_unique" ON "commerce_wishlist_items"("wishlist_id", "variant_id");

-- CreateIndex
CREATE INDEX "commerce_return_requests_tenant_id_order_id_idx" ON "commerce_return_requests"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "commerce_return_requests_tenant_id_status_idx" ON "commerce_return_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commerce_return_requests_tenant_id_created_at_idx" ON "commerce_return_requests"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_return_line_items_tenant_id_return_id_idx" ON "commerce_return_line_items"("tenant_id", "return_id");

-- CreateIndex
CREATE INDEX "commerce_return_line_items_order_item_id_idx" ON "commerce_return_line_items"("order_item_id");

-- CreateIndex
CREATE INDEX "commerce_return_inspections_tenant_id_return_id_idx" ON "commerce_return_inspections"("tenant_id", "return_id");

-- CreateIndex
CREATE INDEX "commerce_return_inspections_return_line_item_id_idx" ON "commerce_return_inspections"("return_line_item_id");

-- CreateIndex
CREATE INDEX "commerce_return_labels_tenant_id_return_id_idx" ON "commerce_return_labels"("tenant_id", "return_id");

-- CreateIndex
CREATE INDEX "commerce_shipping_zones_tenant_id_priority_idx" ON "commerce_shipping_zones"("tenant_id", "priority");

-- CreateIndex
CREATE INDEX "commerce_shipping_profiles_tenant_id_idx" ON "commerce_shipping_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "commerce_shipping_rates_tenant_id_zone_id_idx" ON "commerce_shipping_rates"("tenant_id", "zone_id");

-- CreateIndex
CREATE INDEX "commerce_shipping_rates_tenant_id_profile_id_idx" ON "commerce_shipping_rates"("tenant_id", "profile_id");

-- CreateIndex
CREATE INDEX "commerce_shipping_profile_products_product_id_idx" ON "commerce_shipping_profile_products"("product_id");

-- CreateIndex
CREATE INDEX "commerce_shipping_profile_variants_variant_id_idx" ON "commerce_shipping_profile_variants"("variant_id");

-- CreateIndex
CREATE INDEX "commerce_shipping_profile_collections_collection_id_idx" ON "commerce_shipping_profile_collections"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_zones_unique" ON "commerce_tax_zones"("tenant_id", "country", "region");

-- CreateIndex
CREATE INDEX "commerce_tax_rates_tenant_id_zone_id_idx" ON "commerce_tax_rates"("tenant_id", "zone_id");

-- CreateIndex
CREATE INDEX "commerce_tax_rates_tenant_id_product_tax_class_idx" ON "commerce_tax_rates"("tenant_id", "product_tax_class");

-- CreateIndex
CREATE INDEX "commerce_tax_exemptions_tenant_id_customer_id_idx" ON "commerce_tax_exemptions"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "commerce_tax_exemptions_tenant_id_b2b_account_id_idx" ON "commerce_tax_exemptions"("tenant_id", "b2b_account_id");

-- CreateIndex
CREATE INDEX "commerce_tax_exemptions_tenant_id_jurisdiction_idx" ON "commerce_tax_exemptions"("tenant_id", "jurisdiction");

-- CreateIndex
CREATE INDEX "commerce_provider_installations_tenant_id_kind_enabled_idx" ON "commerce_provider_installations"("tenant_id", "kind", "enabled");

-- CreateIndex
CREATE INDEX "commerce_provider_installations_tenant_id_status_idx" ON "commerce_provider_installations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_installations_unique" ON "commerce_provider_installations"("tenant_id", "provider_slug", "environment", "label");

-- CreateIndex
CREATE INDEX "commerce_provider_webhook_events_tenant_id_installation_id__idx" ON "commerce_provider_webhook_events"("tenant_id", "installation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "commerce_provider_webhook_events_tenant_id_status_idx" ON "commerce_provider_webhook_events"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_idempotency" ON "commerce_provider_webhook_events"("provider_slug", "provider_event_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- The partial unique on order_payments(tenant_id, processor, processor_ref)
-- WHERE processor_ref IS NOT NULL was already created in
-- 20260601000300_crm_order_payments. Prisma's diff suggests a full unique
-- because the schema's @@unique doesn't encode the partial predicate, but
-- the partial form is the intended behavior (manual/check/wire payments
-- without a processor_ref must be able to repeat). Leaving the existing
-- partial unique in place; this migration intentionally omits the
-- duplicate full-unique CREATE.

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_default_warehouse_id_fkey" FOREIGN KEY ("default_warehouse_id") REFERENCES "commerce_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_translations" ADD CONSTRAINT "commerce_product_translations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_translations" ADD CONSTRAINT "commerce_product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_options" ADD CONSTRAINT "commerce_product_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_options" ADD CONSTRAINT "commerce_product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_option_values" ADD CONSTRAINT "commerce_product_option_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_option_values" ADD CONSTRAINT "commerce_product_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "commerce_product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_variants" ADD CONSTRAINT "commerce_product_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_variants" ADD CONSTRAINT "commerce_product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_variant_option_values" ADD CONSTRAINT "commerce_product_variant_option_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_variant_option_values" ADD CONSTRAINT "commerce_product_variant_option_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "commerce_product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_variant_images" ADD CONSTRAINT "commerce_variant_images_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_variant_images" ADD CONSTRAINT "commerce_variant_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_variant_images" ADD CONSTRAINT "commerce_variant_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_variant_image_option_values" ADD CONSTRAINT "commerce_variant_image_option_values_variant_image_id_fkey" FOREIGN KEY ("variant_image_id") REFERENCES "commerce_variant_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_variant_image_option_values" ADD CONSTRAINT "commerce_variant_image_option_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "commerce_product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_categories" ADD CONSTRAINT "commerce_product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_categories" ADD CONSTRAINT "commerce_product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "commerce_product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_category_products" ADD CONSTRAINT "commerce_category_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "commerce_product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_category_products" ADD CONSTRAINT "commerce_category_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_collections" ADD CONSTRAINT "commerce_product_collections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_collection_products" ADD CONSTRAINT "commerce_collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "commerce_product_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_collection_products" ADD CONSTRAINT "commerce_collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_vehicle_makes" ADD CONSTRAINT "commerce_vehicle_makes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_vehicle_models" ADD CONSTRAINT "commerce_vehicle_models_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_vehicle_models" ADD CONSTRAINT "commerce_vehicle_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "commerce_vehicle_makes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_vehicle_engines" ADD CONSTRAINT "commerce_vehicle_engines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_vehicle_engines" ADD CONSTRAINT "commerce_vehicle_engines_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "commerce_vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_fitments" ADD CONSTRAINT "commerce_product_fitments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_fitments" ADD CONSTRAINT "commerce_product_fitments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_fitments" ADD CONSTRAINT "commerce_product_fitments_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "commerce_vehicle_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_fitments" ADD CONSTRAINT "commerce_product_fitments_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "commerce_vehicle_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_fitments" ADD CONSTRAINT "commerce_product_fitments_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "commerce_vehicle_engines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_warehouses" ADD CONSTRAINT "commerce_warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_levels" ADD CONSTRAINT "commerce_inventory_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_levels" ADD CONSTRAINT "commerce_inventory_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_levels" ADD CONSTRAINT "commerce_inventory_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "commerce_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_adjustments" ADD CONSTRAINT "commerce_inventory_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_adjustments" ADD CONSTRAINT "commerce_inventory_adjustments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_adjustments" ADD CONSTRAINT "commerce_inventory_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "commerce_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_reservations" ADD CONSTRAINT "commerce_inventory_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_reservations" ADD CONSTRAINT "commerce_inventory_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_inventory_reservations" ADD CONSTRAINT "commerce_inventory_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "commerce_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_lot_batches" ADD CONSTRAINT "commerce_lot_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_lot_batches" ADD CONSTRAINT "commerce_lot_batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_lot_batches" ADD CONSTRAINT "commerce_lot_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "commerce_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_serial_units" ADD CONSTRAINT "commerce_serial_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_serial_units" ADD CONSTRAINT "commerce_serial_units_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_serial_units" ADD CONSTRAINT "commerce_serial_units_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "commerce_warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_serial_units" ADD CONSTRAINT "commerce_serial_units_lot_batch_id_fkey" FOREIGN KEY ("lot_batch_id") REFERENCES "commerce_lot_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_price_lists" ADD CONSTRAINT "commerce_price_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_price_lists" ADD CONSTRAINT "commerce_price_lists_b2b_account_id_fkey" FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_price_lists" ADD CONSTRAINT "commerce_price_lists_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "commerce_product_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_price_list_entries" ADD CONSTRAINT "commerce_price_list_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_price_list_entries" ADD CONSTRAINT "commerce_price_list_entries_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "commerce_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_price_list_entries" ADD CONSTRAINT "commerce_price_list_entries_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bulk_price_tiers" ADD CONSTRAINT "commerce_bulk_price_tiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bulk_price_tiers" ADD CONSTRAINT "commerce_bulk_price_tiers_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bulk_price_tiers" ADD CONSTRAINT "commerce_bulk_price_tiers_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "commerce_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_contract_prices" ADD CONSTRAINT "commerce_contract_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_contract_prices" ADD CONSTRAINT "commerce_contract_prices_b2b_account_id_fkey" FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_contract_prices" ADD CONSTRAINT "commerce_contract_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_discounts" ADD CONSTRAINT "commerce_discounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_discounts" ADD CONSTRAINT "commerce_discounts_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "commerce_product_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_discount_usages" ADD CONSTRAINT "commerce_discount_usages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_discount_usages" ADD CONSTRAINT "commerce_discount_usages_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "commerce_discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_gift_cards" ADD CONSTRAINT "commerce_gift_cards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_gift_card_transactions" ADD CONSTRAINT "commerce_gift_card_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_gift_card_transactions" ADD CONSTRAINT "commerce_gift_card_transactions_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "commerce_gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_store_credit" ADD CONSTRAINT "commerce_store_credit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_store_credit" ADD CONSTRAINT "commerce_store_credit_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_store_credit_transactions" ADD CONSTRAINT "commerce_store_credit_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_store_credit_transactions" ADD CONSTRAINT "commerce_store_credit_transactions_store_credit_id_fkey" FOREIGN KEY ("store_credit_id") REFERENCES "commerce_store_credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bundles" ADD CONSTRAINT "commerce_bundles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bundles" ADD CONSTRAINT "commerce_bundles_bundle_product_id_fkey" FOREIGN KEY ("bundle_product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bundle_components" ADD CONSTRAINT "commerce_bundle_components_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bundle_components" ADD CONSTRAINT "commerce_bundle_components_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "commerce_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bundle_components" ADD CONSTRAINT "commerce_bundle_components_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_bundle_components" ADD CONSTRAINT "commerce_bundle_components_product_id_swappable_fkey" FOREIGN KEY ("product_id_swappable") REFERENCES "commerce_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_templates" ADD CONSTRAINT "commerce_configuration_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_templates" ADD CONSTRAINT "commerce_configuration_templates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_options" ADD CONSTRAINT "commerce_configuration_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_options" ADD CONSTRAINT "commerce_configuration_options_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "commerce_configuration_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_rules" ADD CONSTRAINT "commerce_configuration_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_rules" ADD CONSTRAINT "commerce_configuration_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "commerce_configuration_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_addons" ADD CONSTRAINT "commerce_configuration_addons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_configuration_addons" ADD CONSTRAINT "commerce_configuration_addons_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "commerce_configuration_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_carts" ADD CONSTRAINT "commerce_carts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_carts" ADD CONSTRAINT "commerce_carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_cart_items" ADD CONSTRAINT "commerce_cart_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_cart_items" ADD CONSTRAINT "commerce_cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "commerce_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_cart_items" ADD CONSTRAINT "commerce_cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_cart_discounts" ADD CONSTRAINT "commerce_cart_discounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_cart_discounts" ADD CONSTRAINT "commerce_cart_discounts_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "commerce_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_cart_discounts" ADD CONSTRAINT "commerce_cart_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "commerce_discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "commerce_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_b2b_account_id_fkey" FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscriptions" ADD CONSTRAINT "commerce_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscriptions" ADD CONSTRAINT "commerce_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commerce_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_addon_of_id_fkey" FOREIGN KEY ("addon_of_id") REFERENCES "commerce_subscription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscription_events" ADD CONSTRAINT "commerce_subscription_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_subscription_events" ADD CONSTRAINT "commerce_subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commerce_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_dunning_attempts" ADD CONSTRAINT "commerce_dunning_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_dunning_attempts" ADD CONSTRAINT "commerce_dunning_attempts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "commerce_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_reviews" ADD CONSTRAINT "commerce_product_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_reviews" ADD CONSTRAINT "commerce_product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_reviews" ADD CONSTRAINT "commerce_product_reviews_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_reviews" ADD CONSTRAINT "commerce_product_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_review_media" ADD CONSTRAINT "commerce_review_media_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_review_media" ADD CONSTRAINT "commerce_review_media_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "commerce_product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_review_helpful_votes" ADD CONSTRAINT "commerce_review_helpful_votes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_review_helpful_votes" ADD CONSTRAINT "commerce_review_helpful_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "commerce_product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_review_moderation_log" ADD CONSTRAINT "commerce_review_moderation_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_review_moderation_log" ADD CONSTRAINT "commerce_review_moderation_log_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "commerce_product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_questions" ADD CONSTRAINT "commerce_product_questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_questions" ADD CONSTRAINT "commerce_product_questions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_questions" ADD CONSTRAINT "commerce_product_questions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_answers" ADD CONSTRAINT "commerce_product_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_product_answers" ADD CONSTRAINT "commerce_product_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "commerce_product_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_wishlists" ADD CONSTRAINT "commerce_wishlists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_wishlists" ADD CONSTRAINT "commerce_wishlists_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_wishlist_items" ADD CONSTRAINT "commerce_wishlist_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_wishlist_items" ADD CONSTRAINT "commerce_wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "commerce_wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_requests" ADD CONSTRAINT "commerce_return_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_line_items" ADD CONSTRAINT "commerce_return_line_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_line_items" ADD CONSTRAINT "commerce_return_line_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "commerce_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_inspections" ADD CONSTRAINT "commerce_return_inspections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_inspections" ADD CONSTRAINT "commerce_return_inspections_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "commerce_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_labels" ADD CONSTRAINT "commerce_return_labels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_return_labels" ADD CONSTRAINT "commerce_return_labels_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "commerce_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_zones" ADD CONSTRAINT "commerce_shipping_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profiles" ADD CONSTRAINT "commerce_shipping_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_rates" ADD CONSTRAINT "commerce_shipping_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_rates" ADD CONSTRAINT "commerce_shipping_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "commerce_shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_rates" ADD CONSTRAINT "commerce_shipping_rates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "commerce_shipping_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profile_products" ADD CONSTRAINT "commerce_shipping_profile_products_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "commerce_shipping_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profile_products" ADD CONSTRAINT "commerce_shipping_profile_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profile_variants" ADD CONSTRAINT "commerce_shipping_profile_variants_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "commerce_shipping_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profile_variants" ADD CONSTRAINT "commerce_shipping_profile_variants_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce_product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profile_collections" ADD CONSTRAINT "commerce_shipping_profile_collections_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "commerce_shipping_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_shipping_profile_collections" ADD CONSTRAINT "commerce_shipping_profile_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "commerce_product_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_tax_zones" ADD CONSTRAINT "commerce_tax_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_tax_rates" ADD CONSTRAINT "commerce_tax_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_tax_rates" ADD CONSTRAINT "commerce_tax_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "commerce_tax_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_tax_exemptions" ADD CONSTRAINT "commerce_tax_exemptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_tax_exemptions" ADD CONSTRAINT "commerce_tax_exemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_tax_exemptions" ADD CONSTRAINT "commerce_tax_exemptions_b2b_account_id_fkey" FOREIGN KEY ("b2b_account_id") REFERENCES "b2b_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_provider_installations" ADD CONSTRAINT "commerce_provider_installations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_provider_webhook_events" ADD CONSTRAINT "commerce_provider_webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_provider_webhook_events" ADD CONSTRAINT "commerce_provider_webhook_events_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "commerce_provider_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_storefront_settings" ADD CONSTRAINT "commerce_storefront_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_storefront_themes" ADD CONSTRAINT "commerce_storefront_themes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "order_fulfillment_items_tenant_item_idx" RENAME TO "order_fulfillment_items_tenant_id_order_item_id_idx";

-- RenameIndex
ALTER INDEX "order_fulfillments_tenant_order_idx" RENAME TO "order_fulfillments_tenant_id_order_id_idx";

-- RenameIndex
ALTER INDEX "order_fulfillments_tenant_status_idx" RENAME TO "order_fulfillments_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "order_fulfillments_tenant_tracking_idx" RENAME TO "order_fulfillments_tenant_id_tracking_number_idx";

-- RenameIndex
ALTER INDEX "order_items_product_idx" RENAME TO "order_items_product_id_idx";

-- RenameIndex
ALTER INDEX "order_items_tenant_order_idx" RENAME TO "order_items_tenant_id_order_id_idx";

-- RenameIndex
ALTER INDEX "order_items_tenant_sku_idx" RENAME TO "order_items_tenant_id_sku_idx";

-- RenameIndex
ALTER INDEX "order_payments_tenant_order_idx" RENAME TO "order_payments_tenant_id_order_id_idx";

-- RenameIndex
ALTER INDEX "order_payments_tenant_status_idx" RENAME TO "order_payments_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "order_refund_items_tenant_item_idx" RENAME TO "order_refund_items_tenant_id_order_item_id_idx";

-- RenameIndex
ALTER INDEX "order_refunds_tenant_order_idx" RENAME TO "order_refunds_tenant_id_order_id_idx";

-- RenameIndex
ALTER INDEX "order_refunds_tenant_status_idx" RENAME TO "order_refunds_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "orders_tenant_customer_placed_idx" RENAME TO "orders_tenant_id_customer_id_placed_at_idx";

-- RenameIndex
ALTER INDEX "orders_tenant_payment_status_idx" RENAME TO "orders_tenant_id_payment_status_idx";

-- RenameIndex
ALTER INDEX "orders_tenant_placed_idx" RENAME TO "orders_tenant_id_placed_at_idx";

-- RenameIndex
ALTER INDEX "orders_tenant_status_placed_idx" RENAME TO "orders_tenant_id_status_placed_at_idx";

-- RenameIndex
ALTER INDEX "quote_items_product_idx" RENAME TO "quote_items_product_id_idx";

-- RenameIndex
ALTER INDEX "quote_items_tenant_quote_idx" RENAME TO "quote_items_tenant_id_quote_id_idx";

-- RenameIndex
ALTER INDEX "quote_items_tenant_sku_idx" RENAME TO "quote_items_tenant_id_sku_idx";

-- RenameIndex
ALTER INDEX "quotes_tenant_b2b_idx" RENAME TO "quotes_tenant_id_b2b_account_id_created_at_idx";

-- RenameIndex
ALTER INDEX "quotes_tenant_converted_idx" RENAME TO "quotes_tenant_id_converted_to_order_id_idx";

-- RenameIndex
ALTER INDEX "quotes_tenant_customer_idx" RENAME TO "quotes_tenant_id_customer_id_created_at_idx";

-- RenameIndex
ALTER INDEX "quotes_tenant_status_valid_idx" RENAME TO "quotes_tenant_id_status_valid_until_idx";


-- ─────────────────────────────────────────────────────────────────────────
-- Commerce — Row-Level Security
--
-- Every tenant-scoped commerce_* table gets ENABLE + FORCE ROW LEVEL
-- SECURITY with the standard tenant_isolation policy (current_tenant_id()
-- helper defined in 20260527000100_rls). Pure join tables that carry no
-- tenant_id (option/category/collection/shipping-profile joins) inherit
-- isolation via FK + ON DELETE CASCADE on their parents.
--
-- Vehicle reference tables (makes / models / engines) use a slightly
-- different policy: `tenant_id IS NULL` rows are platform-seeded global
-- data readable by every tenant; `tenant_id = current_tenant_id()` rows
-- are per-tenant overrides. WITH CHECK keeps tenants from writing rows
-- claimed by another tenant or accidentally promoting a row to global.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "commerce_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_products" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_products_tenant_isolation ON "commerce_products"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_translations" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_translations_tenant_isolation ON "commerce_product_translations"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_options" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_options_tenant_isolation ON "commerce_product_options"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_option_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_option_values" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_option_values_tenant_isolation ON "commerce_product_option_values"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_variants" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_variants_tenant_isolation ON "commerce_product_variants"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_variant_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_variant_images" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_variant_images_tenant_isolation ON "commerce_variant_images"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_categories" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_categories_tenant_isolation ON "commerce_product_categories"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_collections" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_collections_tenant_isolation ON "commerce_product_collections"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- Vehicle reference tables — platform-seeded global rows (tenant_id NULL)
-- are readable by all tenants; per-tenant overrides are scoped normally.

ALTER TABLE "commerce_vehicle_makes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_vehicle_makes" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_vehicle_makes_tenant_isolation ON "commerce_vehicle_makes"
    AS PERMISSIVE FOR ALL
    USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
    WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());

ALTER TABLE "commerce_vehicle_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_vehicle_models" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_vehicle_models_tenant_isolation ON "commerce_vehicle_models"
    AS PERMISSIVE FOR ALL
    USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
    WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());

ALTER TABLE "commerce_vehicle_engines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_vehicle_engines" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_vehicle_engines_tenant_isolation ON "commerce_vehicle_engines"
    AS PERMISSIVE FOR ALL
    USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
    WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_fitments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_fitments" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_fitments_tenant_isolation ON "commerce_product_fitments"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_warehouses" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_warehouses_tenant_isolation ON "commerce_warehouses"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_inventory_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_inventory_levels" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_inventory_levels_tenant_isolation ON "commerce_inventory_levels"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_inventory_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_inventory_adjustments" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_inventory_adjustments_tenant_isolation ON "commerce_inventory_adjustments"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_inventory_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_inventory_reservations" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_inventory_reservations_tenant_isolation ON "commerce_inventory_reservations"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_lot_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_lot_batches" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_lot_batches_tenant_isolation ON "commerce_lot_batches"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_serial_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_serial_units" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_serial_units_tenant_isolation ON "commerce_serial_units"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_price_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_price_lists" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_price_lists_tenant_isolation ON "commerce_price_lists"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_price_list_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_price_list_entries" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_price_list_entries_tenant_isolation ON "commerce_price_list_entries"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_bulk_price_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_bulk_price_tiers" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_bulk_price_tiers_tenant_isolation ON "commerce_bulk_price_tiers"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_contract_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_contract_prices" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_contract_prices_tenant_isolation ON "commerce_contract_prices"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_discounts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_discounts_tenant_isolation ON "commerce_discounts"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_discount_usages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_discount_usages" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_discount_usages_tenant_isolation ON "commerce_discount_usages"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_gift_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_gift_cards" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_gift_cards_tenant_isolation ON "commerce_gift_cards"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_gift_card_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_gift_card_transactions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_gift_card_transactions_tenant_isolation ON "commerce_gift_card_transactions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_store_credit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_store_credit" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_store_credit_tenant_isolation ON "commerce_store_credit"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_store_credit_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_store_credit_transactions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_store_credit_transactions_tenant_isolation ON "commerce_store_credit_transactions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_bundles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_bundles" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_bundles_tenant_isolation ON "commerce_bundles"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_bundle_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_bundle_components" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_bundle_components_tenant_isolation ON "commerce_bundle_components"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_configuration_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_configuration_templates" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_configuration_templates_tenant_isolation ON "commerce_configuration_templates"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_configuration_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_configuration_options" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_configuration_options_tenant_isolation ON "commerce_configuration_options"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_configuration_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_configuration_rules" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_configuration_rules_tenant_isolation ON "commerce_configuration_rules"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_configuration_addons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_configuration_addons" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_configuration_addons_tenant_isolation ON "commerce_configuration_addons"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_carts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_carts_tenant_isolation ON "commerce_carts"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_cart_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_cart_items_tenant_isolation ON "commerce_cart_items"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_cart_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_cart_discounts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_cart_discounts_tenant_isolation ON "commerce_cart_discounts"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_checkout_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_checkout_sessions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_checkout_sessions_tenant_isolation ON "commerce_checkout_sessions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_subscriptions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_subscriptions_tenant_isolation ON "commerce_subscriptions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_subscription_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_subscription_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_subscription_items_tenant_isolation ON "commerce_subscription_items"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_subscription_events" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_subscription_events_tenant_isolation ON "commerce_subscription_events"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_dunning_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_dunning_attempts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_dunning_attempts_tenant_isolation ON "commerce_dunning_attempts"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_reviews" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_reviews_tenant_isolation ON "commerce_product_reviews"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_review_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_review_media" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_review_media_tenant_isolation ON "commerce_review_media"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_review_helpful_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_review_helpful_votes" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_review_helpful_votes_tenant_isolation ON "commerce_review_helpful_votes"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_review_moderation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_review_moderation_log" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_review_moderation_log_tenant_isolation ON "commerce_review_moderation_log"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_questions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_questions_tenant_isolation ON "commerce_product_questions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_product_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_product_answers" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_product_answers_tenant_isolation ON "commerce_product_answers"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_wishlists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_wishlists" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_wishlists_tenant_isolation ON "commerce_wishlists"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_wishlist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_wishlist_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_wishlist_items_tenant_isolation ON "commerce_wishlist_items"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_return_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_return_requests" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_return_requests_tenant_isolation ON "commerce_return_requests"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_return_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_return_line_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_return_line_items_tenant_isolation ON "commerce_return_line_items"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_return_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_return_inspections" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_return_inspections_tenant_isolation ON "commerce_return_inspections"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_return_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_return_labels" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_return_labels_tenant_isolation ON "commerce_return_labels"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_shipping_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_shipping_zones" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_shipping_zones_tenant_isolation ON "commerce_shipping_zones"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_shipping_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_shipping_profiles" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_shipping_profiles_tenant_isolation ON "commerce_shipping_profiles"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_shipping_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_shipping_rates" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_shipping_rates_tenant_isolation ON "commerce_shipping_rates"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_tax_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_tax_zones" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_tax_zones_tenant_isolation ON "commerce_tax_zones"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_tax_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_tax_rates" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_tax_rates_tenant_isolation ON "commerce_tax_rates"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_tax_exemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_tax_exemptions" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_tax_exemptions_tenant_isolation ON "commerce_tax_exemptions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_provider_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_provider_installations" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_provider_installations_tenant_isolation ON "commerce_provider_installations"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_provider_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_provider_webhook_events" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_provider_webhook_events_tenant_isolation ON "commerce_provider_webhook_events"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_storefront_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_storefront_settings" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_storefront_settings_tenant_isolation ON "commerce_storefront_settings"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "commerce_storefront_themes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commerce_storefront_themes" FORCE  ROW LEVEL SECURITY;
CREATE POLICY commerce_storefront_themes_tenant_isolation ON "commerce_storefront_themes"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
