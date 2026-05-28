'use server';

// Customer Server Actions — thin transport over @sparx/crm customerService.

import { revalidatePath } from 'next/cache';

import { customerService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const customer = await customerService.create(ctx, input);
    revalidatePath('/crm/customers');
    return { id: customer.id };
  });
}

export async function updateCustomerAction(
  customerId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const customer = await customerService.update(ctx, customerId, input);
    revalidatePath('/crm/customers');
    revalidatePath(`/crm/customers/${customerId}`);
    return { id: customer.id };
  });
}

export async function deleteCustomerAction(
  customerId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const customer = await customerService.softDelete(ctx, customerId);
    revalidatePath('/crm/customers');
    return { id: customer.id };
  });
}

export async function mergeCustomersAction(
  input: unknown
): Promise<ActionResult<{ primaryId: string; mergedIds: string[] }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await customerService.merge(ctx, input);
    revalidatePath('/crm');
    revalidatePath('/crm/customers');
    revalidatePath(`/crm/customers/${result.primary.id}`);
    return {
      primaryId: result.primary.id,
      mergedIds: result.merged.map((d) => d.id),
    };
  });
}
