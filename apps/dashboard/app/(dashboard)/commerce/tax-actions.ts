'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  CreateTaxExemptionInput,
  CreateTaxRateInput,
  CreateTaxZoneInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// ─── Zones ───────────────────────────────────────────────────────────

export async function createTaxZoneAction(
  input: CreateTaxZoneInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/tax/zones', input);
    revalidatePath('/commerce/tax');
    return result;
  });
}

export async function updateTaxZoneAction(
  id: string,
  input: Partial<CreateTaxZoneInput>
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/tax/zones/${id}`, input);
    revalidatePath('/commerce/tax');
    revalidatePath(`/commerce/tax/zones/${id}`);
  });
}

export async function deleteTaxZoneAction(id: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/tax/zones/${id}`);
    revalidatePath('/commerce/tax');
  });
}

// ─── Rates ───────────────────────────────────────────────────────────

export async function createTaxRateAction(
  input: CreateTaxRateInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/tax/rates', input);
    revalidatePath(`/commerce/tax/zones/${input.zoneId}`);
    return result;
  });
}

export async function deleteTaxRateAction(id: string, zoneId: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/tax/rates/${id}`);
    revalidatePath(`/commerce/tax/zones/${zoneId}`);
  });
}

// ─── Exemptions ──────────────────────────────────────────────────────

export async function createTaxExemptionAction(
  input: CreateTaxExemptionInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/tax/exemptions', input);
    revalidatePath('/commerce/tax');
    return result;
  });
}

export async function deleteTaxExemptionAction(id: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/tax/exemptions/${id}`);
    revalidatePath('/commerce/tax');
  });
}
