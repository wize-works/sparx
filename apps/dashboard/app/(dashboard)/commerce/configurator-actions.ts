'use server';

// Configurator Server Actions — thin transport over @sparx/commerce
// configuratorService. Covers bundles + configuration templates.

import { revalidatePath } from 'next/cache';

import { configuratorService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

// ─── Bundles ──────────────────────────────────────────────────────────

export async function createBundleAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await configuratorService.createBundle(ctx, input);
    revalidatePath('/commerce/bundles');
    return result;
  });
}

export async function updateBundleAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await configuratorService.updateBundle(ctx, id, input);
    revalidatePath('/commerce/bundles');
    revalidatePath(`/commerce/bundles/${id}`);
    return { ok: true as const };
  });
}

export async function deleteBundleAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await configuratorService.deleteBundle(ctx, id);
    revalidatePath('/commerce/bundles');
    return { ok: true as const };
  });
}

// ─── Configuration templates ─────────────────────────────────────────

export async function createTemplateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await configuratorService.createTemplate(ctx, input);
    revalidatePath('/commerce/configurator');
    if (
      typeof input === 'object' &&
      input !== null &&
      'productId' in input &&
      typeof input.productId === 'string'
    ) {
      revalidatePath(`/commerce/products/${input.productId}`);
    }
    return result;
  });
}

export async function updateTemplateAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await configuratorService.updateTemplate(ctx, id, input);
    revalidatePath('/commerce/configurator');
    revalidatePath(`/commerce/configurator/${id}`);
    return { ok: true as const };
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await configuratorService.deleteTemplate(ctx, id);
    revalidatePath('/commerce/configurator');
    return { ok: true as const };
  });
}
