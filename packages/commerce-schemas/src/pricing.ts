// Pricing — price lists, contract prices (B2B), bulk tiers.
// Discounts and gift cards are siblings in ./discounts.ts.
//
// Resolution order is locked: contract price (B2B) → price list →
// bulk tier → variant base price. Discounts apply on top (./discounts.ts).

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { Channel, Currency, MoneyCents } from './common';

// ─── Price lists ─────────────────────────────────────────────────────

export const PriceListStatus = z.enum(['draft', 'active', 'archived']);
export type PriceListStatus = z.infer<typeof PriceListStatus>;

export const CreatePriceListInput = z.object({
  name: z.string().min(1).max(127),
  description: z.string().max(2000).optional(),
  currency: Currency,
  channel: Channel.optional(), // null = applies on all channels
  // Targeting — at most one of these is set; both null means "default
  // for the channel".
  customerSegmentId: Uuid.nullable().optional(),
  b2bAccountId: Uuid.nullable().optional(),
  priority: z.number().int().nonnegative().default(0),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  status: PriceListStatus.default('draft'),
});
export type CreatePriceListInput = z.infer<typeof CreatePriceListInput>;

export const UpdatePriceListInput = CreatePriceListInput.partial();
export type UpdatePriceListInput = z.infer<typeof UpdatePriceListInput>;

// Entry: either a fixed price OR a percent-off-list, never both.
export const PriceListEntryInput = z
  .object({
    priceListId: Uuid,
    variantId: Uuid,
    fixedPriceCents: MoneyCents.nullable().optional(),
    percentOffList: z.number().min(0).max(100).nullable().optional(),
    minQuantity: z.number().int().positive().default(1),
    maxQuantity: z.number().int().positive().optional(),
  })
  .refine((entry) => (entry.fixedPriceCents == null) !== (entry.percentOffList == null), {
    message: 'Set exactly one of fixedPriceCents or percentOffList',
  });
export type PriceListEntryInput = z.infer<typeof PriceListEntryInput>;

export const BulkSetPriceListEntriesInput = z.object({
  priceListId: Uuid,
  entries: z
    .array(
      z.object({
        variantId: Uuid,
        fixedPriceCents: MoneyCents.nullable().optional(),
        percentOffList: z.number().min(0).max(100).nullable().optional(),
        minQuantity: z.number().int().positive().default(1),
        maxQuantity: z.number().int().positive().optional(),
      })
    )
    .max(10_000),
});
export type BulkSetPriceListEntriesInput = z.infer<typeof BulkSetPriceListEntriesInput>;

// ─── Bulk price tiers ─────────────────────────────────────────────────
//
// "10+ at $5 off each" without writing a discount. Lives either on a
// variant (storefront) or a price list (B2B-specific tiering).

export const CreateBulkPriceTierInput = z
  .object({
    variantId: Uuid.nullable().optional(),
    priceListId: Uuid.nullable().optional(),
    minQuantity: z.number().int().positive(),
    unitPriceCents: MoneyCents,
  })
  .refine((t) => (t.variantId == null) !== (t.priceListId == null), {
    message: 'Set exactly one of variantId or priceListId',
  });
export type CreateBulkPriceTierInput = z.infer<typeof CreateBulkPriceTierInput>;

// ─── Contract prices (B2B-specific, signed agreement) ─────────────────

export const CreateContractPriceInput = z.object({
  b2bAccountId: Uuid,
  variantId: Uuid,
  priceCents: MoneyCents,
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
  signedAgreementMediaId: Uuid.optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateContractPriceInput = z.infer<typeof CreateContractPriceInput>;

// ─── Price resolution input (used by storefront + cart pricing) ───────
//
// The pricing service consumes this and emits a PricedLine. The trace
// payload is persisted on CartItem.unitPriceTrace so the storefront can
// answer "why is this the price?" without recomputing.

export const PriceResolutionRequest = z.object({
  variantId: Uuid,
  quantity: z.number().int().positive(),
  channel: Channel,
  currency: Currency,
  customerId: Uuid.optional(),
  b2bAccountId: Uuid.optional(),
  customerSegmentIds: z.array(Uuid).default([]),
  asOf: z.string().datetime().optional(),
});
export type PriceResolutionRequest = z.infer<typeof PriceResolutionRequest>;

export const PriceTraceStep = z.object({
  source: z.enum([
    'variant_base',
    'price_list',
    'bulk_tier',
    'contract_price',
    'subscribe_and_save',
    'discount',
    'gift_card',
    'store_credit',
  ]),
  sourceId: Uuid.optional(),
  deltaCents: z.number().int(),
  resultingUnitPriceCents: MoneyCents,
  note: z.string().max(255).optional(),
});
export type PriceTraceStep = z.infer<typeof PriceTraceStep>;

export const PricedLine = z.object({
  variantId: Uuid,
  quantity: z.number().int().positive(),
  currency: Currency,
  unitPriceCents: MoneyCents,
  subtotalCents: MoneyCents,
  trace: z.array(PriceTraceStep),
});
export type PricedLine = z.infer<typeof PricedLine>;
