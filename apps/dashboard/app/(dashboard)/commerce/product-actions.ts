'use server';

// Product Server Actions — thin transport over @sparx/commerce productService.
//
// Each action runs through `runAction()` so the module gate + error
// envelope stay consistent with the REST and GraphQL transports. Bulk
// status / tag operations live alongside single-row writes so the
// dashboard list view can wire one ⌘K command set without flipping
// between barrels.

import { revalidatePath } from 'next/cache';

import { productService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createProductAction(
  input: unknown
): Promise<ActionResult<{ id: string; handle: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await productService.create(ctx, input);
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function updateProductAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const product = await productService.update(ctx, productId, input);
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: product.id };
  });
}

export async function publishProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await productService.publish(ctx, productId);
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function unpublishProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await productService.unpublish(ctx, productId);
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function archiveProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await productService.archive(ctx, productId);
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function restoreProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await productService.restore(ctx, productId);
    revalidatePath('/commerce/products');
    revalidatePath(`/commerce/products/${productId}`);
    return { id: productId };
  });
}

export async function deleteProductAction(
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await productService.softDelete(ctx, productId);
    revalidatePath('/commerce/products');
    return { id: productId };
  });
}

export async function bulkUpdateProductStatusAction(
  input: unknown
): Promise<ActionResult<{ updated: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await productService.bulkUpdateStatus(ctx, input);
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function bulkTagProductsAction(
  input: unknown
): Promise<ActionResult<{ updated: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await productService.bulkTag(ctx, input);
    revalidatePath('/commerce/products');
    return result;
  });
}
