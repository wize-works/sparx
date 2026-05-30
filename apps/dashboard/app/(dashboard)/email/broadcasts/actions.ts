'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from '../_lib/rest-action';
import { restAction } from '../_lib/rest-action';
import type { BroadcastRow } from '../_lib/types';

export async function createBroadcastAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const row = await api.post<BroadcastRow>('/v1/email/broadcasts', input);
    revalidatePath('/email/broadcasts');
    return { id: row.id };
  });
}

export async function updateBroadcastAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const row = await api.patch<BroadcastRow>(`/v1/email/broadcasts/${id}`, input);
    revalidatePath('/email/broadcasts');
    revalidatePath(`/email/broadcasts/${id}`);
    return { id: row.id };
  });
}

export async function sendBroadcastAction(id: string): Promise<ActionResult<BroadcastRow>> {
  return restAction(async () => {
    const row = await api.post<BroadcastRow>(`/v1/email/broadcasts/${id}/send`, {});
    revalidatePath('/email/broadcasts');
    revalidatePath(`/email/broadcasts/${id}`);
    return row;
  });
}

export async function scheduleBroadcastAction(
  id: string,
  scheduledAt: string
): Promise<ActionResult<BroadcastRow>> {
  return restAction(async () => {
    const row = await api.post<BroadcastRow>(`/v1/email/broadcasts/${id}/schedule`, {
      scheduledAt,
    });
    revalidatePath('/email/broadcasts');
    revalidatePath(`/email/broadcasts/${id}`);
    return row;
  });
}

export async function cancelBroadcastAction(id: string): Promise<ActionResult<BroadcastRow>> {
  return restAction(async () => {
    const row = await api.post<BroadcastRow>(`/v1/email/broadcasts/${id}/cancel`, {});
    revalidatePath('/email/broadcasts');
    revalidatePath(`/email/broadcasts/${id}`);
    return row;
  });
}
