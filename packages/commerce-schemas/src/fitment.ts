// Fitment data — domain-aware reference tree + per-product applicability.
//
// One model, many merchants:
//   vehicle  — Make → Model → Engine, narrowable by Year
//   pet      — Species → Breed, narrowable by Weight
//   device   — Brand → Model
//   apparel  — Size (single level)
//   fishing  — Species → Body of water, narrowable by Length
//
// `FitmentDomain` declares which levels apply and what labels the UI
// uses ("Make"/"Brand"/"Species"). `FitmentCategory` (L1, required),
// `FitmentItem` (L2, optional), `FitmentVariant` (L3, optional) form
// the tree. `ProductFitment` rows reference whichever depth applies +
// an optional numeric range with units declared on the domain.
//
// Sparx seeds the `vehicle` domain as a global so the Gillett Diesel
// case works out-of-the-box; merchants register their own domains for
// other catalog shapes.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

// ─── Domain ──────────────────────────────────────────────────────────

export const FitmentRangeUnit = z.enum([
  'year',
  'lb',
  'kg',
  'month',
  'us_shoe',
  'eu_shoe',
  'mm',
  'in',
]);
export type FitmentRangeUnit = z.infer<typeof FitmentRangeUnit>;

const SlugString = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9-]+$/);

const Labels = z.object({
  l1: z.string().min(1).max(63), // always required — e.g. "Make"
  l2: z.string().min(1).max(63).optional(), // "Model" — only if domain uses L2
  l3: z.string().min(1).max(63).optional(), // "Engine" — only if domain uses L3
  range: z.string().min(1).max(63).optional(), // "Year" — only if rangeUnit is set
});
export type FitmentDomainLabels = z.infer<typeof Labels>;

export const CreateFitmentDomainInput = z.object({
  slug: SlugString,
  displayName: z.string().min(1).max(127),
  description: z.string().max(2000).optional(),
  iconKey: z.string().min(1).max(63).optional(), // lucide icon name
  labels: Labels,
  rangeUnit: FitmentRangeUnit.optional(),
  position: z.number().int().min(0).max(1000).default(0),
});
export type CreateFitmentDomainInput = z.infer<typeof CreateFitmentDomainInput>;

export const UpdateFitmentDomainInput = CreateFitmentDomainInput.partial();
export type UpdateFitmentDomainInput = z.infer<typeof UpdateFitmentDomainInput>;

// ─── Category (L1) ───────────────────────────────────────────────────

export const CreateFitmentCategoryInput = z.object({
  domainId: Uuid,
  name: z.string().min(1).max(127),
  slug: z
    .string()
    .min(1)
    .max(127)
    .regex(/^[a-z0-9-]+$/),
  attributes: z.record(z.string(), z.unknown()).default({}),
  iconMediaId: Uuid.optional(),
  position: z.number().int().min(0).max(10_000).default(0),
});
export type CreateFitmentCategoryInput = z.infer<typeof CreateFitmentCategoryInput>;

// ─── Item (L2) ───────────────────────────────────────────────────────

export const CreateFitmentItemInput = z.object({
  categoryId: Uuid,
  name: z.string().min(1).max(127),
  slug: z
    .string()
    .min(1)
    .max(127)
    .regex(/^[a-z0-9-]+$/),
  attributes: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().min(0).max(10_000).default(0),
});
export type CreateFitmentItemInput = z.infer<typeof CreateFitmentItemInput>;

// ─── Variant (L3) ────────────────────────────────────────────────────

export const CreateFitmentVariantInput = z.object({
  itemId: Uuid,
  name: z.string().min(1).max(127),
  slug: z
    .string()
    .min(1)
    .max(127)
    .regex(/^[a-z0-9-]+$/),
  attributes: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().min(0).max(10_000).default(0),
});
export type CreateFitmentVariantInput = z.infer<typeof CreateFitmentVariantInput>;

// ─── Product fitment ─────────────────────────────────────────────────
//
// A single fitment row is one applicability rule. A brake pad fits both
// 6.0L and 6.7L Power Stroke 2003-2010 + the 7.3L 1999-2003 — three
// rows. A dog harness fits Labradors 40-80 lb + Goldens 50-90 lb — two
// rows. `category` is required; `item`/`variant` narrow further; the
// optional `range` window contains the product's compatibility band
// (year for vehicles, weight for pets, etc. — unit lives on the domain).

export const ProductFitmentInput = z.object({
  productId: Uuid,
  domainId: Uuid,
  categoryId: Uuid,
  itemId: Uuid.optional(),
  variantId: Uuid.optional(),
  rangeMin: z.number().optional(),
  rangeMax: z.number().optional(),
  notes: z.string().max(2000).optional(),
});
export type ProductFitmentInput = z.infer<typeof ProductFitmentInput>;

// Bulk fitment assignment — common for importers that ship "these
// products fit these vehicles" buckets (AAIA catalog, supplier feed,
// merchant CSV).
export const BulkAssignFitmentInput = z.object({
  productIds: z.array(Uuid).min(1).max(1000),
  fitments: z
    .array(ProductFitmentInput.omit({ productId: true }))
    .min(1)
    .max(100),
});
export type BulkAssignFitmentInput = z.infer<typeof BulkAssignFitmentInput>;

// ─── Fitment lookup (storefront / B2B catalog filter) ─────────────────

export const FitmentLookupQuery = z.object({
  domainId: Uuid.optional(),
  categoryId: Uuid.optional(),
  itemId: Uuid.optional(),
  variantId: Uuid.optional(),
  /** Numeric narrowing — year for vehicle, weight for pet, etc. The
   *  storefront resolves the unit from `domain.rangeUnit`. */
  rangeValue: z.number().optional(),
});
export type FitmentLookupQuery = z.infer<typeof FitmentLookupQuery>;

// ─── Fleet (B2B "what the account owns/operates") ────────────────────
//
// Today only used by the B2B portal's fleet feature with vehicle-shaped
// fields. Stored as JSONB on `b2b_accounts.metadata`. When the B2B
// portal is rebuilt against the generalized fitment tree it'll move to
// its own table and pick up domain-specific UI ("vehicles" for an auto
// shop, "patients" for a vet, "devices" for a service contractor).
// Field names follow the generalized vocabulary so the migration is a
// rename, not a redesign.

export const FleetVehicleInput = z.object({
  label: z.string().min(1).max(127), // "Truck #14", "Service Van A"
  vin: z
    .string()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN excludes I, O, Q and is 17 chars')
    .optional(),
  domainId: Uuid,
  categoryId: Uuid,
  itemId: Uuid.optional(),
  variantId: Uuid.optional(),
  rangeValue: z.number().optional(), // year for vehicle, age-months for pet, ...
  mileage: z.number().int().nonnegative().optional(), // vehicle-only; tolerated for other domains
  notes: z.string().max(2000).optional(),
});
export type FleetVehicleInput = z.infer<typeof FleetVehicleInput>;
