'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function createProductAction(
  input: unknown
): Promise<ActionResult<{ id: string; handle: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string; handle: string }>('/v1/commerce/products', input);
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function updateProductAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const product = await api.patch<{ id: string }>(
      `/v1/commerce/products/${productId}`,
      input
    );
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: product.id };
  });
}

export async function publishProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/products/${productId}/publish`, {});
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function unpublishProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/products/${productId}/unpublish`, {});
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function archiveProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/products/${productId}/archive`, {});
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function restoreProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/products/${productId}/restore`, {});
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function deleteProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/products/${productId}`);
    revalidatePath('/commerce/products');
    return { id: productId };
  });
}

export async function bulkUpdateProductStatusAction(
  input: unknown
): Promise<ActionResult<{ updated: number }>> {
  return restAction(async () => {
    const result = await api.post<{ updated: number }>(
      '/v1/commerce/products/bulk-status',
      input
    );
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function bulkTagProductsAction(
  input: unknown
): Promise<ActionResult<{ updated: number }>> {
  return restAction(async () => {
    const result = await api.post<{ updated: number }>('/v1/commerce/products/bulk-tag', input);
    revalidatePath('/commerce/products');
    return result;
  });
}
