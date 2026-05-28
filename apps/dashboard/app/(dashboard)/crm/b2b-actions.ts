'use server';

// B2B account Server Actions — thin transport over b2bAccountService.

import { revalidatePath } from 'next/cache';

import { b2bAccountService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createB2bAccountAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const account = await b2bAccountService.create(ctx, input);
    revalidatePath('/crm/b2b');
    return { id: account.id };
  });
}

export async function updateB2bAccountAction(
  accountId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const account = await b2bAccountService.update(ctx, accountId, input);
    revalidatePath('/crm/b2b');
    revalidatePath(`/crm/b2b/${accountId}`);
    return { id: account.id };
  });
}

export async function setB2bCreditHoldAction(
  accountId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const account = await b2bAccountService.setCreditHold(ctx, accountId, input);
    revalidatePath(`/crm/b2b/${accountId}`);
    return { id: account.id };
  });
}
