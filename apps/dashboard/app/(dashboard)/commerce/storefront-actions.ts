'use server';

import { revalidatePath } from 'next/cache';

import { storefrontService } from '@sparx/commerce';
import type {
  UpdateStorefrontSettingsInput,
  UpdateStorefrontThemeInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

export async function updateStorefrontSettingsAction(
  input: UpdateStorefrontSettingsInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await storefrontService.updateSettings(ctx, input);
    revalidatePath('/commerce/settings');
  });
}

export async function updateStorefrontThemeAction(
  input: UpdateStorefrontThemeInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await storefrontService.updateTheme(ctx, input);
    revalidatePath('/commerce/settings');
  });
}
