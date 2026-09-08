// orderFulfillmentsService — create + update fulfillments, with per-line
// quantity tracking and parent-order status promotion.
//
// State machine on the fulfillment itself: pending → shipped → delivered;
// pending → cancelled / failed. Promotion of the parent Order from "placed"
// to "fulfilled" happens once every item line is fully fulfilled; promotion
// to "delivered" once every fulfillment is delivered. Both emit upstream
// platform events the CRM consumer subscribes to.

import crypto from 'node:crypto';

import { CreateFulfillmentInput, UpdateFulfillmentInput } from '@wizeworks/crm-schemas';
import { afterCommit, withTenant } from '@wizeworks/db';
import type { OrderFulfillment, Prisma, TxClient } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { publishPlatformEvent } from '../consumers/platform-bus';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';

/**
 * Who the order belongs to, and what it is called.
 *
 * Both of these events said only `{ orderId, fulfillmentId }`, and the consumer
 * that turns them into a customer's history has nothing to hang a row on but a
 * customer id. So it wrote one with none: on the shop this was found on, all six
 * shipped/delivered rows carried `customer_id = NULL`, which means no customer's
 * history has ever shown that their order left the building or arrived. The rows
 * exist, look like data, and are reachable from nowhere.
 *
 * Carried in the payload rather than read back by the consumer, for the reason
 * issue 307 records: a lookup is a thing that can fail, and when it failed
 * silently it produced a sentence naming no order.
 */
interface OrderIdentity {
  customerId: string;
  orderNumber: string;
}

async function orderIdentity(tx: TxClient, orderId: string): Promise<OrderIdentity> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, orderNumber: true },
  });
  if (!order) throw new CrmNotFoundError('Order', orderId);
  return order;
}

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

/**
 * The two clocks on a new fulfillment.
 *
 * A fulfillment can be created ALREADY FINISHED, and for a great many
 * businesses that is the only way it is ever created: the customer walked in
 * and took the thing off the counter. There was no despatch and no carrier to
 * wait on, so "shipped, then delivered" is two states the event never passed
 * through -- it happened once, and both clocks read the same moment.
 *
 * `delivered` used to stamp NEITHER, because the only writer that existed was a
 * shipping integration that always starts at `shipped`. A handover would have
 * landed as a delivered fulfillment with no delivered_at, and the console would
 * have read back "Created <timestamp>" for something a business had actually
 * handed over -- a time nobody recorded, rendered as the time it happened.
 *
 * Anything that has not gone yet (`pending`, `failed`, `cancelled`) gets
 * neither. An explicit `shippedAt` always wins: a shipment being backfilled
 * after the fact knows its own date better than the clock does.
 */
export function fulfillmentClocks(
  status: string,
  shippedAtInput?: string,
  now: Date = new Date()
): { shippedAt: Date | null; deliveredAt: Date | null } {
  const finished = status === 'delivered';
  const shippedAt = shippedAtInput
    ? new Date(shippedAtInput)
    : status === 'shipped' || finished
      ? now
      : null;
  return { shippedAt, deliveredAt: finished ? (shippedAt ?? now) : null };
}

export async function createFulfillment(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<OrderFulfillment> {
  const input = CreateFulfillmentInput.parse(rawInput);
  const buyer: { identity: OrderIdentity | null } = { identity: null };

  const fulfillment = await withTenant(ctx, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    });
    if (!order) throw new CrmNotFoundError('Order', input.orderId);
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw new CrmValidationError(`Cannot fulfill an order in status "${order.status}"`);
    }
    buyer.identity = { customerId: order.customerId, orderNumber: order.orderNumber };

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

    const { shippedAt, deliveredAt } = fulfillmentClocks(input.status, input.shippedAt);

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
        deliveredAt,
        notes: input.notes ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          ...(input.carrier === 'other' && input.carrierOther
            ? { carrierOther: input.carrierOther }
            : {}),
        },
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

  // The goods left the building. True of a despatch and equally true of a
  // handover, so BOTH announce it -- a fulfillment created straight to
  // `delivered` used to announce nothing at all, so every downstream consumer
  // (the activity feed, the customer stats, the review request) simply never
  // heard about the sales a counter business actually completes.
  if (fulfillment.status === 'shipped' || fulfillment.status === 'delivered') {
    await afterCommit('publish order.fulfilled', () =>
      publishPlatformEvent({
        id: crypto.randomUUID(),
        topic: 'order.fulfilled',
        tenantId: ctx.tenantId,
        occurredAt: fulfillment.shippedAt ?? new Date(),
        payload: {
          orderId: fulfillment.orderId,
          fulfillmentId: fulfillment.id,
          ...buyer.identity,
        },
      })
    );
  }

  // ...and it arrived, in the same movement. `updateFulfillment` publishes this
  // on the shipped -> delivered transition; a handover never makes that
  // transition, so without this the event exists for posted orders alone.
  if (fulfillment.status === 'delivered') {
    await afterCommit('publish order.delivered', () =>
      publishPlatformEvent({
        id: crypto.randomUUID(),
        topic: 'order.delivered',
        tenantId: ctx.tenantId,
        occurredAt: fulfillment.deliveredAt ?? new Date(),
        payload: {
          orderId: fulfillment.orderId,
          fulfillmentId: fulfillment.id,
          ...buyer.identity,
        },
      })
    );
  }

  return fulfillment;
}

export async function updateFulfillment(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<OrderFulfillment> {
  const input = UpdateFulfillmentInput.parse(rawInput);
  const wasDelivered = { value: false };
  const buyer: { identity: OrderIdentity | null } = { identity: null };
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
    if (wasDelivered.value) buyer.identity = await orderIdentity(tx, before.orderId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.fulfillment.updated',
      entityType: 'OrderFulfillment',
      entityId: updated.id,
      // Status is not the only thing this call changes, and it used to be the
      // only thing recorded — so an edit that set or replaced a tracking number
      // wrote an audit row whose diff said nothing had changed. Record the
      // fields that actually moved: a tracking number is what a customer chases
      // a parcel with, and "who changed it, and from what" is exactly the
      // question asked when one goes missing.
      diff: {
        before: { status: before.status, trackingNumber: before.trackingNumber },
        after: { status: updated.status, trackingNumber: updated.trackingNumber },
      },
    });

    return updated;
  });

  if (wasDelivered.value) {
    await afterCommit('publish order.delivered', () =>
      publishPlatformEvent({
        id: crypto.randomUUID(),
        topic: 'order.delivered',
        tenantId: ctx.tenantId,
        occurredAt: fulfillment.deliveredAt ?? new Date(),
        payload: {
          orderId: fulfillment.orderId,
          fulfillmentId: fulfillment.id,
          ...buyer.identity,
        },
      })
    );
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
    // `fulfilledAt` too, when the order never sat at `fulfilled` on its way
    // here. An order collected over the counter goes placed -> delivered in one
    // move, and leaving the fulfilled clock null says the goods were delivered
    // without ever having been made ready -- which reports then read as a gap.
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'delivered',
        deliveredAt: new Date(),
        ...(order.fulfilledAt ? {} : { fulfilledAt: new Date() }),
      },
    });
  } else if (allFulfilled && order.status === 'placed') {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'fulfilled', fulfilledAt: new Date() },
    });
  }
}
