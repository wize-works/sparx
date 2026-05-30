'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  UpdateStorefrontSettingsInput,
  UpdateStorefrontThemeInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function updateStorefrontSettingsAction(
  input: UpdateStorefrontSettingsInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.patch<{ updated: boolean }>('/v1/commerce/storefront/settings', input);
    revalidatePath('/commerce/settings');
  });
}

export async function updateStorefrontThemeAction(
  input: UpdateStorefrontThemeInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.patch<{ updated: boolean }>('/v1/commerce/storefront/theme', input);
    revalidatePath('/commerce/settings');
  });
}
