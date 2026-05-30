'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// ─── Price lists ──────────────────────────────────────────────────────

export async function createPriceListAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/price-lists', input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function updatePriceListAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/price-lists/${id}`, input);
    revalidatePath('/commerce/pricing');
    revalidatePath(`/commerce/pricing/${id}`);
    return { ok: true as const };
  });
}

export async function archivePriceListAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ id: string; archived: boolean }>(`/v1/commerce/price-lists/${id}/archive`, {});
    revalidatePath('/commerce/pricing');
    return { ok: true as const };
  });
}

// ─── Price list entries ──────────────────────────────────────────────

export async function setPriceListEntryAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/price-list-entries', input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function deletePriceListEntryAction(
  entryId: string,
  priceListId: string
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/price-list-entries/${entryId}`);
    revalidatePath(`/commerce/pricing/${priceListId}`);
    return { ok: true as const };
  });
}

// ─── Bulk tiers ──────────────────────────────────────────────────────

export async function createBulkTierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/bulk-tiers', input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function deleteBulkTierAction(tierId: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/bulk-tiers/${tierId}`);
    revalidatePath('/commerce/pricing');
    return { ok: true as const };
  });
}

// ─── Contract prices ─────────────────────────────────────────────────

export async function createContractPriceAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/contract-prices', input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function deleteContractPriceAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/contract-prices/${id}`);
    revalidatePath('/commerce/pricing');
    return { ok: true as const };
  });
}
