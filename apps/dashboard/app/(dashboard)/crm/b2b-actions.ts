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

/** Credit-hold toggle — just a status flip on the B2B account row.
 *  Going through update() means the audit row + RLS check happen via the
 *  same path the rest of the form uses; a dedicated service method would
 *  add no invariant a status change doesn't already cover. */
export async function setB2bAccountStatusAction(
  accountId: string,
  status: 'active' | 'credit_hold' | 'suspended' | 'inactive'
): Promise<ActionResult<{ id: string; status: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const account = await b2bAccountService.update(ctx, accountId, { status });
    revalidatePath('/crm/b2b');
    revalidatePath(`/crm/b2b/${accountId}`);
    return { id: account.id, status: account.status };
  });
}
