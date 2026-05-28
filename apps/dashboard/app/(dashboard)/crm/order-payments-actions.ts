'use server';

// Order payment + refund Server Actions.
//
// recordPayment / voidPayment / recordRefund all eventually go through
// recomputeOrderPaymentRollup inside the service, so amountPaid /
// paymentStatus / refundTotal / paidAt stay consistent.

import { revalidatePath } from 'next/cache';

import { orderPaymentsService, orderRefundsService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function recordPaymentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const payment = await orderPaymentsService.recordPayment(ctx, input);
    revalidatePath(`/crm/orders/${payment.orderId}`);
    return { id: payment.id, orderId: payment.orderId };
  });
}

export async function voidPaymentAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const payment = await orderPaymentsService.voidPayment(ctx, input);
    revalidatePath(`/crm/orders/${payment.orderId}`);
    return { id: payment.id, orderId: payment.orderId };
  });
}

export async function recordRefundAction(
  input: unknown
): Promise<ActionResult<{ id: string; orderId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const refund = await orderRefundsService.recordRefund(ctx, input);
    revalidatePath(`/crm/orders/${refund.orderId}`);
    return { id: refund.id, orderId: refund.orderId };
  });
}
