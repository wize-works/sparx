// Product / variant / option / image input shapes.
//
// Per Phase 1 of the Commerce plan, the catalog has to scale from a bag
// of dogfood to a play structure: rich variants, per-color image pinning,
// SEO, fitment hooks (live on a separate schema file but referenced via
// productId here), and merchant-defined metadata for anything that
// doesn't deserve its own column.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import {
  Barcode,
  Currency,
  Dimensions,
  FulfillmentType,
  Handle,
  HazmatClass,
  InventoryPolicy,
  MoneyCents,
  ProductStatus,
  Sku,
  WeightGrams,
} from './common';

// ─── Options + Option Values ─────────────────────────────────────────

export const OptionDisplayType = z.enum([
  'dropdown',
  'swatch',
  'image_swatch',
  'radio',
  'segmented',
]);
export type OptionDisplayType = z.infer<typeof OptionDisplayType>;

export const ProductOptionValueInput = z.object({
  value: z.string().min(1).max(127),
  swatchHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Swatch hex must be #RRGGBB')
    .optional(),
  swatchImageId: Uuid.optional(),
  position: z.number().int().nonnegative().default(0),
});
export type ProductOptionValueInput = z.infer<typeof ProductOptionValueInput>;

export const ProductOptionInput = z.object({
  name: z.string().min(1).max(63),
  displayType: OptionDisplayType.default('dropdown'),
  position: z.number().int().nonnegative().default(0),
  values: z.array(ProductOptionValueInput).min(1).max(250),
});
export type ProductOptionInput = z.infer<typeof ProductOptionInput>;

// ─── Variant ─────────────────────────────────────────────────────────

export const VariantImageBinding = z.object({
  // The option-value IDs this image is pinned to. Empty = product-level.
  // Setting [colorRedId] means "show this image when option Color = Red";
  // setting [colorRedId, sizeXlId] narrows further (rare but supported).
  optionValueIds: z.array(Uuid).max(8).default([]),
  mediaAssetId: Uuid,
  position: z.number().int().nonnegative().default(0),
  alt: z.string().max(512).optional(),
});
export type VariantImageBinding = z.infer<typeof VariantImageBinding>;

export const CreateVariantInput = z.object({
  sku: Sku,
  barcode: Barcode.optional(),
  title: z.string().max(255).optional(), // computed from options when omitted
  // Maps the variant onto the option lattice. Each entry is an
  // existing ProductOptionValue id on the parent product. The service
  // validates that the set spans every option exactly once.
  optionValueIds: z.array(Uuid).max(8).default([]),
  priceCents: MoneyCents,
  compareAtPriceCents: MoneyCents.optional(),
  costCents: MoneyCents.optional(),
  currency: Currency.default('USD'),
  weight: WeightGrams.optional(),
  dimensions: Dimensions.optional(),
  inventoryPolicy: InventoryPolicy.default('deny'),
  requiresShipping: z.boolean().default(true),
  fulfillmentType: FulfillmentType.optional(), // overrides product-level
  dropshipSourceId: Uuid.optional(),
  isDefault: z.boolean().default(false),
  position: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateVariantInput = z.infer<typeof CreateVariantInput>;

// Update is partial — except `sku` and `optionValueIds`, which require
// dedicated endpoints because they have unique-constraint and lattice-
// consistency implications respectively.
export const UpdateVariantInput = CreateVariantInput.partial().omit({
  sku: true,
  optionValueIds: true,
});
export type UpdateVariantInput = z.infer<typeof UpdateVariantInput>;

// SKU change — separate so the conflict path can return a CONFLICT
// error with the existing variant's id for "merge or rename" UX.
export const RenameVariantSkuInput = z.object({
  sku: Sku,
});
export type RenameVariantSkuInput = z.infer<typeof RenameVariantSkuInput>;

// ─── Option lattice ──────────────────────────────────────────────────
// Replaces the full option set for a product in one transaction. Existing
// options + values + variant option-value assignments are dropped before
// the new set is inserted; existing ProductVariant rows are NOT touched
// (the merchant must rebind them via `assignVariantOptionValues` once the
// new lattice exists). The dashboard variants tab orchestrates the two
// calls when the matrix is restructured.

export const SetProductOptionsInput = z.object({
  options: z.array(ProductOptionInput).max(8).default([]),
});
export type SetProductOptionsInput = z.infer<typeof SetProductOptionsInput>;

export const AssignVariantOptionValuesInput = z.object({
  variantId: Uuid,
  optionValueIds: z.array(Uuid).max(8).default([]),
});
export type AssignVariantOptionValuesInput = z.infer<typeof AssignVariantOptionValuesInput>;

// ─── Variant image bindings ──────────────────────────────────────────
// Pin a VariantImage to a set of option-value ids. Empty = product-level
// image (always shown). Non-empty = "show when the selection includes
// every listed option value" (the storefront treats it as a superset
// match so a Color=Red, Size=M pin still shows when only Color=Red is
// selected).

export const SetVariantImageBindingsInput = z.object({
  variantImageId: Uuid,
  optionValueIds: z.array(Uuid).max(8).default([]),
});
export type SetVariantImageBindingsInput = z.infer<typeof SetVariantImageBindingsInput>;

export const CreateVariantImageInput = z.object({
  productId: Uuid,
  variantId: Uuid.optional(), // null = product-level
  mediaAssetId: Uuid,
  position: z.number().int().nonnegative().default(0),
  alt: z.string().max(512).optional(),
  optionValueIds: z.array(Uuid).max(8).default([]),
});
export type CreateVariantImageInput = z.infer<typeof CreateVariantImageInput>;

// ─── Product ─────────────────────────────────────────────────────────

export const SeoFields = z.object({
  seoTitle: z.string().max(255).optional(),
  seoDescription: z.string().max(512).optional(),
  ogImageId: Uuid.optional(),
});
export type SeoFields = z.infer<typeof SeoFields>;

export const CreateProductInput = z.object({
  title: z.string().min(1).max(255),
  handle: Handle.optional(), // auto-derived from title if absent
  description: z.string().max(50_000).optional(), // rich text (HTML allowed)
  status: ProductStatus.default('draft'),
  productType: z.string().max(127).optional(),
  vendor: z.string().max(127).optional(),
  tags: z.array(z.string().min(1).max(63)).max(50).default([]),
  fulfillmentType: FulfillmentType.default('physical'),
  weight: WeightGrams.optional(), // default for variants without explicit weight
  dimensions: Dimensions.optional(),
  hazmatClass: HazmatClass.default('none'),
  requiresShipping: z.boolean().default(true),
  taxClass: z.string().max(63).optional(), // e.g. "clothing", "food", "digital"
  originCountry: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .optional(),
  hsCode: z.string().max(15).optional(), // Harmonized System code for customs
  categoryIds: z.array(Uuid).max(20).default([]),
  collectionIds: z.array(Uuid).max(50).default([]),
  defaultWarehouseId: Uuid.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ...SeoFields.shape,
  options: z.array(ProductOptionInput).max(8).default([]),
  variants: z.array(CreateVariantInput).max(1000).default([]),
});
export type CreateProductInput = z.infer<typeof CreateProductInput>;

export const UpdateProductInput = CreateProductInput.partial().omit({
  options: true,
  variants: true,
});
export type UpdateProductInput = z.infer<typeof UpdateProductInput>;

// Bulk operations — backed by Pub/Sub fan-out workers so a 10k-row CSV
// import doesn't block a request handler.
export const BulkUpdateProductStatusInput = z.object({
  productIds: z.array(Uuid).min(1).max(1000),
  status: ProductStatus,
});
export type BulkUpdateProductStatusInput = z.infer<typeof BulkUpdateProductStatusInput>;

export const BulkTagProductsInput = z.object({
  productIds: z.array(Uuid).min(1).max(1000),
  addTags: z.array(z.string().min(1).max(63)).max(50).default([]),
  removeTags: z.array(z.string().min(1).max(63)).max(50).default([]),
});
export type BulkTagProductsInput = z.infer<typeof BulkTagProductsInput>;
