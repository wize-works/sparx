// orderPaymentsService — record payments, void them, recompute the parent
// order's paymentStatus + amountPaid + paidAt invariants.
//
// `recordPayment` is the single write path. Voids happen via `voidPayment`
// (no UPDATE of an existing captured row — voids are a new row marker that
// drops the order's amountPaid back). Refunds live in
// order-refunds-service.ts to keep that lifecycle isolated.

import crypto from 'node:crypto';

import { RecordPaymentInput, VoidPaymentInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { OrderPayment, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishPlatformEvent } from '../consumers/platform-bus';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';

export async function listForOrder(ctx: ServiceContext, orderId: string): Promise<OrderPayment[]> {
  return withTenant(ctx, (tx) =>
    tx.orderPayment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    })
  );
}

export async function recordPayment(ctx: ServiceContext, rawInput: unknown): Promise<OrderPayment> {
  const input = RecordPaymentInput.parse(rawInput);

  const payment = await withTenant(ctx, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new CrmNotFoundError('Order', input.orderId);
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw new CrmValidationError(
        `Cannot record a payment on an order in status "${order.status}"`
      );
    }

    const created = await tx.orderPayment.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: input.orderId,
        processor: input.processor,
        processorRef: input.processorRef ?? null,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        authorizedAt: input.authorizedAt ? new Date(input.authorizedAt) : null,
        capturedAt: input.capturedAt
          ? new Date(input.capturedAt)
          : input.status === 'captured'
            ? new Date()
            : null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await recomputeOrderPaymentRollup(tx, ctx.tenantId, input.orderId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.payment.recorded',
      entityType: 'OrderPayment',
      entityId: created.id,
      diff: { after: { amount: created.amount.toString(), status: created.status } },
    });

    return created;
  });

  await publishPlatformEvent({
    id: crypto.randomUUID(),
    topic: 'order.payment.recorded',
    tenantId: ctx.tenantId,
    occurredAt: payment.capturedAt ?? new Date(),
    payload: {
      orderId: payment.orderId,
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
    },
  });

  return payment;
}

export async function voidPayment(ctx: ServiceContext, rawInput: unknown): Promise<OrderPayment> {
  const input = VoidPaymentInput.parse(rawInput);
  const payment = await withTenant(ctx, async (tx) => {
    const before = await tx.orderPayment.findUnique({ where: { id: input.paymentId } });
    if (!before) throw new CrmNotFoundError('OrderPayment', input.paymentId);
    if (before.status === 'voided' || before.status === 'refunded') return before;

    const updated = await tx.orderPayment.update({
      where: { id: input.paymentId },
      data: {
        status: 'voided',
        voidedAt: new Date(),
        failureReason: input.reason ?? null,
      },
    });
    await recomputeOrderPaymentRollup(tx, ctx.tenantId, before.orderId);
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.payment.voided',
      entityType: 'OrderPayment',
      entityId: updated.id,
      diff: { before: { status: before.status }, after: { status: updated.status } },
    });
    return updated;
  });

  return payment;
}

/** Re-derive order.amountPaid / paymentStatus / paidAt from the current
 *  set of captured payments minus refunds. Called from every path that
 *  mutates a payment or a refund. */
export async function recomputeOrderPaymentRollup(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orderId: string
): Promise<void> {
  const payments = await tx.orderPayment.findMany({
    where: { tenantId, orderId, status: 'captured' },
  });
  const refunds = await tx.orderRefund.findMany({
    where: { tenantId, orderId, status: 'completed' },
  });
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const captured = payments.reduce((acc, p) => acc + Number(p.amount), 0);
  const refunded = refunds.reduce((acc, r) => acc + Number(r.amount), 0);
  const amountPaid = Math.max(0, captured - refunded);
  const total = Number(order.total);

  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'refunded' = 'unpaid';
  if (refunded > 0 && amountPaid === 0) paymentStatus = 'refunded';
  else if (amountPaid >= total && total > 0) paymentStatus = 'paid';
  else if (amountPaid > 0) paymentStatus = 'partially_paid';

  await tx.order.update({
    where: { id: orderId },
    data: {
      amountPaid,
      refundTotal: refunded,
      paymentStatus,
      paidAt: paymentStatus === 'paid' && order.paidAt === null ? new Date() : order.paidAt,
    },
  });
}
