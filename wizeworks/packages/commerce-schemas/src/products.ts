// Product / variant / option / image input shapes.
//
// Per Phase 1 of the Commerce plan, the catalog has to scale from a bag
// of dogfood to a play structure: rich variants, per-color image pinning,
// SEO, fitment hooks (live on a separate schema file but referenced via
// productId here), and merchant-defined metadata for anything that
// doesn't deserve its own column.

import { z } from 'zod';

import { Uuid } from '@wizeworks/crm-schemas';

import {
  Barcode,
  Currency,
  Dimensions,
  FulfillmentType,
  Handle,
  HazmatClass,
  InventoryPolicy,
  Locale,
  MoneyCents,
  ProductStatus,
  Sku,
  WeightGrams,
} from './common';

// ─── Typed product-type primitives (docs/143) ────────────────────────

// A product-type key — the same shape as a ContentType key (lower snake/kebab,
// ≤63 chars) so the two systems' keys read alike.
export const ProductTypeKey = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9_]*$/, 'Product type key must be lower_snake_case.');

// The raw attribute bag at the wire. The service validates its SHAPE against the
// resolved product type's `attributeSchema` (@wizeworks/field-schema bodyValidatorFor);
// here it is just "a JSON object", because the schema is per-tenant DB data.
export const AttributesBag = z.record(z.string(), z.unknown());
export type AttributesBag = z.infer<typeof AttributesBag>;

// ─── Made to order (issue 026) ───────────────────────────────────────

// A deposit is one shape with three forms, not four loose columns. Written as a
// discriminated union so "percent, but nobody said what percent" cannot be
// expressed at the wire at all — which is the same thing the DB CHECK enforces
// at the other end, said once in each place rather than validated by hand in
// between.
export const ProductDeposit = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('amount'),
    /** Per UNIT. A deposit larger than the line is charged as the line. */
    amountCents: z.number().int().positive().max(100_000_000),
  }),
  z.object({
    type: z.literal('percent'),
    percent: z.number().int().min(1).max(100),
  }),
]);
export type ProductDeposit = z.infer<typeof ProductDeposit>;

// The three made-to-order rules, all genuinely optional. NO `.default()` on any
// of them, deliberately: UpdateProductInput is built with `.partial()`, which in
// this Zod version does NOT neutralize a default, so a defaulted field here
// would be silently re-sent by every partial save and wipe the merchant's answer
// (the footgun documented at length on UpdateProductInput below).
export const MadeToOrderInput = z.object({
  /** Whole days of notice the CUSTOMER must give. Never the supplier's restock
   *  time, which is InventoryLevel.leadTimeDays and a different question. */
  orderAheadDays: z.number().int().min(1).max(365).nullish(),
  deposit: ProductDeposit.optional(),
  /** A repeating allowance: this many again tomorrow. Not stock. */
  dailyLimit: z.number().int().min(1).max(100_000).nullish(),
});
export type MadeToOrderInput = z.infer<typeof MadeToOrderInput>;

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
export const UpdateVariantInput = CreateVariantInput.partial()
  .omit({
    sku: true,
    optionValueIds: true,
  })
  .extend({
    // ── Strip create-only DEFAULTS on update ──────────────────────────────────
    // Exactly the footgun already documented on UpdateProductInput below: in this
    // Zod version `.partial()` does NOT neutralize `.default()`, so a body that
    // OMITS one of these still arrives at the service with the create-default
    // filled in, and variantService.update's `input.X !== undefined` guards write
    // it. A price-only PATCH therefore silently DEMOTED the default variant
    // (isDefault → false), reset the variant's order (position → 0), forced the
    // currency back to USD, and reverted the out-of-stock behaviour to `deny`.
    // Re-declaring them as plain `.optional()` restores true partial semantics.
    // Keep this list in sync with every `.default()` in CreateVariantInput.
    currency: Currency.optional(),
    inventoryPolicy: InventoryPolicy.optional(),
    requiresShipping: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    position: z.number().int().nonnegative().optional(),
    // ── Nullable columns need an explicit CLEAR ───────────────────────────────
    // These are nullable on ProductVariant and the service already writes
    // `input.X` straight through (and maps a null `dimensions` to three null
    // columns), but `.optional()` alone accepts only `undefined` — which the
    // service reads as "leave it alone". Without `.nullish()` there is no way to
    // remove a was-price, a cost, a barcode or a parcel size once one is set.
    title: z.string().max(255).nullish(),
    barcode: Barcode.nullish(),
    compareAtPriceCents: MoneyCents.nullish(),
    costCents: MoneyCents.nullish(),
    weight: WeightGrams.nullish(),
    dimensions: Dimensions.nullish(),
    fulfillmentType: FulfillmentType.nullish(),
    dropshipSourceId: Uuid.nullish(),
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
  // The specific variant (SKU) this image represents, or null for a
  // product-level image shown for every variant. Authoritative — the service
  // sets `VariantImage.variant_id` to exactly this value. The storefront PDP
  // prefers a variant's own images over option-value or product-level ones.
  variantId: Uuid.nullable().default(null),
  optionValueIds: z.array(Uuid).max(8).default([]),
  // Alt text. `undefined` leaves it alone, `null` clears it — unlike the two
  // fields above, which are authoritative and clear when omitted.
  //
  // It lives here because it was previously write-once at CreateVariantImageInput
  // time and there was no way to change it afterwards: a merchant who uploaded a
  // photo without a description could never add one. This is the endpoint that
  // already owns "how this image presents itself", and the back-office edits alt
  // in the same form as the bindings, so a second route would only mean two
  // requests behind one Save.
  alt: z.string().max(512).nullish(),
});
export type SetVariantImageBindingsInput = z.infer<typeof SetVariantImageBindingsInput>;

// Reorder a product's gallery. The FULL ordered list of that product's image
// ids — not a delta — because "move this one to slot 3" has no well-defined
// meaning when two clients reorder concurrently, whereas a whole-list write is
// last-writer-wins and always leaves the gallery in a consistent order.
// `position` is then simply the index in this array.
export const ReorderProductImagesInput = z.object({
  imageIds: z.array(Uuid).min(1).max(250),
});
export type ReorderProductImagesInput = z.infer<typeof ReorderProductImagesInput>;

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

// NULLABLE, not merely optional. Omitted means "leave it alone"; null means
// "clear it" — and every editor that offers a Remove button has to be able to say
// the second. Sending null was a 422 until issue 202.
export const SeoFields = z.object({
  seoTitle: z.string().max(255).nullable().optional(),
  seoDescription: z.string().max(512).nullable().optional(),
  ogImageId: Uuid.nullable().optional(),
});
export type SeoFields = z.infer<typeof SeoFields>;

export const CreateProductInput = z.object({
  title: z.string().min(1).max(255),
  handle: Handle.optional(), // auto-derived from title if absent
  description: z.string().max(50_000).optional(), // rich text (HTML allowed)
  status: ProductStatus.default('draft'),
  productType: z.string().max(127).optional(),
  // The typed product-type link (docs/143) — mirrors ContentEntry.typeKey. When
  // set, the product's `attributes` bag is validated against this type's schema
  // in the service. Distinct from the free-text `productType` above (merchandising
  // label). A key string, resolved by the service — not validated for existence here.
  productTypeKey: ProductTypeKey.optional(),
  // The typed descriptive attribute bag (docs/143). Shape is validated in the
  // product service against the RESOLVED type schema (not statically here — the
  // schema lives per-tenant in the DB), so accept any JSON object at the wire.
  attributes: AttributesBag.optional(),
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
  // Model B per-site scoping (docs/49 §3): the web PROPERTIES this product is
  // visible on. EMPTY = visible on ALL sites (the default). Update sends the full
  // replacement set; UpdateProductInput inherits it as optional via .partial().
  propertyIds: z.array(Uuid).max(50).default([]),
  defaultWarehouseId: Uuid.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ...MadeToOrderInput.shape,
  ...SeoFields.shape,
  options: z.array(ProductOptionInput).max(8).default([]),
  variants: z.array(CreateVariantInput).max(1000).default([]),
});
export type CreateProductInput = z.infer<typeof CreateProductInput>;

export const UpdateProductInput = CreateProductInput.partial()
  .omit({
    options: true,
    variants: true,
  })
  .extend({
    // ── Strip create-only DEFAULTS on update ──────────────────────────────────
    // In this Zod version `.partial()` does NOT neutralize `.default()`: parsing a
    // body that OMITS one of these fields still fills the create-default, so the
    // service's `input.X !== undefined` guards see a value and overwrite the row.
    // That silently reverted `status` → draft and WIPED category / collection /
    // site-scope links on every partial save (the Overview form carries no such
    // fields, yet its save sent `categoryIds: []` etc. → the service deleted the
    // links). Re-declaring them as plain `.optional()` (no default) restores true
    // partial semantics: an omitted field stays `undefined` → the service leaves
    // it alone. Keep this list in sync with every `.default()` in CreateProductInput.
    status: ProductStatus.optional(),
    tags: z.array(z.string().min(1).max(63)).max(50).optional(),
    fulfillmentType: FulfillmentType.optional(),
    hazmatClass: HazmatClass.optional(),
    requiresShipping: z.boolean().optional(),
    categoryIds: z.array(Uuid).max(20).optional(),
    collectionIds: z.array(Uuid).max(50).optional(),
    propertyIds: z.array(Uuid).max(50).optional(),
    // These fields are nullable in the DB — the update form sends null to clear them.
    // .partial() alone only allows undefined, so we extend with .nullish() here.
    description: z.string().max(50_000).nullish(),
    productType: z.string().max(127).nullish(),
    // Nullish so a save can clear the typed link (→ untyped, renders no attributes).
    productTypeKey: ProductTypeKey.nullish(),
    vendor: z.string().max(127).nullish(),
    taxClass: z.string().max(63).nullish(),
    originCountry: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/)
      .nullish(),
    hsCode: z.string().max(15).nullish(),
    ogImageId: Uuid.nullish(),
    // Which DELIVERY GROUP this product ships under — at most one, because the
    // rate that prices a basket has to pick exactly one (see the commerce
    // package's shipping-profile-match.ts). `null` clears it and the product
    // goes back to shipping the standard way. Update-only: a product is filed
    // into a group after it exists, which is what the group screen says.
    shippingProfileId: Uuid.nullish(),
    seoTitle: z.string().max(255).nullish(),
    seoDescription: z.string().max(512).nullish(),
  });
export type UpdateProductInput = z.infer<typeof UpdateProductInput>;

// Bulk operations — backed by Pub/Sub fan-out workers so a 10k-row CSV
// import doesn't block a request handler.
export const BulkUpdateProductStatusInput = z.object({
  productIds: z.array(Uuid).min(1).max(1000),
  status: ProductStatus,
});
export type BulkUpdateProductStatusInput = z.infer<typeof BulkUpdateProductStatusInput>;

/** Deleting several at once. Capped lower than the status/tag bulks because
 *  every one of these is irreversible and cascades to its variants — a thousand
 *  is a number nobody meant to type. */
export const BulkDeleteProductsInput = z.object({
  productIds: z.array(Uuid).min(1).max(200),
});
export type BulkDeleteProductsInput = z.infer<typeof BulkDeleteProductsInput>;

export const BulkTagProductsInput = z.object({
  productIds: z.array(Uuid).min(1).max(1000),
  addTags: z.array(z.string().min(1).max(63)).max(50).default([]),
  removeTags: z.array(z.string().min(1).max(63)).max(50).default([]),
});
export type BulkTagProductsInput = z.infer<typeof BulkTagProductsInput>;

// ─── Translations ────────────────────────────────────────────────────
//
// One row per (product, locale) holding the merchant-facing copy a
// storefront swaps in when it renders in that language. The product's own
// `title` / `description` / `seoTitle` / `seoDescription` columns remain
// the DEFAULT locale — a translation never overwrites them, it sits
// alongside, and a storefront falls back to the product when no row
// exists for the requested tag.
//
// Field caps mirror the columns exactly (VARCHAR(255) title + seoTitle,
// VARCHAR(512) seoDescription, TEXT description) so a too-long string is
// a clean 422 instead of a Postgres 22001.
//
// PUT semantics: this is the WHOLE row for that locale. An omitted
// optional field is stored as NULL, not left at its previous value —
// which is what makes "clear the Spanish SEO description" expressible
// without a separate patch verb.
export const UpsertProductTranslationInput = z.object({
  locale: Locale,
  title: z.string().min(1).max(255),
  description: z.string().max(50_000).nullish(),
  seoTitle: z.string().max(255).nullish(),
  seoDescription: z.string().max(512).nullish(),
});
export type UpsertProductTranslationInput = z.infer<typeof UpsertProductTranslationInput>;

// Save-all for a translations editor: every locale in one round trip.
// Capped at 100 — a tenant translating a product into more than a hundred
// languages is a bulk-import job, not an interactive save.
export const BulkUpsertProductTranslationsInput = z.object({
  translations: z.array(UpsertProductTranslationInput).min(1).max(100),
});
export type BulkUpsertProductTranslationsInput = z.infer<typeof BulkUpsertProductTranslationsInput>;
