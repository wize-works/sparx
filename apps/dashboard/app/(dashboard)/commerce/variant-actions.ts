'use server';

// Variant Server Actions — thin transport over @sparx/commerce variantService.

import { revalidatePath } from 'next/cache';

import { variantService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function setProductOptionsAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ optionCount: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const options = await variantService.setOptions(ctx, productId, input);
    revalidatePath(`/commerce/products/${productId}`);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { optionCount: options.length };
  });
}

export async function createVariantAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string; sku: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await variantService.create(ctx, productId, input);
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
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.update(ctx, variantId, input);
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
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.renameSku(ctx, variantId, input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function assignVariantOptionValuesAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.assignOptionValues(ctx, input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { ok: true as const };
  });
}

export async function setDefaultVariantAction(
  variantId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.setDefault(ctx, variantId);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function archiveVariantAction(
  variantId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.archive(ctx, variantId);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function restoreVariantAction(
  variantId: string,
  productId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.restore(ctx, variantId);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { id: variantId };
  });
}

export async function addVariantImageAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await variantService.addImage(ctx, input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return result;
  });
}

export async function setVariantImageBindingsAction(
  productId: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.setImageBindings(ctx, input);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { ok: true as const };
  });
}

export async function removeVariantImageAction(
  productId: string,
  variantImageId: string
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await variantService.removeImage(ctx, variantImageId);
    revalidatePath(`/commerce/products/${productId}/variants`);
    return { ok: true as const };
  });
}
