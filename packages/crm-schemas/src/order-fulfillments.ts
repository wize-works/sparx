// CRM — Order fulfillment input schemas.
//
// One fulfillment record per shipment / drop-ship batch / digital delivery.
// Per-line-item quantities use FulfillmentLineInput so partial shipments
// are explicit.

import { z } from 'zod';

import { Uuid } from './common.js';

export const FulfillmentStatus = z.enum(['pending', 'shipped', 'delivered', 'failed', 'cancelled']);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatus>;

export const Carrier = z.enum([
  'ups',
  'usps',
  'fedex',
  'dhl',
  'digital',
  'dropship',
  'pickup',
  'other',
]);
export type Carrier = z.infer<typeof Carrier>;

export const FulfillmentLineInput = z.object({
  orderItemId: Uuid,
  quantity: z.number().int().positive(),
});
export type FulfillmentLineInput = z.infer<typeof FulfillmentLineInput>;

// Create a fulfillment for an order. Lines determine which items + how many
// units are in this shipment; the service enforces the cap against
// (quantity - quantity_fulfilled).
export const CreateFulfillmentInput = z.object({
  orderId: Uuid,
  status: FulfillmentStatus.default('pending'),
  carrier: Carrier.optional(),
  carrierOther: z.string().max(63).optional(), // when carrier === 'other'
  service: z.string().max(63).optional(),
  trackingNumber: z.string().max(127).optional(),
  trackingUrl: z.string().url().max(2048).optional(),
  shippedAt: z.string().datetime().optional(),
  notes: z.string().max(10_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  lines: z.array(FulfillmentLineInput).min(1),
});
export type CreateFulfillmentInput = z.infer<typeof CreateFulfillmentInput>;

// Update lifecycle on a fulfillment — most commonly to mark it delivered
// after a carrier callback. Status transitions: pending → shipped → delivered;
// pending → cancelled / failed.
export const UpdateFulfillmentInput = z.object({
  fulfillmentId: Uuid,
  status: FulfillmentStatus.optional(),
  trackingNumber: z.string().max(127).nullable().optional(),
  trackingUrl: z.string().url().max(2048).nullable().optional(),
  shippedAt: z.string().datetime().nullable().optional(),
  deliveredAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateFulfillmentInput = z.infer<typeof UpdateFulfillmentInput>;
