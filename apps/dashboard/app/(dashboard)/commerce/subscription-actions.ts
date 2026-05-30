'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  CancelSubscriptionInput,
  PauseSubscriptionInput,
  ResumeSubscriptionInput,
  SkipNextOccurrenceInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function pauseSubscriptionAction(
  input: PauseSubscriptionInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(
      `/v1/commerce/subscriptions/${input.subscriptionId}/pause`,
      input
    );
    revalidatePath('/commerce/subscriptions');
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}

export async function resumeSubscriptionAction(
  input: ResumeSubscriptionInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(
      `/v1/commerce/subscriptions/${input.subscriptionId}/resume`,
      input
    );
    revalidatePath('/commerce/subscriptions');
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}

export async function skipNextOccurrenceAction(
  input: SkipNextOccurrenceInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(
      `/v1/commerce/subscriptions/${input.subscriptionId}/skip-next`,
      input
    );
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}

export async function cancelSubscriptionAction(
  input: CancelSubscriptionInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(
      `/v1/commerce/subscriptions/${input.subscriptionId}/cancel`,
      input
    );
    revalidatePath('/commerce/subscriptions');
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}
