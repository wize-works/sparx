// orderService — list / get / create / update / cancel.
//
// Payment, refund, and fulfillment subresources live in their own service
// files (order-payments-service.ts, order-refunds-service.ts,
// order-fulfillments-service.ts) so each file stays under the 200-line
// limit and the lifecycle invariants stay readable.
//
// Every state-changing function:
//   1. Validates input against the Zod schema in @sparx/crm-schemas
//   2. Wraps DB work in withTenant() (RLS context per transaction)
//   3. Writes an audit_logs row inside the same transaction
//   4. After the tx commits, publishes a PLATFORM event (`order.created`,
//      `order.cancelled`, etc.) that the CRM consumer picks up to record
//      the activity + update denormalized customer stats.

import crypto from 'node:crypto';

import {
  CancelOrderInput,
  CreateOrderInput,
  ListOrdersInput,
  UpdateOrderInput,
} from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Order, OrderItem, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishPlatformEvent } from '../consumers/platform-bus';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { computeLine, computeTotals } from './order-totals';
import { nextOrderNumber } from './record-numbers';

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

export async function list(
  ctx: ServiceContext,
  rawFilter: unknown = {}
): Promise<{ items: Order[]; total: number }> {
  const filter = ListOrdersInput.parse(rawFilter);
  return withTenant(ctx, async (tx) => {
    const where: Prisma.OrderWhereInput = {
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.paymentStatus ? { paymentStatus: filter.paymentStatus } : {}),
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.placedSince || filter.placedUntil
        ? {
            placedAt: {
              ...(filter.placedSince ? { gte: new Date(filter.placedSince) } : {}),
              ...(filter.placedUntil ? { lte: new Date(filter.placedUntil) } : {}),
            },
          }
        : {}),
      ...(filter.q ? { orderNumber: { startsWith: filter.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      tx.order.findMany({
        where,
        orderBy: { [filter.sortBy]: 'desc' } as Prisma.OrderOrderByWithRelationInput,
        take: filter.take,
        skip: filter.skip,
      }),
      tx.order.count({ where }),
    ]);
    return { items, total };
  });
}

export async function get(ctx: ServiceContext, orderId: string): Promise<OrderWithItems> {
  const order = await withTenant(ctx, (tx) =>
    tx.order.findUnique({ where: { id: orderId }, include: { items: true } })
  );
  if (!order) throw new CrmNotFoundError('Order', orderId);
  return order;
}

// ─────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<OrderWithItems> {
  const input = CreateOrderInput.parse(rawInput);
  const totals = computeTotals(input.items, input.shippingTotal, input.taxTotal);
  const placedAt = input.placedAt ? new Date(input.placedAt) : new Date();

  const order = await withTenant(ctx, async (tx) => {
    // Customer must exist + belong to this tenant (RLS enforces; explicit
    // check yields a clean NOT_FOUND instead of an FK violation).
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.deletedAt !== null) {
      throw new CrmNotFoundError('Customer', input.customerId);
    }

    const orderNumber = input.orderNumber ?? (await nextOrderNumber(tx, ctx.tenantId));

    const created = await tx.order.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        orderNumber,
        channel: input.channel ?? null,
        source: input.source ?? null,
        currency: input.currency,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        shippingTotal: totals.shippingTotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        shippingAddress: (input.shippingAddress ?? null) as Prisma.InputJsonValue,
        billingAddress: (input.billingAddress ?? null) as Prisma.InputJsonValue,
        placedAt,
        customerNote: input.customerNote ?? null,
        internalNote: input.internalNote ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        items: {
          create: input.items.map((item) => {
            const line = computeLine(item);
            return {
              tenantId: ctx.tenantId,
              productId: item.productId ?? null,
              variantId: item.variantId ?? null,
              sku: item.sku,
              name: item.name,
              description: item.description ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineSubtotal: line.lineSubtotal,
              taxAmount: line.taxAmount,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              metadata: (item.metadata ?? {}) as Prisma.InputJsonValue,
            };
          }),
        },
      },
      include: { items: true },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.created',
      entityType: 'Order',
      entityId: created.id,
      diff: {
        after: { orderNumber: created.orderNumber, total: created.total.toString() },
      },
    });

    return created;
  });

  // Upstream platform event — the order-event consumer picks this up and
  // writes the matching CrmActivity + bumps customer.totalSpent etc.
  await publishPlatformEvent({
    id: crypto.randomUUID(),
    topic: 'order.created',
    tenantId: ctx.tenantId,
    occurredAt: placedAt,
    payload: {
      orderId: order.id,
      customerId: order.customerId,
      total: Number(order.total),
      currency: order.currency,
      placedAt: placedAt.toISOString(),
    },
  });

  return order;
}

export async function update(
  ctx: ServiceContext,
  orderId: string,
  rawInput: unknown
): Promise<Order> {
  const input = UpdateOrderInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const before = await tx.order.findUnique({ where: { id: orderId } });
    if (!before) throw new CrmNotFoundError('Order', orderId);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
        ...(input.shippingAddress !== undefined
          ? { shippingAddress: input.shippingAddress as Prisma.InputJsonValue }
          : {}),
        ...(input.billingAddress !== undefined
          ? { billingAddress: input.billingAddress as Prisma.InputJsonValue }
          : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.updated',
      entityType: 'Order',
      entityId: updated.id,
      diff: null,
    });
    return updated;
  });
}

export async function cancel(ctx: ServiceContext, rawInput: unknown): Promise<Order> {
  const input = CancelOrderInput.parse(rawInput);
  const order = await withTenant(ctx, async (tx) => {
    const before = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!before) throw new CrmNotFoundError('Order', input.orderId);
    if (before.status === 'cancelled') return before;
    if (before.status === 'delivered' || before.status === 'refunded') {
      throw new CrmValidationError(`Cannot cancel an order in status "${before.status}"`);
    }
    const now = new Date();
    const updated = await tx.order.update({
      where: { id: input.orderId },
      data: { status: 'cancelled', cancelledAt: now, cancelledReason: input.reason ?? null },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.order.cancelled',
      entityType: 'Order',
      entityId: updated.id,
      diff: { before: { status: before.status }, after: { status: updated.status } },
    });
    return updated;
  });

  await publishPlatformEvent({
    id: crypto.randomUUID(),
    topic: 'order.cancelled',
    tenantId: ctx.tenantId,
    occurredAt: order.cancelledAt ?? new Date(),
    payload: { orderId: order.id, customerId: order.customerId, reason: input.reason },
  });
  return order;
}
