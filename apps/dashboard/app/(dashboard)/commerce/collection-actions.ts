'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function createCollectionAction(
  input: unknown
): Promise<ActionResult<{ id: string; handle: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string; handle: string }>(
      '/v1/commerce/collections',
      input
    );
    revalidatePath('/commerce/collections');
    return result;
  });
}

export async function updateCollectionAction(
  collectionId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/collections/${collectionId}`, input);
    revalidatePath('/commerce/collections');
    revalidatePath(`/commerce/collections/${collectionId}`);
    return { id: collectionId };
  });
}

export async function setCollectionProductsAction(
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ updated: boolean }>('/v1/commerce/collections/set-products', input);
    return { ok: true as const };
  });
}

export async function setProductCollectionsAction(
  productId: string,
  collectionIds: string[]
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.post<{ updated: boolean }>('/v1/commerce/collections/set-product-collections', {
      productId,
      collectionIds,
    });
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}

export async function reindexCollectionAction(
  collectionId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.post<{ id: string; reindexed: boolean }>(
      `/v1/commerce/collections/${collectionId}/reindex`,
      {}
    );
    revalidatePath(`/commerce/collections/${collectionId}`);
    return { id: collectionId };
  });
}

export async function deleteCollectionAction(
  collectionId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/collections/${collectionId}`);
    revalidatePath('/commerce/collections');
    return { id: collectionId };
  });
}
