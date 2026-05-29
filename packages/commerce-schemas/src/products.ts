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
  // Maps the variant onto the option lattice. Keys are option IDs;
  // values are option-value IDs. Service validates against the parent
  // product's option set.
  optionValueIds: z.array(Uuid).max(8).default([]),
  priceCents: MoneyCents,
  compareAtPriceCents: MoneyCents.optional(),
  costCents: MoneyCents.optional(),
  weight: WeightGrams.optional(),
  dimensions: Dimensions.optional(),
  inventoryPolicy: InventoryPolicy.default('deny'),
  requiresShipping: z.boolean().default(true),
  fulfillmentType: FulfillmentType.optional(), // overrides product-level
  dropshipSourceId: Uuid.optional(),
  isDefault: z.boolean().default(false),
  position: z.number().int().nonnegative().default(0),
});
export type CreateVariantInput = z.infer<typeof CreateVariantInput>;

export const UpdateVariantInput = CreateVariantInput.partial();
export type UpdateVariantInput = z.infer<typeof UpdateVariantInput>;

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
