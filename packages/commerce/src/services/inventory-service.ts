// inventoryService — single entry point for every inventory mutation.
// Cart adds, order placements, fulfillments, returns, and recounts all
// flow through reserve() / release() / adjust() so the audit trail is
// uniform and the inventory.* events fire from one place.

import type {
  AdjustInventoryInput,
  CreateLotBatchInput,
  CreateSerialUnitInput,
  CreateWarehouseInput,
  InitiateRecallInput,
  ReserveInventoryInput,
  SetReorderPolicyInput,
  TransferInventoryInput,
  UpdateWarehouseInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Warehouses ───────────────────────────────────────────────────────

export function listWarehouses(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('inventoryService.listWarehouses');
}

export function createWarehouse(
  _ctx: ServiceContext,
  _input: CreateWarehouseInput
): Promise<{ id: string }> {
  return notImplemented('inventoryService.createWarehouse');
}

export function updateWarehouse(
  _ctx: ServiceContext,
  _warehouseId: string,
  _input: UpdateWarehouseInput
): Promise<void> {
  return notImplemented('inventoryService.updateWarehouse');
}

// ─── Inventory levels ─────────────────────────────────────────────────

export interface InventoryLevelRow {
  variantId: string;
  warehouseId: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
}

export function getLevel(
  _ctx: ServiceContext,
  _variantId: string,
  _warehouseId: string
): Promise<InventoryLevelRow | null> {
  return notImplemented('inventoryService.getLevel');
}

export function levelsForVariant(
  _ctx: ServiceContext,
  _variantId: string
): Promise<InventoryLevelRow[]> {
  return notImplemented('inventoryService.levelsForVariant');
}

export function adjust(
  _ctx: ServiceContext,
  _input: AdjustInventoryInput
): Promise<{ newOnHand: number }> {
  return notImplemented('inventoryService.adjust');
}

export function setReorderPolicy(
  _ctx: ServiceContext,
  _input: SetReorderPolicyInput
): Promise<void> {
  return notImplemented('inventoryService.setReorderPolicy');
}

export function transfer(_ctx: ServiceContext, _input: TransferInventoryInput): Promise<void> {
  return notImplemented('inventoryService.transfer');
}

// ─── Reservations (cart soft / order hard) ────────────────────────────

export interface ReservationResult {
  reservationId: string;
  warehouseId: string;
  expiresAt: string | null;
}

/** Single entry point for reserving stock. Throws CommerceOutOfStockError
 *  when policy is `deny` and stock is unavailable; succeeds with a
 *  preorder reservation when policy is `preorder`. */
export function reserve(
  _ctx: ServiceContext,
  _input: ReserveInventoryInput
): Promise<ReservationResult> {
  return notImplemented('inventoryService.reserve');
}

export function release(_ctx: ServiceContext, _reservationId: string): Promise<void> {
  return notImplemented('inventoryService.release');
}

export function commit(_ctx: ServiceContext, _reservationId: string): Promise<void> {
  return notImplemented('inventoryService.commit');
}

// ─── Lot batches + serial units ───────────────────────────────────────

export function createLotBatch(
  _ctx: ServiceContext,
  _input: CreateLotBatchInput
): Promise<{ id: string }> {
  return notImplemented('inventoryService.createLotBatch');
}

export function listLotsExpiringBefore(_ctx: ServiceContext, _date: string): Promise<unknown[]> {
  return notImplemented('inventoryService.listLotsExpiringBefore');
}

export function createSerialUnit(
  _ctx: ServiceContext,
  _input: CreateSerialUnitInput
): Promise<{ id: string }> {
  return notImplemented('inventoryService.createSerialUnit');
}

export function initiateRecall(
  _ctx: ServiceContext,
  _input: InitiateRecallInput
): Promise<{ affectedCustomers: number }> {
  return notImplemented('inventoryService.initiateRecall');
}

// ─── Low-stock + reorder report ───────────────────────────────────────

export interface LowStockRow {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  warehouseId: string;
  available: number;
  reorderPoint: number;
}

export function listLowStock(
  _ctx: ServiceContext,
  _filter: { warehouseId?: string; take?: number } = {}
): Promise<LowStockRow[]> {
  return notImplemented('inventoryService.listLowStock');
}
