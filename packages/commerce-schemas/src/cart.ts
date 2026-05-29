// Cart + cart-item shapes. Cart is the only place storefront/B2B writes
// before checkout; once a CheckoutSession is created the cart freezes.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { ConfigurationSelection, ResolvedConfiguration } from './bundles';
import { Channel, Currency, MoneyCents } from './common';
import { PriceTraceStep } from './pricing';

export const CartItemAttributes = z
  .object({
    giftMessage: z.string().max(2000).optional(),
    deliveryInstructions: z.string().max(2000).optional(),
    engraving: z.string().max(255).optional(),
    customFields: z.record(z.string(), z.string().max(2000)).optional(),
  })
  .partial();
export type CartItemAttributes = z.infer<typeof CartItemAttributes>;

export const AddCartItemInput = z.object({
  cartId: Uuid,
  variantId: Uuid,
  quantity: z.number().int().positive().default(1),
  configuration: ConfigurationSelection.optional(),
  attributes: CartItemAttributes.optional(),
});
export type AddCartItemInput = z.infer<typeof AddCartItemInput>;

export const UpdateCartItemInput = z.object({
  cartItemId: Uuid,
  quantity: z.number().int().nonnegative(), // 0 = remove
  attributes: CartItemAttributes.optional(),
});
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemInput>;

export const CreateCartInput = z.object({
  channel: Channel,
  currency: Currency,
  customerId: Uuid.optional(),
  // Cookie-bound guest token; set when no customer is authenticated.
  guestToken: z.string().min(8).max(127).optional(),
  // Optional carry-over: when a B2B contact starts a cart from a quote.
  fromQuoteId: Uuid.optional(),
  fromSubscriptionId: Uuid.optional(),
});
export type CreateCartInput = z.infer<typeof CreateCartInput>;

export const MergeCartsInput = z.object({
  targetCartId: Uuid, // typically the authenticated user's cart
  sourceCartId: Uuid, // typically the guest cart
  conflictPolicy: z
    .enum(['sum_quantities', 'prefer_source', 'prefer_target'])
    .default('sum_quantities'),
});
export type MergeCartsInput = z.infer<typeof MergeCartsInput>;

// Snapshot returned by cartService.get() and used by the storefront UI.
// Includes the priced state — line items, totals, applied discounts.
export const CartItemSnapshot = z.object({
  cartItemId: Uuid,
  variantId: Uuid,
  productId: Uuid,
  sku: z.string(),
  name: z.string(),
  imageUrl: z.string().url().optional(),
  quantity: z.number().int().positive(),
  unitPriceCents: MoneyCents,
  subtotalCents: MoneyCents,
  configuration: ResolvedConfiguration.optional(),
  attributes: CartItemAttributes.optional(),
  unitPriceTrace: z.array(PriceTraceStep),
});
export type CartItemSnapshot = z.infer<typeof CartItemSnapshot>;

export const CartTotals = z.object({
  subtotalCents: MoneyCents,
  discountTotalCents: MoneyCents,
  shippingTotalCents: MoneyCents,
  taxTotalCents: MoneyCents,
  giftCardAppliedCents: MoneyCents,
  storeCreditAppliedCents: MoneyCents,
  totalCents: MoneyCents,
});
export type CartTotals = z.infer<typeof CartTotals>;
