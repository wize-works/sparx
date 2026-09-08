// Tax zones, exemptions, breakdowns. The TaxProvider plug-in (Stripe Tax
// / TaxJar / Avalara) produces the breakdown at checkout time; this
// module shapes the merchant configuration and the per-order persisted
// snapshot used for refund reversal.

import { z } from 'zod';

import { Uuid } from '@wizeworks/crm-schemas';

import { MoneyCents } from './common';

export const NexusType = z.enum(['physical', 'economic', 'voluntary']);
export type NexusType = z.infer<typeof NexusType>;

export const CreateTaxZoneInput = z.object({
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  region: z
    .string()
    .min(4)
    .max(6)
    .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, 'Region must be a country-region code, e.g. "US-CA".')
    .optional(),
  nexusType: NexusType,
  registrationNumber: z.string().max(63).optional(), // sales-tax permit / VAT
  registeredAt: z.string().datetime().optional(),
  // DEFAULTS TO OFF, and `taxService.createZone` REFUSES `true` outright: a tax
  // place is always created switched off, and starting to collect is its own
  // separate act. Kept on the input rather than dropped so that asking for it
  // fails loudly, since Zod would otherwise strip the key and silently do
  // something other than what the caller asked.
  //
  // It used to default to `true`, so any caller that simply did not mention
  // collection got a shop charging sales tax: the `tax-us-sales` preset reached
  // from five industry starters set a Denver studio collecting in California,
  // Texas and New York (issue 429). A caller that says nothing is not asking to
  // collect, and absence of a decision must never be stored as a decision.
  isActive: z.boolean().default(false),
});
export type CreateTaxZoneInput = z.infer<typeof CreateTaxZoneInput>;

// A `.default()` survives `.partial()`, and taxZoneService.update writes every
// key that isn't undefined — so editing a zone's registration number through a
// bare `CreateTaxZoneInput.partial()` REACTIVATED a zone the merchant had
// switched off, resuming tax collection somewhere they had stopped collecting.
// Update paths must use this schema.
export const UpdateTaxZoneInput = CreateTaxZoneInput.extend({
  isActive: z.boolean(),
}).partial();
export type UpdateTaxZoneInput = z.infer<typeof UpdateTaxZoneInput>;

// ─── When a place actually charges ────────────────────────────────────
//
// ONE definition, shared by the checkout calculator and by both consoles, so a
// screen can never say "Collecting" about a place that takes nothing (or the
// reverse). Two things have to be true:
//
//   isActive     the owner wants to collect here right now
//   activatedAt  a signed-in person switched it on, and this is when
//
// The second is not redundant. `isActive` alone cannot tell a decision the owner
// made from a row a starter, an importer or a script wrote, and something had
// been writing them. A place with no activation record charges nothing, whatever
// its switch says, and the database CHECK `tax_zones_active_needs_a_person`
// stops such a row being written in the first place.

export interface TaxZoneCollectionState {
  isActive: boolean;
  activatedAt: string | null;
}

export function zoneIsCollecting(zone: TaxZoneCollectionState): boolean {
  return zone.isActive && zone.activatedAt !== null;
}

// Merchant-defined fallback rate, used only when no TaxProvider is
// installed. Real tax calculation always prefers the provider.
export const CreateTaxRateInput = z.object({
  zoneId: Uuid,
  name: z.string().min(1).max(127), // "California Sales Tax"
  rateBasisPoints: z.number().int().min(0).max(10_000), // 825 == 8.25%
  appliesToShipping: z.boolean().default(false),
  productTaxClass: z.string().max(63).optional(), // ties to Product.taxClass
});
export type CreateTaxRateInput = z.infer<typeof CreateTaxRateInput>;

// ─── Exemptions (B2B + nonprofit) ─────────────────────────────────────

export const ExemptionReason = z.enum([
  'resale',
  'manufacturing',
  'agricultural',
  'government',
  'nonprofit',
  'diplomatic',
  'other',
]);
export type ExemptionReason = z.infer<typeof ExemptionReason>;

export const CreateTaxExemptionInput = z.object({
  customerId: Uuid.optional(),
  companyId: Uuid.optional(),
  jurisdiction: z.string().min(2).max(6), // "US" or "US-CA"
  reason: ExemptionReason,
  certificateNumber: z.string().min(1).max(127),
  certificateMediaId: Uuid.optional(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
});
export type CreateTaxExemptionInput = z.infer<typeof CreateTaxExemptionInput>;

// ─── Calculation in/out ───────────────────────────────────────────────

export const TaxCalculationLine = z.object({
  variantId: Uuid,
  productId: Uuid,
  productTaxClass: z.string().max(63).optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: MoneyCents,
  discountAmountCents: MoneyCents.default(0),
});
export type TaxCalculationLine = z.infer<typeof TaxCalculationLine>;

export const TaxCalculationRequest = z.object({
  shipFrom: z.object({
    country: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/),
    region: z
      .string()
      .min(4)
      .max(6)
      .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)
      .optional(),
    postalCode: z.string().max(15).optional(),
  }),
  shipTo: z.object({
    country: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/),
    region: z
      .string()
      .min(4)
      .max(6)
      .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)
      .optional(),
    postalCode: z.string().max(15).optional(),
    line1: z.string().max(255).optional(),
    city: z.string().max(120).optional(),
  }),
  customerExemptionIds: z.array(Uuid).default([]),
  shippingAmountCents: MoneyCents.default(0),
  lines: z.array(TaxCalculationLine).min(1).max(500),
});
export type TaxCalculationRequest = z.infer<typeof TaxCalculationRequest>;

export const TaxBreakdownLine = z.object({
  lineRef: z.number().int().nonnegative(), // index into request.lines
  taxableAmountCents: MoneyCents,
  taxAmountCents: MoneyCents,
  jurisdictions: z
    .array(
      z.object({
        name: z.string().max(127),
        type: z.enum(['country', 'state', 'county', 'city', 'special']),
        rateBasisPoints: z.number().int().min(0).max(10_000),
        amountCents: MoneyCents,
      })
    )
    .max(20),
});
export type TaxBreakdownLine = z.infer<typeof TaxBreakdownLine>;

export const TaxBreakdown = z.object({
  providerSlug: z.string().min(1).max(63),
  // Provider-internal reference, used by reverseTransaction() on refund.
  breakdownRef: z.string().min(1).max(255),
  totalTaxCents: MoneyCents,
  shippingTaxCents: MoneyCents,
  lines: z.array(TaxBreakdownLine),
  calculatedAt: z.string().datetime(),
});
export type TaxBreakdown = z.infer<typeof TaxBreakdown>;
