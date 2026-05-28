// orderRefundsService — issue refunds against an order, optionally
// targeting specific line items + quantities.
//
// `recordRefund` is the only write path. It validates per-line cap against
// (quantity − quantity_refunded) on each line, writes the refund + its
// line-item join rows, then recomputes the parent order's payment rollup
// so amountPaid / paymentStatus / refundTotal stay correct.

import crypto from 'node:crypto';

import { RecordRefundInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { OrderRefund, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishPlatformEvent } from '../consumers/platform-bus';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { recomputeOrderPaymentRollup } from './order-payments-service';

export async function listForOrder(ctx: ServiceContext, orderId: string): Promise<OrderRefund[]> {
  return withTenant(ctx, (tx) =>
    tx.orderRefund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: { refundItems: true },
    })
  );
}

export async function recordRefund(ctx: ServiceContext, rawInput: unknown): Promise<OrderRefund> {
  const input = RecordRefundInput.parse(rawInput);

  const refund = await withTenant(ctx, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    });
    if (!order) throw new CrmNotFoundError('Order', input.orderId);
    if (order.status === 'cancelled') {
      throw new CrmValidationError('Cannot refund a cancelled order');
    }

    // If lines are given, validate each refund quantity against the
    // remaining refundable units on its parent line.
    if (input.lines && input.lines.length > 0) {
      const itemsById = new Map(order.items.map((i) => [i.id, i]));
      for (const line of input.lines) {
        const orderItem = itemsById.get(line.orderItemId);
        if (!orderItem) {
          throw new CrmNotFoundError('OrderItem', line.orderItemId);
        }
        const remaining = orderItem.quantity - orderItem.quantityRefunded;
        if (line.quantity > remaining) {
          throw new CrmValidationError(
            `Refund quantity ${line.quantity} exceeds remaining ${remaining} on item ${orderItem.sku}`
          );
        }
      }
    }

    if (input.paymentId) {
      const payment = await tx.orderPayment.findUnique({
        where: { id: input.paymentId },
      });
      if (!payment || payment.orderId !== input.orderId) {
        throw new CrmValidationError('Payment does not belong to this order');
      }
    }

    const created = await tx.orderRefund.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: input.orderId,
        paymentId: input.paymentId ?? null,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason ?? null,
        processorRef: input.processorRef ?? null,
        status: 'completed',
        refundedAt: new Date(),
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        await tx.orderRefundItem.create({
          data: {
            tenantId: ctx.tenantId,
            refundId: created.id,
            orderItemId: line.orderItemId,
            quantity: line.quantity,
            amount: line.amount,
          },
        });
        await tx.orderItem.update({
          where: { id: line.orderItemId },
          data: { quantityRefunded: { increment: line.quantity } },
        });
      }
    }

    // Flip the order's status to refunded if the refund covers the full
    // total; otherwise leave it alone (paymentStatus will reflect partial
    // refund via the rollup below).
    const fullyRefunded = Number(input.amount) >= Number(order.total) - Number(order.refundTotal);
    if (fullyRefunded) {
      await tx.order.update({
        where: { id: input.orderId },
        data: { status: 'refunded', refundedAt: new Date() },
      });
    }

    await recomputeOrderPaymentRollup(tx, ctx.tenantId, input.orderId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.refunded',
      entityType: 'OrderRefund',
      entityId: created.id,
      diff: { after: { amount: created.amount.toString(), full: fullyRefunded } },
    });

    return created;
  });

  await publishPlatformEvent({
    id: crypto.randomUUID(),
    topic: 'order.refunded',
    tenantId: ctx.tenantId,
    occurredAt: refund.refundedAt ?? new Date(),
    payload: {
      orderId: refund.orderId,
      refundId: refund.id,
      refundAmount: Number(refund.amount),
      currency: refund.currency,
    },
  });

  return refund;
}
