'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface VehicleModelRow {
  id: string;
  makeId: string;
  name: string;
  yearStart: number | null;
  yearEnd: number | null;
}

interface VehicleEngineRow {
  id: string;
  modelId: string;
  name: string;
  liters: string | number | null;
}

export async function listVehicleModelsAction(
  makeId: string
): Promise<ActionResult<VehicleModelRow[]>> {
  return restAction(async () => {
    return api.get<VehicleModelRow[]>(`/v1/commerce/fitment/makes/${makeId}/models`);
  });
}

export async function listVehicleEnginesAction(
  modelId: string
): Promise<ActionResult<VehicleEngineRow[]>> {
  return restAction(async () => {
    return api.get<VehicleEngineRow[]>(`/v1/commerce/fitment/models/${modelId}/engines`);
  });
}

export async function createVehicleMakeAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/makes', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createVehicleModelAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/models', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createVehicleEngineAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/engines', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function setProductFitmentAction(
  productId: string,
  fitments: unknown[]
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.put<{ productId: string; updated: boolean }>(
      `/v1/commerce/products/${productId}/fitment`,
      { fitments }
    );
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}

export async function bulkAssignFitmentAction(
  input: unknown
): Promise<ActionResult<{ rowsAffected: number }>> {
  return restAction(async () => {
    const result = await api.post<{ rowsAffected: number }>(
      '/v1/commerce/fitment/bulk-assign',
      input
    );
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function deleteFitmentAction(
  productId: string,
  fitmentId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/fitment/${fitmentId}`);
    revalidatePath(`/commerce/products/${productId}`);
    return { id: fitmentId };
  });
}
