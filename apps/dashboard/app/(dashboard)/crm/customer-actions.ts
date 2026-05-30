'use server';

// Customer Server Actions — thin adapters over api-rest /v1/crm/customers.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface CustomerResponse {
  id: string;
}

interface MergeResponse {
  primary: { id: string };
  merged: { id: string }[];
}

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const customer = await api.post<CustomerResponse>('/v1/crm/customers', input);
    revalidatePath('/crm/customers');
    return { id: customer.id };
  });
}

export async function updateCustomerAction(
  customerId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const customer = await api.patch<CustomerResponse>(`/v1/crm/customers/${customerId}`, input);
    revalidatePath('/crm/customers');
    revalidatePath(`/crm/customers/${customerId}`);
    return { id: customer.id };
  });
}

export async function deleteCustomerAction(
  customerId: string
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/crm/customers/${customerId}`);
    revalidatePath('/crm/customers');
    return { id: customerId };
  });
}

export async function mergeCustomersAction(
  input: unknown
): Promise<ActionResult<{ primaryId: string; mergedIds: string[] }>> {
  return restAction(async () => {
    const result = await api.post<MergeResponse>('/v1/crm/customers/merge', input);
    revalidatePath('/crm');
    revalidatePath('/crm/customers');
    revalidatePath(`/crm/customers/${result.primary.id}`);
    return {
      primaryId: result.primary.id,
      mergedIds: result.merged.map((d) => d.id),
    };
  });
}
