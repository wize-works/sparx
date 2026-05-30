'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function createCategoryAction(
  input: unknown
): Promise<ActionResult<{ id: string; handle: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string; handle: string }>('/v1/commerce/categories', input);
    revalidatePath('/commerce/categories');
    return result;
  });
}

export async function updateCategoryAction(
  categoryId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/categories/${categoryId}`, input);
    revalidatePath('/commerce/categories');
    revalidatePath(`/commerce/categories/${categoryId}`);
    return { id: categoryId };
  });
}

export async function reparentCategoryAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ reparented: boolean }>('/v1/commerce/categories/reparent', input);
    revalidatePath('/commerce/categories');
    return { ok: true as const };
  });
}

export async function deleteCategoryAction(
  categoryId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/categories/${categoryId}`);
    revalidatePath('/commerce/categories');
    return { id: categoryId };
  });
}

export async function setProductCategoriesAction(
  productId: string,
  categoryIds: string[]
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ updated: boolean }>('/v1/commerce/categories/set-product-categories', {
      productId,
      categoryIds,
    });
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}
