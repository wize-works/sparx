// CRM — Order input schemas.
//
// The CRM owns the order spine. Create / update at the header level here;
// payment, refund, and fulfillment subresources live in their own files
// (order-payments.ts, order-fulfillments.ts).

import { z } from 'zod';

import { AddressSnapshot, Currency, LineItemInput, Money } from './common-commerce';
import { Uuid } from './common';

export const OrderStatus = z.enum(['placed', 'fulfilled', 'delivered', 'cancelled', 'refunded']);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderPaymentStatus = z.enum(['unpaid', 'partially_paid', 'paid', 'refunded']);
export type OrderPaymentStatus = z.infer<typeof OrderPaymentStatus>;

export const OrderChannel = z.enum(['storefront', 'b2b_portal', 'admin', 'import', 'mcp']);
export type OrderChannel = z.infer<typeof OrderChannel>;

// CreateOrderInput — full order header + initial line items in one shot.
// The service computes subtotal/total from items and writes them
// transactionally so the read-side never observes a partial order.
export const CreateOrderInput = z.object({
  customerId: Uuid,
  orderNumber: z.string().min(1).max(63).optional(), // auto-generated if absent
  channel: OrderChannel.optional(),
  source: z.string().max(63).optional(),

  currency: Currency.default('USD'),
  shippingTotal: Money.default(0),
  discountTotal: Money.default(0),
  // Header-level tax override. If omitted (undefined), the service sums
  // line-level taxAmounts; if provided, this value wins.
  taxTotal: Money.optional(),

  shippingAddress: AddressSnapshot.optional(),
  billingAddress: AddressSnapshot.optional(),

  placedAt: z.string().datetime().optional(), // defaults to now

  customerNote: z.string().max(10_000).optional(),
  internalNote: z.string().max(10_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  items: z.array(LineItemInput).min(1).max(500),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

// Header-level mutations only. Status transitions go through their own
// dedicated service methods (fulfill / deliver / cancel / refund) so the
// lifecycle invariants stay in one place and the matching events fire.
export const UpdateOrderInput = z.object({
  customerNote: z.string().max(10_000).nullable().optional(),
  internalNote: z.string().max(10_000).nullable().optional(),
  shippingAddress: AddressSnapshot.nullable().optional(),
  billingAddress: AddressSnapshot.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateOrderInput = z.infer<typeof UpdateOrderInput>;

export const ListOrdersInput = z.object({
  customerId: Uuid.optional(),
  status: OrderStatus.optional(),
  paymentStatus: OrderPaymentStatus.optional(),
  channel: OrderChannel.optional(),
  placedSince: z.string().datetime().optional(),
  placedUntil: z.string().datetime().optional(),
  q: z.string().max(255).optional(), // matches order_number prefix
  take: z.number().int().min(1).max(250).default(50),
  skip: z.number().int().min(0).default(0),
  sortBy: z.enum(['placedAt', 'total', 'createdAt', 'updatedAt']).default('placedAt'),
});
export type ListOrdersInput = z.infer<typeof ListOrdersInput>;

export const CancelOrderInput = z.object({
  orderId: Uuid,
  reason: z.string().max(500).optional(),
});
export type CancelOrderInput = z.infer<typeof CancelOrderInput>;
