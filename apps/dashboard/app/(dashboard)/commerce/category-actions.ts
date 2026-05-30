'use server';

// Category Server Actions — thin transport over @sparx/commerce categoryService.

import { revalidatePath } from 'next/cache';

import { categoryService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createCategoryAction(
  input: unknown
): Promise<ActionResult<{ id: string; handle: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await categoryService.create(ctx, input);
    revalidatePath('/commerce/categories');
    return result;
  });
}

export async function updateCategoryAction(
  categoryId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await categoryService.update(ctx, categoryId, input);
    revalidatePath('/commerce/categories');
    revalidatePath(`/commerce/categories/${categoryId}`);
    return { id: categoryId };
  });
}

export async function reparentCategoryAction(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await categoryService.reparent(ctx, input);
    revalidatePath('/commerce/categories');
    return { ok: true as const };
  });
}

export async function deleteCategoryAction(
  categoryId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await categoryService.remove(ctx, categoryId);
    revalidatePath('/commerce/categories');
    return { id: categoryId };
  });
}

export async function setProductCategoriesAction(
  productId: string,
  categoryIds: string[]
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await categoryService.setProductCategories(ctx, productId, categoryIds);
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}
