// Tax zones, exemptions, breakdowns. The TaxProvider plug-in (Stripe Tax
// / TaxJar / Avalara) produces the breakdown at checkout time; this
// module shapes the merchant configuration and the per-order persisted
// snapshot used for refund reversal.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

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
    .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)
    .optional(),
  nexusType: NexusType,
  registrationNumber: z.string().max(63).optional(), // sales-tax permit / VAT
  registeredAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});
export type CreateTaxZoneInput = z.infer<typeof CreateTaxZoneInput>;

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
  b2bAccountId: Uuid.optional(),
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
