'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@sparx/auth';
import { patchOnboarding } from './onboarding';

export async function markOnboardingStarted(): Promise<void> {
  const { user } = await requireSession();
  await patchOnboarding(user.tenantId, { startedAt: new Date().toISOString() });
}

export async function dismissOnboarding(): Promise<void> {
  const { user } = await requireSession();
  await patchOnboarding(user.tenantId, {
    dismissed: true,
    finishedAt: new Date().toISOString(),
  });
  revalidatePath('/');
  revalidatePath('/welcome');
}
