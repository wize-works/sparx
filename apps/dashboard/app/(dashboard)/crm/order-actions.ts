'use server';

// Order core Server Actions — adapters over api-rest /v1/crm/orders.
//
// Payment, refund, and fulfillment subresources live in their own action
// files so each one stays under the 200-line target and the page-level
// imports remain explicit about which subresource a form mutates.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface OrderResponse {
  id: string;
  orderNumber: string;
  customerId: string;
}

export async function createOrderAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  return restAction(async () => {
    const order = await api.post<OrderResponse>('/v1/crm/orders', input);
    revalidatePath('/crm/orders');
    revalidatePath(`/crm/customers/${order.customerId}`);
    return { id: order.id, orderNumber: order.orderNumber };
  });
}

export async function updateOrderAction(
  orderId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const order = await api.patch<OrderResponse>(`/v1/crm/orders/${orderId}`, input);
    revalidatePath('/crm/orders');
    revalidatePath(`/crm/orders/${orderId}`);
    return { id: order.id };
  });
}

export async function cancelOrderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const { orderId } = input as { orderId: string };
    const order = await api.post<OrderResponse>(`/v1/crm/orders/${orderId}/cancel`, input);
    revalidatePath('/crm/orders');
    revalidatePath(`/crm/orders/${order.id}`);
    revalidatePath(`/crm/customers/${order.customerId}`);
    return { id: order.id };
  });
}
