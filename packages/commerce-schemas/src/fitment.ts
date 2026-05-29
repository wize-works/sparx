// Fitment data — vehicle make/model/engine + per-product applicability.
// Drives the auto-parts / diesel-service case from Gillett: the storefront
// filters its catalog by the customer's fleet, and the B2B portal applies
// the same filter to its visibility rules.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

// ─── Reference tables (seeded; merchants extend) ─────────────────────

export const CreateVehicleMakeInput = z.object({
  name: z.string().min(1).max(63),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
  countryOfOrigin: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .optional(),
  logoMediaId: Uuid.optional(),
});
export type CreateVehicleMakeInput = z.infer<typeof CreateVehicleMakeInput>;

export const CreateVehicleModelInput = z.object({
  makeId: Uuid,
  name: z.string().min(1).max(127),
  slug: z
    .string()
    .min(1)
    .max(127)
    .regex(/^[a-z0-9-]+$/),
  bodyStyle: z.string().max(63).optional(), // sedan, suv, pickup, etc.
});
export type CreateVehicleModelInput = z.infer<typeof CreateVehicleModelInput>;

export const CreateVehicleEngineInput = z.object({
  modelId: Uuid,
  name: z.string().min(1).max(127), // e.g. "6.7L Power Stroke V8 Turbo Diesel"
  displacementCc: z.number().int().positive().max(100_000).optional(),
  cylinders: z.number().int().min(1).max(16).optional(),
  fuelType: z
    .enum(['gasoline', 'diesel', 'hybrid', 'electric', 'flex_fuel', 'cng', 'lpg'])
    .optional(),
  aspiration: z.enum(['natural', 'turbocharged', 'supercharged', 'twin_turbo']).optional(),
});
export type CreateVehicleEngineInput = z.infer<typeof CreateVehicleEngineInput>;

// ─── Product fitment ─────────────────────────────────────────────────
//
// A single fitment row is one applicability rule. A product can carry
// many rows (e.g. fits both 6.0L and 6.7L Power Strokes 2003-2010 + the
// 7.3L 1999-2003). All filters are optional; absent = wildcard.

export const ProductFitmentInput = z.object({
  productId: Uuid,
  makeId: Uuid,
  modelId: Uuid.optional(),
  engineId: Uuid.optional(),
  yearMin: z.number().int().min(1900).max(2100).optional(),
  yearMax: z.number().int().min(1900).max(2100).optional(),
  notes: z.string().max(2000).optional(),
});
export type ProductFitmentInput = z.infer<typeof ProductFitmentInput>;

// Bulk fitment assignment — common for a merchant importing an AAIA
// (Auto Care Association) catalog or supplier feed.
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
  makeId: Uuid.optional(),
  modelId: Uuid.optional(),
  engineId: Uuid.optional(),
  year: z.number().int().min(1900).max(2100).optional(),
});
export type FitmentLookupQuery = z.infer<typeof FitmentLookupQuery>;

// Fleet profile (B2B accounts) — a list of vehicles the account operates.
// Stored as JSONB on `b2b_accounts.metadata` today; promoted to its own
// table when CRM B2B and Commerce reconcile in Phase 5/8.
export const FleetVehicleInput = z.object({
  label: z.string().min(1).max(127), // "Truck #14", "Service Van A"
  vin: z
    .string()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN excludes I, O, Q and is 17 chars')
    .optional(),
  makeId: Uuid,
  modelId: Uuid.optional(),
  engineId: Uuid.optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  mileage: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});
export type FleetVehicleInput = z.infer<typeof FleetVehicleInput>;
