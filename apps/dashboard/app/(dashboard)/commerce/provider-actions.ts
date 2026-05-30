'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  InstallProviderInput,
  SetProviderEnabledInput,
  UpdateProviderConfigInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function installProviderAction(
  input: InstallProviderInput
): Promise<ActionResult<{ installationId: string }>> {
  return restAction(async () => {
    const result = await api.post<{ installationId: string }>(
      '/v1/commerce/providers/install',
      input
    );
    revalidatePath('/commerce/providers');
    return { installationId: result.installationId };
  });
}

export async function updateProviderConfigAction(
  input: UpdateProviderConfigInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.patch<{ id: string }>(
      `/v1/commerce/providers/installations/${input.installationId}/config`,
      input
    );
    revalidatePath('/commerce/providers');
    revalidatePath(`/commerce/providers/${input.installationId}`);
  });
}

export async function setProviderEnabledAction(
  input: SetProviderEnabledInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(
      `/v1/commerce/providers/installations/${input.installationId}/enabled`,
      input
    );
    revalidatePath('/commerce/providers');
    revalidatePath(`/commerce/providers/${input.installationId}`);
  });
}

export async function uninstallProviderAction(installationId: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/providers/installations/${installationId}`);
    revalidatePath('/commerce/providers');
  });
}

export async function testProviderAction(
  installationId: string
): Promise<ActionResult<{ ok: boolean; details: string }>> {
  return restAction(async () => {
    return api.post<{ ok: boolean; details: string }>(
      `/v1/commerce/providers/installations/${installationId}/test`,
      {}
    );
  });
}
