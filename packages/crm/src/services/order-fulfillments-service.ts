// orderFulfillmentsService — create + update fulfillments, with per-line
// quantity tracking and parent-order status promotion.
//
// State machine on the fulfillment itself: pending → shipped → delivered;
// pending → cancelled / failed. Promotion of the parent Order from "placed"
// to "fulfilled" happens once every item line is fully fulfilled; promotion
// to "delivered" once every fulfillment is delivered. Both emit upstream
// platform events the CRM consumer subscribes to.

import crypto from 'node:crypto';

import { CreateFulfillmentInput, UpdateFulfillmentInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { OrderFulfillment, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishPlatformEvent } from '../consumers/platform-bus';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';

export async function listForOrder(
  ctx: ServiceContext,
  orderId: string
): Promise<OrderFulfillment[]> {
  return withTenant(ctx, (tx) =>
    tx.orderFulfillment.findMany({
      where: { orderId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
  );
}

export async function createFulfillment(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<OrderFulfillment> {
  const input = CreateFulfillmentInput.parse(rawInput);

  const fulfillment = await withTenant(ctx, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    });
    if (!order) throw new CrmNotFoundError('Order', input.orderId);
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw new CrmValidationError(`Cannot fulfill an order in status "${order.status}"`);
    }

    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const line of input.lines) {
      const orderItem = itemsById.get(line.orderItemId);
      if (!orderItem) throw new CrmNotFoundError('OrderItem', line.orderItemId);
      const remaining = orderItem.quantity - orderItem.quantityFulfilled;
      if (line.quantity > remaining) {
        throw new CrmValidationError(
          `Fulfill quantity ${line.quantity} exceeds remaining ${remaining} on item ${orderItem.sku}`
        );
      }
    }

    const shippedAt = input.shippedAt
      ? new Date(input.shippedAt)
      : input.status === 'shipped'
        ? new Date()
        : null;

    const created = await tx.orderFulfillment.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: input.orderId,
        status: input.status,
        carrier: input.carrier ?? null,
        service: input.service ?? null,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
        shippedAt,
        notes: input.notes ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          ...(input.carrier === 'other' && input.carrierOther
            ? { carrierOther: input.carrierOther }
            : {}),
        } as Prisma.InputJsonValue,
        items: {
          create: input.lines.map((line) => ({
            tenantId: ctx.tenantId,
            orderItemId: line.orderItemId,
            quantity: line.quantity,
          })),
        },
      },
    });

    for (const line of input.lines) {
      await tx.orderItem.update({
        where: { id: line.orderItemId },
        data: { quantityFulfilled: { increment: line.quantity } },
      });
    }

    await promoteOrderOnFulfillment(tx, input.orderId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.fulfillment.created',
      entityType: 'OrderFulfillment',
      entityId: created.id,
      diff: { after: { status: created.status, lines: input.lines.length } },
    });

    return created;
  });

  if (fulfillment.status === 'shipped') {
    await publishPlatformEvent({
      id: crypto.randomUUID(),
      topic: 'order.fulfilled',
      tenantId: ctx.tenantId,
      occurredAt: fulfillment.shippedAt ?? new Date(),
      payload: { orderId: fulfillment.orderId, fulfillmentId: fulfillment.id },
    });
  }

  return fulfillment;
}

export async function updateFulfillment(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<OrderFulfillment> {
  const input = UpdateFulfillmentInput.parse(rawInput);
  const wasDelivered = { value: false };
  const fulfillment = await withTenant(ctx, async (tx) => {
    const before = await tx.orderFulfillment.findUnique({
      where: { id: input.fulfillmentId },
    });
    if (!before) throw new CrmNotFoundError('OrderFulfillment', input.fulfillmentId);

    const nextShippedAt =
      input.shippedAt !== undefined
        ? input.shippedAt
          ? new Date(input.shippedAt)
          : null
        : input.status === 'shipped' && before.shippedAt === null
          ? new Date()
          : before.shippedAt;
    const nextDeliveredAt =
      input.deliveredAt !== undefined
        ? input.deliveredAt
          ? new Date(input.deliveredAt)
          : null
        : input.status === 'delivered' && before.deliveredAt === null
          ? new Date()
          : before.deliveredAt;

    const updated = await tx.orderFulfillment.update({
      where: { id: input.fulfillmentId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
        ...(input.trackingUrl !== undefined ? { trackingUrl: input.trackingUrl } : {}),
        shippedAt: nextShippedAt,
        deliveredAt: nextDeliveredAt,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    await promoteOrderOnFulfillment(tx, before.orderId);

    wasDelivered.value = before.status !== 'delivered' && updated.status === 'delivered';

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.fulfillment.updated',
      entityType: 'OrderFulfillment',
      entityId: updated.id,
      diff: { before: { status: before.status }, after: { status: updated.status } },
    });

    return updated;
  });

  if (wasDelivered.value) {
    await publishPlatformEvent({
      id: crypto.randomUUID(),
      topic: 'order.delivered',
      tenantId: ctx.tenantId,
      occurredAt: fulfillment.deliveredAt ?? new Date(),
      payload: { orderId: fulfillment.orderId, fulfillmentId: fulfillment.id },
    });
  }

  return fulfillment;
}

/** Promote parent order status based on the current fulfillment state.
 *  Called from every path that mutates a fulfillment. */
async function promoteOrderOnFulfillment(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true, fulfillments: true },
  });
  if (!order) return;
  if (order.status === 'cancelled' || order.status === 'refunded') return;

  const allFulfilled = order.items.every((i) => i.quantityFulfilled >= i.quantity);
  const allDelivered =
    allFulfilled &&
    order.fulfillments.length > 0 &&
    order.fulfillments.every((f) => f.status === 'delivered');

  if (allDelivered && order.status !== 'delivered') {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
  } else if (allFulfilled && order.status === 'placed') {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'fulfilled', fulfilledAt: new Date() },
    });
  }
}
