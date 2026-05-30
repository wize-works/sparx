'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from '../_lib/rest-action';
import { restAction } from '../_lib/rest-action';
import type { SendingDomainRow } from '../_lib/types';

export async function createDomainAction(input: unknown): Promise<ActionResult<SendingDomainRow>> {
  return restAction(async () => {
    const domain = await api.post<SendingDomainRow>('/v1/email/domains', input);
    revalidatePath('/email/domains');
    return domain;
  });
}

export async function verifyDomainAction(id: string): Promise<ActionResult<SendingDomainRow>> {
  return restAction(async () => {
    const domain = await api.post<SendingDomainRow>(`/v1/email/domains/${id}/verify`, {});
    revalidatePath('/email/domains');
    return domain;
  });
}

export async function setDefaultDomainAction(id: string): Promise<ActionResult<SendingDomainRow>> {
  return restAction(async () => {
    const domain = await api.post<SendingDomainRow>(`/v1/email/domains/${id}/default`, {});
    revalidatePath('/email/domains');
    revalidatePath('/email/settings');
    return domain;
  });
}

export async function removeDomainAction(id: string): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/email/domains/${id}`);
    revalidatePath('/email/domains');
    return { id };
  });
}
