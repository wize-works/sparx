'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from '../_lib/rest-action';
import { restAction } from '../_lib/rest-action';
import type { AutomationRow } from '../_lib/types';

export async function updateAutomationAction(
  id: string,
  input: unknown
): Promise<ActionResult<AutomationRow>> {
  return restAction(async () => {
    const row = await api.patch<AutomationRow>(`/v1/email/automations/${id}`, input);
    revalidatePath('/email/automations');
    return row;
  });
}

export async function bootstrapAutomationsAction(): Promise<
  ActionResult<{ bootstrapped: boolean; automations: number }>
> {
  return restAction(async () => {
    const result = await api.post<{ bootstrapped: boolean; automations: number }>(
      '/v1/email/bootstrap',
      {}
    );
    revalidatePath('/email/automations');
    return result;
  });
}
