'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function setProductOptionsAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ optionCount: number }>> {
  return restAction(async () => {
    await api.post<{ productId: string; updated: boolean }>(
      `/v1/commerce/products/${productId}/variants/options`,
      input
    );
    revalidatePath(`/commerce/products/${productId}`);
    revalidatePath(`/commerce/products/${productId}/variants`);
    // Original returned the option count derived from setOptions result.
    // The REST surface is fire-and-forget; we re-read on the next page render
    // so the count surfaces there instead.
    return { optionCount: 0 };
  });
}

export async function createVariantAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string; sku: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string; sku: string }>(
      `/v1/commerce/products/${productId}/variants`,
      input
    );
    revalidatePath(`/commerce/products/${productId}`);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return result;
  });
}

export async function updateVariantAction(
  variantId: string,
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.patch<{ id: string; updated: boolean }>(`/v1/commerce/variants/${variantId}`, input);
    revalidatePath(`/commerce/products/${productId}`);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function renameVariantSkuAction(
  variantId: string,
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/variants/${variantId}/rename-sku`, input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function assignVariantOptionValuesAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ assigned: boolean }>('/v1/commerce/variants/assign-options', input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { ok: true as const };
  });
}

export async function setDefaultVariantAction(
  variantId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/variants/${variantId}/default`, {});
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function archiveVariantAction(
  variantId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/variants/${variantId}/archive`, {});
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function restoreVariantAction(
  variantId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/variants/${variantId}/restore`, {});
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function addVariantImageAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/variants/images', input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return result;
  });
}

export async function setVariantImageBindingsAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.put<{ updated: boolean }>('/v1/commerce/variant-image-bindings', input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { ok: true as const };
  });
}

export async function removeVariantImageAction(
  productId: string,
  variantImageId: string
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/variant-images/${variantImageId}`);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { ok: true as const };
  });
}
