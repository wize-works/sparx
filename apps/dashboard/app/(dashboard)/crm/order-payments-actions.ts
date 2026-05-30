'use server';

// Order payment + refund Server Actions — adapters over api-rest nested
// /v1/crm/orders/:id/payments and /v1/crm/orders/:id/refunds endpoints.
// recordPayment / voidPayment / recordRefund all eventually go through
// recomputeOrderPaymentRollup inside the service, so amountPaid /
// paymentStatus / refundTotal / paidAt stay consistent.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface PaymentResponse {
  id: string;
  orderId: string;
}

interface RefundResponse {
  id: string;
  orderId: string;
}

export async function recordPaymentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return restAction(async () => {
    const { orderId } = input as { orderId: string };
    const payment = await api.post<PaymentResponse>(`/v1/crm/orders/${orderId}/payments`, input);
    revalidatePath(`/crm/orders/${payment.orderId}`);
    return { id: payment.id, orderId: payment.orderId };
  });
}

export async function voidPaymentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return restAction(async () => {
    const { orderId, paymentId } = input as { orderId: string; paymentId: string };
    const payment = await api.post<PaymentResponse>(
      `/v1/crm/orders/${orderId}/payments/${paymentId}/void`,
      input
    );
    revalidatePath(`/crm/orders/${payment.orderId}`);
    return { id: payment.id, orderId: payment.orderId };
  });
}

export async function recordRefundAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return restAction(async () => {
    const { orderId } = input as { orderId: string };
    const refund = await api.post<RefundResponse>(`/v1/crm/orders/${orderId}/refunds`, input);
    revalidatePath(`/crm/orders/${refund.orderId}`);
    return { id: refund.id, orderId: refund.orderId };
  });
}
