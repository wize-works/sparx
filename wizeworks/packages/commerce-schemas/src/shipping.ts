// Shipping zones, profiles, rates. Provider-agnostic — concrete carrier
// integrations live in @sparx/provider-* packages and implement the
// ShippingProvider interface from @wizeworks/integration-framework.

import { z } from 'zod';

import { AddressSnapshot, Uuid } from '@wizeworks/crm-schemas';

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

// A `.default()` survives `.partial()`, and the update services write every key
// that isn't undefined — so a bare `CreateShippingZoneInput.partial()` at the
// call site reset the zone's priority to 0 on any edit, changing which zone
// wins for an address. Update paths must use THIS, never `.partial()` on the
// create schema.
export const UpdateShippingZoneInput = CreateShippingZoneInput.extend({
  priority: z.number().int().nonnegative(),
}).partial();
export type UpdateShippingZoneInput = z.infer<typeof UpdateShippingZoneInput>;

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

// Same trap as UpdateShippingZoneInput, with more at stake: renaming a profile
// through `CreateShippingProfileInput.partial()` cleared its carrier allow-list
// (making every carrier eligible), reset its hazmat classes to `['none']`, and
// dropped the signature + freight requirements — routing regulated goods onto
// carriers that must not carry them.
export const UpdateShippingProfileInput = CreateShippingProfileInput.extend({
  allowedCarrierServices: z.array(z.string().min(1).max(63)).max(50),
  hazmatClassesAllowed: z.array(HazmatClass),
  requiresSignature: z.boolean(),
  requiresFreight: z.boolean(),
}).partial();
export type UpdateShippingProfileInput = z.infer<typeof UpdateShippingProfileInput>;

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
  // Which site is quoting (docs/131 §4). Optional — omitted means "don't filter
  // by site", which is what every caller predating multi-site shipping wants and
  // is exactly today's behaviour. A caller that KNOWS its site (checkout, the
  // storefront cart) passes it and gets only that business's zones plus the
  // tenant-wide ones.
  propertyId: z.string().uuid().optional(),
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

// ── carrier vocabulary ───────────────────────────────────────────────────────
//
// `carrier` is stored as a lowercase code (`usps`, `fedex`, `dropship`) and must
// never be shown to anybody in that form. It was: the shipping-confirmation
// email bound `{{shipping.carrier}}` straight to the column, so a customer was
// told their parcel went by "usps" — while the same fact, on the same shop, read
// "USPS" in the owner's console and on the shopper's own order page.
//
// It lived as three separate maps that had already drifted apart: the two
// consoles said "Sent by the supplier" where the shopper's website said
// "Drop-ship", and the website had no entry for `other` at all, so its
// `toUpperCase()` fallback showed a customer the word "OTHER". One map, so the
// next carrier added is added once.

/** The stored carrier code in the words a person uses. `pickup` is deliberately
 *  absent — a collection is not a delivery by a courier called "pickup", and the
 *  surfaces that can show one say so in their own words. */
const CARRIER_LABELS: Record<string, string> = {
  ups: 'UPS',
  usps: 'USPS',
  fedex: 'FedEx',
  dhl: 'DHL',
  digital: 'Sent electronically',
  dropship: 'Sent by the supplier',
  other: 'Another courier',
};

/**
 * A carrier code as a person should read it.
 *
 * An unknown code is returned unchanged rather than upper-cased: a code nobody
 * has named is a gap in the map above, and shouting it does not make it mean
 * anything. Empty/absent returns '' so a caller can drop the line entirely.
 */
export function carrierLabel(carrier: string | null | undefined): string {
  if (!carrier) return '';
  return CARRIER_LABELS[carrier] ?? carrier;
}
