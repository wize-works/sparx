'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// ─── Discounts ────────────────────────────────────────────────────────

export async function createDiscountAction(
  input: unknown
): Promise<ActionResult<{ id: string; code: string | null }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string; code: string | null }>(
      '/v1/commerce/discounts',
      input
    );
    revalidatePath('/commerce/discounts');
    return result;
  });
}

export async function updateDiscountAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/discounts/${id}`, input);
    revalidatePath('/commerce/discounts');
    revalidatePath(`/commerce/discounts/${id}`);
    return { ok: true as const };
  });
}

export async function archiveDiscountAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ id: string; archived: boolean }>(`/v1/commerce/discounts/${id}/archive`, {});
    revalidatePath('/commerce/discounts');
    return { ok: true as const };
  });
}

export async function activateDiscountAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ id: string; activated: boolean }>(`/v1/commerce/discounts/${id}/activate`, {});
    revalidatePath('/commerce/discounts');
    return { ok: true as const };
  });
}

// ─── Gift cards ───────────────────────────────────────────────────────

interface GiftCardLookup {
  id: string;
  code: string;
  balanceCents: number;
  currency: string;
  status: string;
}

export async function issueGiftCardAction(
  input: unknown
): Promise<ActionResult<{ id: string; code: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string; code: string }>('/v1/commerce/gift-cards', input);
    revalidatePath('/commerce/gift-cards');
    return result;
  });
}

export async function lookupGiftCardAction(
  codeOrId: string
): Promise<ActionResult<GiftCardLookup>> {
  return restAction(async () => {
    return api.get<GiftCardLookup>(
      `/v1/commerce/gift-cards/lookup?code=${encodeURIComponent(codeOrId)}`
    );
  });
}

export async function adjustGiftCardAction(
  input: unknown
): Promise<ActionResult<{ newBalanceCents: number }>> {
  return restAction(async () => {
    const result = await api.post<{ newBalanceCents: number }>(
      '/v1/commerce/gift-cards/adjust',
      input
    );
    revalidatePath('/commerce/gift-cards');
    return result;
  });
}

// ─── Store credit ─────────────────────────────────────────────────────

export async function grantStoreCreditAction(
  input: unknown
): Promise<ActionResult<{ newBalanceCents: number }>> {
  return restAction(async () => {
    const result = await api.post<{ newBalanceCents: number }>(
      '/v1/commerce/store-credit/grant',
      input
    );
    revalidatePath('/commerce/store-credit');
    return result;
  });
}
