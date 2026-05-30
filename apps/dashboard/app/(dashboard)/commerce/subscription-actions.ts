'use server';

import { revalidatePath } from 'next/cache';

import { subscriptionService } from '@sparx/commerce';
import type {
  CancelSubscriptionInput,
  PauseSubscriptionInput,
  ResumeSubscriptionInput,
  SkipNextOccurrenceInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

export async function pauseSubscriptionAction(
  input: PauseSubscriptionInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await subscriptionService.pause(ctx, input);
    revalidatePath('/commerce/subscriptions');
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}

export async function resumeSubscriptionAction(
  input: ResumeSubscriptionInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await subscriptionService.resume(ctx, input);
    revalidatePath('/commerce/subscriptions');
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}

export async function skipNextOccurrenceAction(
  input: SkipNextOccurrenceInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await subscriptionService.skipNextOccurrence(ctx, input);
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}

export async function cancelSubscriptionAction(
  input: CancelSubscriptionInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await subscriptionService.cancel(ctx, input);
    revalidatePath('/commerce/subscriptions');
    revalidatePath(`/commerce/subscriptions/${input.subscriptionId}`);
  });
}
