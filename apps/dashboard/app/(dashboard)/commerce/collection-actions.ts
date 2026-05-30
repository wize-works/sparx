'use server';

// Collection Server Actions — thin transport over @sparx/commerce collectionService.

import { revalidatePath } from 'next/cache';

import { collectionService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createCollectionAction(
  input: unknown
): Promise<ActionResult<{ id: string; handle: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await collectionService.create(ctx, input);
    revalidatePath('/commerce/collections');
    return result;
  });
}

export async function updateCollectionAction(
  collectionId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await collectionService.update(ctx, collectionId, input);
    revalidatePath('/commerce/collections');
    revalidatePath(`/commerce/collections/${collectionId}`);
    return { id: collectionId };
  });
}

export async function setCollectionProductsAction(
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await collectionService.setProducts(ctx, input);
    return { ok: true as const };
  });
}

export async function setProductCollectionsAction(
  productId: string,
  collectionIds: string[]
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await collectionService.setProductCollections(ctx, productId, collectionIds);
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}

export async function reindexCollectionAction(
  collectionId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await collectionService.reindex(ctx, collectionId);
    revalidatePath(`/commerce/collections/${collectionId}`);
    return { id: collectionId };
  });
}

export async function deleteCollectionAction(
  collectionId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await collectionService.remove(ctx, collectionId);
    revalidatePath('/commerce/collections');
    return { id: collectionId };
  });
}
