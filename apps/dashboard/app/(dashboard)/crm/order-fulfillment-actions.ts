'use server';

// Order fulfillment Server Actions.
//
// Creating or updating a fulfillment promotes the parent Order's status
// from `placed` → `fulfilled` (all items fully fulfilled) or `fulfilled`
// → `delivered` (every fulfillment delivered) inside the service, so the
// caller never has to manage that invariant by hand.

import { revalidatePath } from 'next/cache';

import { orderFulfillmentsService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createFulfillmentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const fulfillment = await orderFulfillmentsService.createFulfillment(ctx, input);
    revalidatePath(`/crm/orders/${fulfillment.orderId}`);
    return { id: fulfillment.id, orderId: fulfillment.orderId };
  });
}

export async function updateFulfillmentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const fulfillment = await orderFulfillmentsService.updateFulfillment(ctx, input);
    revalidatePath(`/crm/orders/${fulfillment.orderId}`);
    return { id: fulfillment.id, orderId: fulfillment.orderId };
  });
}
