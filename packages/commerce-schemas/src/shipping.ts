// Shipping zones, profiles, rates. Provider-agnostic — concrete carrier
// integrations live in @sparx/provider-* packages and implement the
// ShippingProvider interface from @sparx/integration-framework.

import { z } from 'zod';

import { AddressSnapshot, Uuid } from '@sparx/crm-schemas';

import { Currency, Dimensions, HazmatClass, MoneyCents, WeightGrams } from './common';

// ─── Zones ────────────────────────────────────────────────────────────

export const ZoneTargeting = z.object({
  countries: z
    .array(
      z
        .string()
        .length(2)
        .regex(/^[A-Z]{2}$/)
    )
    .max(250)
    .default([]),
  // Optional region narrowing: e.g. ["US-CA", "US-OR"]. ISO 3166-2.
  regions: z
    .array(
      z
        .string()
        .min(4)
        .max(6)
        .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)
    )
    .max(500)
    .default([]),
  postalCodeRanges: z
    .array(
      z.object({
        country: z
          .string()
          .length(2)
          .regex(/^[A-Z]{2}$/),
        from: z.string().min(1).max(15),
        to: z.string().min(1).max(15),
      })
    )
    .max(500)
    .default([]),
});
export type ZoneTargeting = z.infer<typeof ZoneTargeting>;

export const CreateShippingZoneInput = z.object({
  name: z.string().min(1).max(127),
  targeting: ZoneTargeting,
  priority: z.number().int().nonnegative().default(0),
});
export type CreateShippingZoneInput = z.infer<typeof CreateShippingZoneInput>;

// ─── Profiles ─────────────────────────────────────────────────────────
//
// A shipping profile groups products that share carrier eligibility.
// "Standard goods" goes through ground/air; "Hazmat" goes through
// hazmat-qualified carriers only; "Freight" routes oversized items.

export const CreateShippingProfileInput = z.object({
  name: z.string().min(1).max(127),
  description: z.string().max(2000).optional(),
  // Carrier service slugs that may quote for this profile. Empty = any.
  allowedCarrierServices: z.array(z.string().min(1).max(63)).max(50).default([]),
  // Hazmat class allow-list — items above this class are routed to a
  // separate profile.
  hazmatClassesAllowed: z.array(HazmatClass).default(['none']),
  requiresSignature: z.boolean().default(false),
  requiresFreight: z.boolean().default(false),
});
export type CreateShippingProfileInput = z.infer<typeof CreateShippingProfileInput>;

export const AssignProductsToProfileInput = z.object({
  profileId: Uuid,
  productIds: z.array(Uuid).min(1).max(5000),
});
export type AssignProductsToProfileInput = z.infer<typeof AssignProductsToProfileInput>;

// ─── Rates (merchant-defined fallback rates) ──────────────────────────
//
// Real-time carrier rates come through ShippingProvider.rateShipment.
// These manual rates are a fallback (flat-rate, weight band, price band)
// for merchants who don't connect a carrier API.

export const ShippingRateType = z.enum([
  'flat',
  'by_weight',
  'by_price',
  'by_item_count',
  'free_above_threshold',
]);
export type ShippingRateType = z.infer<typeof ShippingRateType>;

export const CreateShippingRateInput = z.object({
  zoneId: Uuid,
  profileId: Uuid,
  name: z.string().min(1).max(127),
  type: ShippingRateType,
  // For flat / free_above_threshold:
  amountCents: MoneyCents.optional(),
  freeAboveCents: MoneyCents.optional(),
  // For by_weight / by_price / by_item_count — array of bands.
  bands: z
    .array(
      z.object({
        min: z.number().nonnegative(),
        max: z.number().positive().optional(),
        amountCents: MoneyCents,
      })
    )
    .max(50)
    .optional(),
  currency: Currency,
  carrier: z.string().max(63).optional(), // display only ("USPS Priority")
  estimatedDeliveryDays: z.number().int().positive().max(60).optional(),
});
export type CreateShippingRateInput = z.infer<typeof CreateShippingRateInput>;

// ─── Shipment / package descriptions for ShippingProvider ─────────────

export const ShipmentPackage = z.object({
  weight: WeightGrams,
  dimensions: Dimensions,
  declaredValueCents: MoneyCents.optional(),
  containsHazmat: z.boolean().default(false),
  hazmatClass: HazmatClass.default('none'),
});
export type ShipmentPackage = z.infer<typeof ShipmentPackage>;

export const ShipmentRequest = z.object({
  fromAddress: AddressSnapshot,
  toAddress: AddressSnapshot,
  packages: z.array(ShipmentPackage).min(1).max(50),
  currency: Currency,
  insuranceCents: MoneyCents.optional(),
  signatureRequired: z.boolean().default(false),
  saturdayDelivery: z.boolean().default(false),
  carrierServiceFilter: z.array(z.string()).max(50).optional(),
});
export type ShipmentRequest = z.infer<typeof ShipmentRequest>;

export const RateOption = z.object({
  // Provider-internal reference passed back into buyLabel().
  rateRef: z.string().min(1).max(255),
  providerSlug: z.string().min(1).max(63),
  carrier: z.string().min(1).max(63),
  service: z.string().min(1).max(127),
  amountCents: MoneyCents,
  currency: Currency,
  estimatedDeliveryDays: z.number().int().nonnegative().max(120).optional(),
  estimatedDeliveryDate: z.string().datetime().optional(),
  isFreight: z.boolean().default(false),
});
export type RateOption = z.infer<typeof RateOption>;
