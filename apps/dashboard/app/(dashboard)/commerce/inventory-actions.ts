'use server';

// Inventory Server Actions — thin transport over @sparx/commerce
// inventoryService. Covers warehouses, levels, adjustments, transfers,
// reorder policies, low-stock report, and lot/serial management.

import { revalidatePath } from 'next/cache';

import { inventoryService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

// ─── Warehouses ───────────────────────────────────────────────────────

export async function listWarehousesAction(filter?: {
  includeInactive?: boolean;
}): Promise<ActionResult<Awaited<ReturnType<typeof inventoryService.listWarehouses>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    return inventoryService.listWarehouses(ctx, filter);
  });
}

export async function createWarehouseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await inventoryService.createWarehouse(ctx, input);
    revalidatePath('/commerce/warehouses');
    revalidatePath('/commerce/inventory');
    return result;
  });
}

export async function updateWarehouseAction(
  warehouseId: string,
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof inventoryService.updateWarehouse>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await inventoryService.updateWarehouse(ctx, warehouseId, input);
    revalidatePath('/commerce/warehouses');
    revalidatePath(`/commerce/warehouses/${warehouseId}`);
    revalidatePath('/commerce/inventory');
    return result;
  });
}

export async function archiveWarehouseAction(
  warehouseId: string
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await inventoryService.archiveWarehouse(ctx, warehouseId);
    revalidatePath('/commerce/warehouses');
    revalidatePath('/commerce/inventory');
    return { ok: true as const };
  });
}

// ─── Inventory levels + adjustments ──────────────────────────────────

export async function adjustInventoryAction(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof inventoryService.adjust>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await inventoryService.adjust(ctx, input);
    revalidatePath('/commerce/inventory');
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function setReorderPolicyAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await inventoryService.setReorderPolicy(ctx, input);
    revalidatePath('/commerce/inventory');
    return { ok: true as const };
  });
}

export async function transferInventoryAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await inventoryService.transfer(ctx, input);
    revalidatePath('/commerce/inventory');
    return { ok: true as const };
  });
}

// ─── Lot + serial ─────────────────────────────────────────────────────

export async function createLotBatchAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await inventoryService.createLotBatch(ctx, input);
    revalidatePath('/commerce/lots');
    return result;
  });
}

export async function createSerialUnitAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await inventoryService.createSerialUnit(ctx, input);
    revalidatePath('/commerce/lots');
    return result;
  });
}

export async function initiateRecallAction(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof inventoryService.initiateRecall>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await inventoryService.initiateRecall(ctx, input);
    revalidatePath('/commerce/lots');
    return result;
  });
}
