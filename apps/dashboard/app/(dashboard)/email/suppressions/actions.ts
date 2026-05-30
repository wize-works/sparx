'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from '../_lib/rest-action';
import { restAction } from '../_lib/rest-action';
import type { SuppressionRow } from '../_lib/types';

export async function addSuppressionAction(input: unknown): Promise<ActionResult<SuppressionRow>> {
  return restAction(async () => {
    const row = await api.post<SuppressionRow>('/v1/email/suppressions', input);
    revalidatePath('/email/suppressions');
    return row;
  });
}

export async function importSuppressionsAction(
  input: unknown
): Promise<ActionResult<{ added: number }>> {
  return restAction(async () => {
    const result = await api.post<{ added: number }>('/v1/email/suppressions/import', input);
    revalidatePath('/email/suppressions');
    return result;
  });
}

export async function removeSuppressionAction(id: string): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/email/suppressions/${id}`);
    revalidatePath('/email/suppressions');
    return { id };
  });
}
