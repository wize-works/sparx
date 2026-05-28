// CRM — Order payment + refund input schemas.
//
// Multiple payments per order supports partial payments, split tenders, and
// net-terms B2B with multiple installments. Refunds reference the payment
// they reverse (or null for goodwill credits against the order header);
// per-line-item refund quantities use RefundLineInput.

import { z } from 'zod';

import { Currency, Money } from './common-commerce.js';
import { Uuid } from './common.js';

export const PaymentProcessor = z.enum([
  'stripe',
  'paypal',
  'manual',
  'check',
  'wire',
  'net_terms',
]);
export type PaymentProcessor = z.infer<typeof PaymentProcessor>;

export const PaymentStatus = z.enum([
  'pending',
  'authorized',
  'captured',
  'failed',
  'voided',
  'refunded',
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

// Record a payment against an order. Status defaults to "captured" because
// most paths (manual check entry, completed Stripe webhook) record after
// the money has moved. Pending auth paths set status explicitly.
export const RecordPaymentInput = z.object({
  orderId: Uuid,
  processor: PaymentProcessor,
  processorRef: z.string().max(255).optional(),
  amount: Money,
  currency: Currency.default('USD'),
  status: PaymentStatus.default('captured'),
  authorizedAt: z.string().datetime().optional(),
  capturedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

export const VoidPaymentInput = z.object({
  paymentId: Uuid,
  reason: z.string().max(500).optional(),
});
export type VoidPaymentInput = z.infer<typeof VoidPaymentInput>;

// Per-line-item refund quantity. Quantity caps at the order item's
// (quantity - quantity_refunded) — service enforces.
export const RefundLineInput = z.object({
  orderItemId: Uuid,
  quantity: z.number().int().positive(),
  amount: Money,
});
export type RefundLineInput = z.infer<typeof RefundLineInput>;

// Issue a refund. paymentId targets which payment to reverse; omit for a
// goodwill credit. `lines` is optional — header-only refunds (e.g. shipping)
// pass amount without specifying which items refunded.
export const RecordRefundInput = z.object({
  orderId: Uuid,
  paymentId: Uuid.optional(),
  amount: Money,
  currency: Currency.default('USD'),
  reason: z.string().max(500).optional(),
  processorRef: z.string().max(255).optional(),
  lines: z.array(RefundLineInput).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RecordRefundInput = z.infer<typeof RecordRefundInput>;
