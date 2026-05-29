// Inventory schemas — warehouses, levels, adjustments, reservations, lots,
// serials. Hazmat surfaces here (and on Product); the shipping provider
// reads it to decide ground/air/freight routing.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { AddressSnapshot, HazmatClass } from './common';

// ─── Warehouse ───────────────────────────────────────────────────────

export const WarehouseType = z.enum(['owned', '3pl', 'dropship', 'virtual']);
export type WarehouseType = z.infer<typeof WarehouseType>;

export const CreateWarehouseInput = z.object({
  name: z.string().min(1).max(127),
  code: z
    .string()
    .min(1)
    .max(15)
    .regex(/^[A-Z0-9_-]+$/),
  type: WarehouseType.default('owned'),
  address: AddressSnapshot,
  // Per-channel default — when an order on `channel` has no explicit
  // warehouse, the picker uses this as a fallback. JSONB on the column.
  defaultForChannel: z
    .array(z.enum(['storefront', 'b2b_portal', 'admin', 'subscription']))
    .default([]),
  hoursOfOperation: z
    .array(
      z.object({
        day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        openMinutes: z.number().int().min(0).max(1439),
        closeMinutes: z.number().int().min(0).max(1439),
      })
    )
    .max(7)
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isActive: z.boolean().default(true),
});
export type CreateWarehouseInput = z.infer<typeof CreateWarehouseInput>;

export const UpdateWarehouseInput = CreateWarehouseInput.partial();
export type UpdateWarehouseInput = z.infer<typeof UpdateWarehouseInput>;

// ─── Inventory levels + adjustments ──────────────────────────────────

export const InventoryAdjustReason = z.enum([
  'sale',
  'return',
  'recount',
  'loss',
  'damage',
  'transfer_in',
  'transfer_out',
  'receive',
  'reserve',
  'release',
  'manual',
]);
export type InventoryAdjustReason = z.infer<typeof InventoryAdjustReason>;

export const AdjustInventoryInput = z.object({
  variantId: Uuid,
  warehouseId: Uuid,
  delta: z.number().int(), // signed
  reason: InventoryAdjustReason,
  referenceType: z.string().max(63).optional(), // 'order', 'return', 'transfer'
  referenceId: Uuid.optional(),
  note: z.string().max(2000).optional(),
  unitCostCents: z.number().int().nonnegative().optional(),
});
export type AdjustInventoryInput = z.infer<typeof AdjustInventoryInput>;

export const SetReorderPolicyInput = z.object({
  variantId: Uuid,
  warehouseId: Uuid,
  reorderPoint: z.number().int().nonnegative(),
  reorderQuantity: z.number().int().positive(),
  leadTimeDays: z.number().int().nonnegative().max(365).optional(),
});
export type SetReorderPolicyInput = z.infer<typeof SetReorderPolicyInput>;

export const TransferInventoryInput = z.object({
  variantId: Uuid,
  fromWarehouseId: Uuid,
  toWarehouseId: Uuid,
  quantity: z.number().int().positive(),
  note: z.string().max(2000).optional(),
});
export type TransferInventoryInput = z.infer<typeof TransferInventoryInput>;

// ─── Reservations ─────────────────────────────────────────────────────
//
// Cart reservations are soft (30-minute TTL); order reservations are hard
// (released only by fulfillment, cancellation, or refund). Both flow
// through `inventoryService.reserve()` — only entry point.

export const ReserveInventoryInput = z.object({
  variantId: Uuid,
  warehouseId: Uuid.optional(), // service picks warehouse if absent
  quantity: z.number().int().positive(),
  holderType: z.enum(['cart', 'order', 'subscription']),
  holderId: Uuid,
  ttlSeconds: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24 * 30)
    .optional(),
});
export type ReserveInventoryInput = z.infer<typeof ReserveInventoryInput>;

// ─── Lot batches + serial units ───────────────────────────────────────

export const CreateLotBatchInput = z.object({
  variantId: Uuid,
  warehouseId: Uuid,
  lotNumber: z.string().min(1).max(63),
  manufacturedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  quantity: z.number().int().nonnegative(),
  hazmatClass: HazmatClass.default('none'),
  supplierBatchRef: z.string().max(127).optional(),
  certificateOfAnalysisMediaId: Uuid.optional(),
});
export type CreateLotBatchInput = z.infer<typeof CreateLotBatchInput>;

export const SerialUnitStatus = z.enum([
  'in_stock',
  'reserved',
  'sold',
  'returned',
  'scrapped',
  'lost',
]);
export type SerialUnitStatus = z.infer<typeof SerialUnitStatus>;

export const CreateSerialUnitInput = z.object({
  variantId: Uuid,
  warehouseId: Uuid,
  serial: z.string().min(1).max(127),
  lotBatchId: Uuid.optional(),
  status: SerialUnitStatus.default('in_stock'),
});
export type CreateSerialUnitInput = z.infer<typeof CreateSerialUnitInput>;

// Recall — flips matching sold units to a `recall_pending` state and
// generates a customer notification list. The actual workflow is a
// separate worker but its input is this.
export const InitiateRecallInput = z.object({
  lotBatchIds: z.array(Uuid).min(1).max(100),
  reason: z.string().min(1).max(2000),
  notifyCustomers: z.boolean().default(true),
});
export type InitiateRecallInput = z.infer<typeof InitiateRecallInput>;
