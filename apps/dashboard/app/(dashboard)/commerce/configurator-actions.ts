'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// ─── Bundles ──────────────────────────────────────────────────────────

export async function createBundleAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/bundles', input);
    revalidatePath('/commerce/bundles');
    return result;
  });
}

export async function updateBundleAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/bundles/${id}`, input);
    revalidatePath('/commerce/bundles');
    revalidatePath(`/commerce/bundles/${id}`);
    return { ok: true as const };
  });
}

export async function deleteBundleAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/bundles/${id}`);
    revalidatePath('/commerce/bundles');
    return { ok: true as const };
  });
}

// ─── Configuration templates ─────────────────────────────────────────

export async function createTemplateAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/configurator-templates', input);
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
  return restAction(async () => {
    await api.patch<{ id: string }>(`/v1/commerce/configurator-templates/${id}`, input);
    revalidatePath('/commerce/configurator');
    revalidatePath(`/commerce/configurator/${id}`);
    return { ok: true as const };
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/configurator-templates/${id}`);
    revalidatePath('/commerce/configurator');
    return { ok: true as const };
  });
}
