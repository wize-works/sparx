'use server';

// Activity + Task Server Actions — adapters over api-rest.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface ActivityResponse {
  id: string;
  customerId: string | null;
  dealId: string | null;
}

interface TaskResponse {
  id: string;
  customerId: string | null;
  dealId: string | null;
}

export async function recordActivityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const activity = await api.post<ActivityResponse>('/v1/crm/activities', input);
    if (activity.customerId) revalidatePath(`/crm/customers/${activity.customerId}`);
    if (activity.dealId) revalidatePath(`/crm/deals/${activity.dealId}`);
    return { id: activity.id };
  });
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const task = await api.post<TaskResponse>('/v1/crm/tasks', input);
    revalidatePath('/crm/tasks');
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    if (task.dealId) revalidatePath(`/crm/deals/${task.dealId}`);
    return { id: task.id };
  });
}

export async function completeTaskAction(taskId: string): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const task = await api.post<TaskResponse>(`/v1/crm/tasks/${taskId}/complete`, {});
    revalidatePath('/crm/tasks');
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    if (task.dealId) revalidatePath(`/crm/deals/${task.dealId}`);
    return { id: task.id };
  });
}
