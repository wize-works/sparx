// Discounts, gift cards, store credit. The pricing pipeline applies these
// after the base/price-list/bulk-tier resolution from ./pricing.ts.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { Channel, Currency, MoneyCents } from './common';

// ─── Discounts ────────────────────────────────────────────────────────

export const DiscountType = z.enum(['percent', 'fixed', 'free_shipping', 'buy_x_get_y', 'bundle']);
export type DiscountType = z.infer<typeof DiscountType>;

export const DiscountScope = z.enum(['order', 'product', 'collection', 'shipping']);
export type DiscountScope = z.infer<typeof DiscountScope>;

export const DiscountStacking = z.enum([
  'none',
  'combine_with_subscribe_and_save',
  'combine_with_loyalty',
  'combine_with_all',
]);
export type DiscountStacking = z.infer<typeof DiscountStacking>;

// Conditions are stored as JSONB on the column for forward compatibility.
// The discriminated union below covers everything PRD §3.5 calls out.
export const DiscountCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('min_subtotal_cents'), value: MoneyCents }),
  z.object({ kind: z.literal('min_item_count'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('customer_segment_in'), value: z.array(Uuid).max(50) }),
  z.object({ kind: z.literal('b2b_account_in'), value: z.array(Uuid).max(500) }),
  z.object({ kind: z.literal('channel_in'), value: z.array(Channel) }),
  z.object({ kind: z.literal('first_order_only'), value: z.boolean() }),
  z.object({ kind: z.literal('product_in'), value: z.array(Uuid).max(500) }),
  z.object({ kind: z.literal('collection_in'), value: z.array(Uuid).max(50) }),
  z.object({ kind: z.literal('fitment_matches'), value: z.boolean() }),
  z.object({
    kind: z.literal('buy_x_get_y'),
    buyVariantIds: z.array(Uuid).min(1).max(500),
    buyQuantity: z.number().int().positive(),
    getVariantIds: z.array(Uuid).min(1).max(500),
    getQuantity: z.number().int().positive(),
    getDiscountPercent: z.number().min(0).max(100), // 100 = "get free"
  }),
]);
export type DiscountCondition = z.infer<typeof DiscountCondition>;

export const CreateDiscountInput = z.object({
  code: z.string().min(1).max(63).nullable().optional(), // null = automatic
  name: z.string().min(1).max(127),
  description: z.string().max(2000).optional(),
  type: DiscountType,
  scope: DiscountScope.default('order'),
  // Required when type=percent/fixed; ignored for free_shipping/buy_x_get_y.
  valueCents: MoneyCents.optional(), // for fixed
  valuePercent: z.number().min(0).max(100).optional(), // for percent
  currency: Currency.optional(),
  conditions: z.array(DiscountCondition).max(20).default([]),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  totalUsageLimit: z.number().int().positive().optional(),
  perCustomerLimit: z.number().int().positive().default(1),
  stacking: DiscountStacking.default('none'),
  priority: z.number().int().nonnegative().default(0),
});
export type CreateDiscountInput = z.infer<typeof CreateDiscountInput>;

export const UpdateDiscountInput = CreateDiscountInput.partial();
export type UpdateDiscountInput = z.infer<typeof UpdateDiscountInput>;

export const RedeemDiscountInput = z.object({
  cartId: Uuid,
  code: z.string().min(1).max(63),
});
export type RedeemDiscountInput = z.infer<typeof RedeemDiscountInput>;

// ─── Gift cards ───────────────────────────────────────────────────────

export const GiftCardStatus = z.enum(['active', 'spent', 'expired', 'cancelled']);
export type GiftCardStatus = z.infer<typeof GiftCardStatus>;

export const IssueGiftCardInput = z.object({
  initialBalanceCents: MoneyCents.refine((v) => v > 0, 'Gift card must have a positive balance'),
  currency: Currency,
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().max(127).optional(),
  message: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
  // When set, the gift card was sold as a product (the order item that
  // funded it). Used for refund handling — refunding the sale revokes
  // the unspent balance.
  purchasingOrderItemId: Uuid.optional(),
  customCode: z
    .string()
    .min(8)
    .max(63)
    .regex(/^[A-Z0-9-]+$/)
    .optional(),
});
export type IssueGiftCardInput = z.infer<typeof IssueGiftCardInput>;

export const RedeemGiftCardInput = z.object({
  cartId: Uuid,
  code: z.string().min(8).max(63),
});
export type RedeemGiftCardInput = z.infer<typeof RedeemGiftCardInput>;

export const AdjustGiftCardInput = z.object({
  giftCardId: Uuid,
  deltaCents: z.number().int(), // signed
  reason: z.string().min(1).max(255),
});
export type AdjustGiftCardInput = z.infer<typeof AdjustGiftCardInput>;

// ─── Store credit ─────────────────────────────────────────────────────

export const StoreCreditReason = z.enum([
  'grant',
  'refund',
  'spend',
  'adjust',
  'expire',
  'loyalty_conversion',
]);
export type StoreCreditReason = z.infer<typeof StoreCreditReason>;

export const GrantStoreCreditInput = z.object({
  customerId: Uuid,
  amountCents: MoneyCents.refine((v) => v > 0, 'Grant amount must be positive'),
  currency: Currency,
  reason: StoreCreditReason.default('grant'),
  note: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type GrantStoreCreditInput = z.infer<typeof GrantStoreCreditInput>;

export const SpendStoreCreditInput = z.object({
  customerId: Uuid,
  cartId: Uuid,
  amountCents: MoneyCents.refine((v) => v > 0, 'Spend amount must be positive'),
});
export type SpendStoreCreditInput = z.infer<typeof SpendStoreCreditInput>;
