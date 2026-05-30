'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

// Generalized fitment — domain → category → item → variant. The dashboard
// surfaces the tree using domain.labels (e.g. Make/Model/Engine for
// vehicle, Brand/Model for device) and domain.rangeUnit for narrowing.
//
// Sparx seeds a global "vehicle" domain so the Gillett case works
// out-of-the-box; tenants register their own domains for other catalog
// shapes (pet store registers Species → Breed, phone case shop
// registers Brand → Model, etc.).

interface FitmentDomainRow {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  labels: { l1: string; l2?: string; l3?: string; range?: string };
  rangeUnit: string | null;
  isGlobal: boolean;
  categoryCount: number;
}

interface FitmentCategoryRow {
  id: string;
  domainId: string;
  name: string;
  slug: string;
  isGlobal: boolean;
  itemCount: number;
}

interface FitmentItemRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  isGlobal: boolean;
  variantCount: number;
}

interface FitmentVariantRow {
  id: string;
  itemId: string;
  name: string;
  slug: string;
  attributes: Record<string, unknown>;
  isGlobal: boolean;
}

export async function listFitmentDomainsAction(): Promise<ActionResult<FitmentDomainRow[]>> {
  return restAction(async () => api.get<FitmentDomainRow[]>('/v1/commerce/fitment/domains'));
}

export async function listFitmentCategoriesAction(
  domainId: string
): Promise<ActionResult<FitmentCategoryRow[]>> {
  return restAction(async () =>
    api.get<FitmentCategoryRow[]>(`/v1/commerce/fitment/domains/${domainId}/categories`)
  );
}

export async function listFitmentItemsAction(
  categoryId: string
): Promise<ActionResult<FitmentItemRow[]>> {
  return restAction(async () =>
    api.get<FitmentItemRow[]>(`/v1/commerce/fitment/categories/${categoryId}/items`)
  );
}

export async function listFitmentVariantsAction(
  itemId: string
): Promise<ActionResult<FitmentVariantRow[]>> {
  return restAction(async () =>
    api.get<FitmentVariantRow[]>(`/v1/commerce/fitment/items/${itemId}/variants`)
  );
}

export async function createFitmentDomainAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/domains', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createFitmentCategoryAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/categories', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createFitmentItemAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/items', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createFitmentVariantAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>('/v1/commerce/fitment/variants', input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function setProductFitmentAction(
  productId: string,
  fitments: unknown[]
): Promise<ActionResult<{ ok: true }>> {
  return restAction(async () => {
    await api.put<{ productId: string; updated: boolean }>(
      `/v1/commerce/products/${productId}/fitment`,
      { fitments }
    );
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}

export async function bulkAssignFitmentAction(
  input: unknown
): Promise<ActionResult<{ rowsAffected: number }>> {
  return restAction(async () => {
    const result = await api.post<{ rowsAffected: number }>(
      '/v1/commerce/fitment/bulk-assign',
      input
    );
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function deleteFitmentAction(
  productId: string,
  fitmentId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/fitment/${fitmentId}`);
    revalidatePath(`/commerce/products/${productId}`);
    return { id: fitmentId };
  });
}
