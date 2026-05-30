'use server';

// Order fulfillment Server Actions — adapters over api-rest nested
// /v1/crm/orders/:id/fulfillments endpoints.
//
// Creating or updating a fulfillment promotes the parent Order's status
// from `placed` → `fulfilled` (all items fully fulfilled) or `fulfilled`
// → `delivered` (every fulfillment delivered) inside the service, so the
// caller never has to manage that invariant by hand.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface FulfillmentResponse {
  id: string;
  orderId: string;
}

export async function createFulfillmentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return restAction(async () => {
    const { orderId } = input as { orderId: string };
    const fulfillment = await api.post<FulfillmentResponse>(
      `/v1/crm/orders/${orderId}/fulfillments`,
      input
    );
    revalidatePath(`/crm/orders/${fulfillment.orderId}`);
    return { id: fulfillment.id, orderId: fulfillment.orderId };
  });
}

export async function updateFulfillmentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return restAction(async () => {
    const { orderId, fulfillmentId } = input as {
      orderId: string;
      fulfillmentId: string;
    };
    const fulfillment = await api.patch<FulfillmentResponse>(
      `/v1/crm/orders/${orderId}/fulfillments/${fulfillmentId}`,
      input
    );
    revalidatePath(`/crm/orders/${fulfillment.orderId}`);
    return { id: fulfillment.id, orderId: fulfillment.orderId };
  });
}
