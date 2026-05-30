'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from '../_lib/rest-action';
import { restAction } from '../_lib/rest-action';
import type { EmailSettingsView } from '../_lib/types';

export async function updateEmailSettingsAction(
  input: unknown
): Promise<ActionResult<EmailSettingsView>> {
  return restAction(async () => {
    const settings = await api.patch<EmailSettingsView>('/v1/email/settings', input);
    revalidatePath('/email/settings');
    revalidatePath('/email');
    return settings;
  });
}
