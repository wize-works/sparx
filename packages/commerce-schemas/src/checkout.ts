// Checkout sessions — multi-step state machine driving cart -> order.
// The session captures the chosen provider refs (payment intent, shipping
// rate, tax breakdown) so checkout is replay-safe across page reloads.

import { z } from 'zod';

import { AddressSnapshot, Uuid } from '@sparx/crm-schemas';

import { Channel, Currency, MoneyCents } from './common';

export const CheckoutStep = z.enum([
  'cart_review',
  'contact',
  'shipping',
  'payment',
  'review',
  'completed',
  'expired',
]);
export type CheckoutStep = z.infer<typeof CheckoutStep>;

export const StartCheckoutInput = z.object({
  cartId: Uuid,
  channel: Channel,
  currency: Currency,
  customerEmail: z.string().email().optional(),
  customerId: Uuid.optional(),
  b2bAccountId: Uuid.optional(),
});
export type StartCheckoutInput = z.infer<typeof StartCheckoutInput>;

export const SubmitContactInput = z.object({
  sessionId: Uuid,
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  acceptsMarketing: z.boolean().default(false),
});
export type SubmitContactInput = z.infer<typeof SubmitContactInput>;

export const SubmitShippingInput = z.object({
  sessionId: Uuid,
  shippingAddress: AddressSnapshot,
  billingAddress: AddressSnapshot.optional(), // defaults to shipping
  // The chosen rate option ID returned by ShippingProvider.rateShipment.
  shippingRateRef: z.string().min(1).max(255),
  shippingProviderSlug: z.string().min(1).max(63),
});
export type SubmitShippingInput = z.infer<typeof SubmitShippingInput>;

export const SubmitPaymentInput = z.object({
  sessionId: Uuid,
  paymentProviderSlug: z.string().min(1).max(63),
  // The provider's payment intent / setup intent reference.
  paymentRef: z.string().min(1).max(255),
  // B2B: PO number + requested net terms.
  poNumber: z.string().max(63).optional(),
  paymentTermsRequested: z.enum(['prepay', 'net15', 'net30', 'net60', 'net90']).optional(),
});
export type SubmitPaymentInput = z.infer<typeof SubmitPaymentInput>;

export const CompleteCheckoutInput = z.object({
  sessionId: Uuid,
  idempotencyKey: z.string().min(8).max(127),
});
export type CompleteCheckoutInput = z.infer<typeof CompleteCheckoutInput>;

// Read shape — surfaced to the storefront so it can render the review
// step before final submit.
export const CheckoutSessionSnapshot = z.object({
  sessionId: Uuid,
  cartId: Uuid,
  step: CheckoutStep,
  channel: Channel,
  currency: Currency,
  customerEmail: z.string().email().optional(),
  customerId: Uuid.optional(),
  b2bAccountId: Uuid.optional(),
  shippingAddress: AddressSnapshot.optional(),
  billingAddress: AddressSnapshot.optional(),
  shippingProviderSlug: z.string().optional(),
  shippingRateRef: z.string().optional(),
  shippingDescription: z.string().optional(),
  paymentProviderSlug: z.string().optional(),
  paymentRef: z.string().optional(),
  taxBreakdownRef: z.string().optional(),
  poNumber: z.string().optional(),
  paymentTermsRequested: z.string().optional(),
  totals: z.object({
    subtotalCents: MoneyCents,
    discountTotalCents: MoneyCents,
    shippingTotalCents: MoneyCents,
    taxTotalCents: MoneyCents,
    giftCardAppliedCents: MoneyCents,
    storeCreditAppliedCents: MoneyCents,
    totalCents: MoneyCents,
  }),
  expiresAt: z.string().datetime(),
});
export type CheckoutSessionSnapshot = z.infer<typeof CheckoutSessionSnapshot>;
