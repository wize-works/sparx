'use server';

import { revalidatePath } from 'next/cache';

import { providerService } from '@sparx/commerce';
import type {
  InstallProviderInput,
  SetProviderEnabledInput,
  UpdateProviderConfigInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

export async function installProviderAction(
  input: InstallProviderInput
): Promise<ActionResult<{ installationId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await providerService.install(ctx, input);
    revalidatePath('/commerce/providers');
    return { installationId: result.installationId };
  });
}

export async function updateProviderConfigAction(
  input: UpdateProviderConfigInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await providerService.updateConfig(ctx, input);
    revalidatePath('/commerce/providers');
    revalidatePath(`/commerce/providers/${input.installationId}`);
  });
}

export async function setProviderEnabledAction(
  input: SetProviderEnabledInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await providerService.setEnabled(ctx, input);
    revalidatePath('/commerce/providers');
    revalidatePath(`/commerce/providers/${input.installationId}`);
  });
}

export async function uninstallProviderAction(installationId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await providerService.uninstall(ctx, installationId);
    revalidatePath('/commerce/providers');
  });
}

export async function testProviderAction(
  installationId: string
): Promise<ActionResult<{ ok: boolean; details: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    return providerService.test(ctx, { installationId });
  });
}
