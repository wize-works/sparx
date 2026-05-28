'use server';

// Order core Server Actions — create / update / cancel.
//
// Payment, refund, and fulfillment subresources live in their own action
// files so each one stays under the 200-line target and the page-level
// imports remain explicit about which subresource a form mutates.

import { revalidatePath } from 'next/cache';

import { orderService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createOrderAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const order = await orderService.create(ctx, input);
    revalidatePath('/crm/orders');
    revalidatePath(`/crm/customers/${order.customerId}`);
    return { id: order.id, orderNumber: order.orderNumber };
  });
}

export async function updateOrderAction(
  orderId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const order = await orderService.update(ctx, orderId, input);
    revalidatePath('/crm/orders');
    revalidatePath(`/crm/orders/${orderId}`);
    return { id: order.id };
  });
}

export async function cancelOrderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const order = await orderService.cancel(ctx, input);
    revalidatePath('/crm/orders');
    revalidatePath(`/crm/orders/${order.id}`);
    revalidatePath(`/crm/customers/${order.customerId}`);
    return { id: order.id };
  });
}
