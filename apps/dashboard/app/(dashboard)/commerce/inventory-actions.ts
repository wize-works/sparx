'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// ─── Warehouses ───────────────────────────────────────────────────────

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  archivedAt: string | null;
}

export async function listWarehousesAction(filter?: {
  includeInactive?: boolean;
}): Promise<ActionResult<WarehouseRow[]>> {
  return restAction(async () => {
    const q = new URLSearchParams();
    if (filter?.includeInactive) q.set('include_archived', 'true');
    return api.get<WarehouseRow[]>(`/v1/commerce/warehouses?${q.toString()}`);
  });
}

export async function createWarehouseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/warehouses', input);
    revalidatePath('/commerce/warehouses');
    revalidatePath('/commerce/inventory');
    return result;
  });
}

export async function updateWarehouseAction(
  warehouseId: string,
  input: unknown
): Promise<ActionResult<WarehouseRow>> {
  return restAction(async () => {
    const result = await api.patch<WarehouseRow>(`/v1/commerce/warehouses/${warehouseId}`, input);
    revalidatePath('/commerce/warehouses');
    revalidatePath(`/commerce/warehouses/${warehouseId}`);
    revalidatePath('/commerce/inventory');
    return result;
  });
}

export async function archiveWarehouseAction(
  warehouseId: string
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ id: string; archived: boolean }>(
      `/v1/commerce/warehouses/${warehouseId}/archive`,
      {}
    );
    revalidatePath('/commerce/warehouses');
    revalidatePath('/commerce/inventory');
    return { ok: true as const };
  });
}

// ─── Inventory levels + adjustments ──────────────────────────────────

export async function adjustInventoryAction(
  input: unknown
): Promise<ActionResult<{ levelAfter: number }>> {
  return restAction(async () => {
    const result = await api.post<{ levelAfter: number }>('/v1/commerce/inventory/adjust', input);
    revalidatePath('/commerce/inventory');
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function setReorderPolicyAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ updated: boolean }>('/v1/commerce/inventory/reorder-policy', input);
    revalidatePath('/commerce/inventory');
    return { ok: true as const };
  });
}

export async function transferInventoryAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ transferred: boolean }>('/v1/commerce/inventory/transfer', input);
    revalidatePath('/commerce/inventory');
    return { ok: true as const };
  });
}

// ─── Lot + serial ─────────────────────────────────────────────────────

export async function createLotBatchAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/inventory/lots', input);
    revalidatePath('/commerce/lots');
    return result;
  });
}

export async function createSerialUnitAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/inventory/serials', input);
    revalidatePath('/commerce/lots');
    return result;
  });
}

export async function initiateRecallAction(
  input: unknown
): Promise<ActionResult<{ recallId: string }>> {
  return restAction(async () => {
    const result = await api.post<{ recallId: string }>('/v1/commerce/inventory/recalls', input);
    revalidatePath('/commerce/lots');
    return result;
  });
}
