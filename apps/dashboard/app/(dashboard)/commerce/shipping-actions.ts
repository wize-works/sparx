'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  CreateShippingProfileInput,
  CreateShippingRateInput,
  CreateShippingZoneInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// ─── Zones ───────────────────────────────────────────────────────────

export async function createShippingZoneAction(
  input: CreateShippingZoneInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/shipping/zones', input);
    revalidatePath('/commerce/shipping');
    return result;
  });
}

export async function updateShippingZoneAction(
  id: string,
  input: Partial<CreateShippingZoneInput>
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/shipping/zones/${id}`, input);
    revalidatePath('/commerce/shipping');
    revalidatePath(`/commerce/shipping/zones/${id}`);
  });
}

export async function deleteShippingZoneAction(id: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/shipping/zones/${id}`);
    revalidatePath('/commerce/shipping');
  });
}

// ─── Profiles ────────────────────────────────────────────────────────

export async function createShippingProfileAction(
  input: CreateShippingProfileInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/shipping/profiles', input);
    revalidatePath('/commerce/shipping');
    return result;
  });
}

export async function updateShippingProfileAction(
  id: string,
  input: Partial<CreateShippingProfileInput>
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/shipping/profiles/${id}`, input);
    revalidatePath('/commerce/shipping');
    revalidatePath(`/commerce/shipping/profiles/${id}`);
  });
}

export async function deleteShippingProfileAction(id: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/shipping/profiles/${id}`);
    revalidatePath('/commerce/shipping');
  });
}

// ─── Rates ───────────────────────────────────────────────────────────

export async function createShippingRateAction(
  input: CreateShippingRateInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/shipping/rates', input);
    revalidatePath(`/commerce/shipping/zones/${input.zoneId}`);
    return result;
  });
}

export async function deleteShippingRateAction(
  id: string,
  zoneId: string
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/shipping/rates/${id}`);
    revalidatePath(`/commerce/shipping/zones/${zoneId}`);
  });
}
