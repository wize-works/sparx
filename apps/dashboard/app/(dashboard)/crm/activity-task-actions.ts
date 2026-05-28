'use server';

// Activity + Task Server Actions — thin transport over @sparx/crm.

import { revalidatePath } from 'next/cache';

import { activityService, taskService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function recordActivityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const activity = await activityService.record(ctx, input);
    if (activity.customerId) revalidatePath(`/crm/customers/${activity.customerId}`);
    if (activity.dealId) revalidatePath(`/crm/deals/${activity.dealId}`);
    return { id: activity.id };
  });
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const task = await taskService.create(ctx, input);
    revalidatePath('/crm/tasks');
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    if (task.dealId) revalidatePath(`/crm/deals/${task.dealId}`);
    return { id: task.id };
  });
}

export async function completeTaskAction(taskId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const task = await taskService.complete(ctx, { taskId });
    revalidatePath('/crm/tasks');
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    if (task.dealId) revalidatePath(`/crm/deals/${task.dealId}`);
    return { id: task.id };
  });
}
