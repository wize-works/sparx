// Deal ↔ order / quote attachment service.
//
// Locked decision #5: deals are independent of orders, linked via join
// tables. `deal_orders(deal_id, order_id, tenant_id)` and the same shape
// for quotes. Orders never get a deal_id column — one deal can yield
// multiple orders, and most orders have no deal.
//
// Both the deal and the linked entity must belong to the same tenant; RLS
// is the backstop and the service-layer fetch confirms both rows exist
// before writing the join row.

import { withTenant } from '@sparx/db';
import type { DealOrder, DealQuote } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmConflictError, CrmNotFoundError } from '../errors';

export async function attachOrder(
  ctx: ServiceContext,
  args: { dealId: string; orderId: string }
): Promise<DealOrder> {
  const link = await withTenant(ctx, async (tx) => {
    const [deal, order] = await Promise.all([
      tx.deal.findUnique({ where: { id: args.dealId } }),
      tx.order.findUnique({ where: { id: args.orderId } }),
    ]);
    if (!deal) throw new CrmNotFoundError('Deal', args.dealId);
    if (!order) throw new CrmNotFoundError('Order', args.orderId);

    const existing = await tx.dealOrder.findUnique({
      where: { dealId_orderId: { dealId: args.dealId, orderId: args.orderId } },
    });
    if (existing) {
      throw new CrmConflictError('Order is already attached to this deal');
    }

    const created = await tx.dealOrder.create({
      data: {
        tenantId: ctx.tenantId,
        dealId: args.dealId,
        orderId: args.orderId,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.order_attached',
      entityType: 'DealOrder',
      entityId: args.dealId,
      diff: { after: { orderId: args.orderId } },
    });
    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.deal.order_attached',
    payload: { dealId: args.dealId, orderId: args.orderId },
    dedupeKey: `crm.deal.order_attached:${args.dealId}:${args.orderId}`,
  });

  return link;
}

export async function detachOrder(
  ctx: ServiceContext,
  args: { dealId: string; orderId: string }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.dealOrder.findUnique({
      where: { dealId_orderId: { dealId: args.dealId, orderId: args.orderId } },
    });
    if (!existing) return;
    await tx.dealOrder.delete({
      where: { dealId_orderId: { dealId: args.dealId, orderId: args.orderId } },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.order_detached',
      entityType: 'DealOrder',
      entityId: args.dealId,
      diff: { before: { orderId: args.orderId } },
    });
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.deal.order_detached',
    payload: { dealId: args.dealId, orderId: args.orderId },
    dedupeKey: `crm.deal.order_detached:${args.dealId}:${args.orderId}:${Date.now()}`,
  });
}

export async function attachQuote(
  ctx: ServiceContext,
  args: { dealId: string; quoteId: string }
): Promise<DealQuote> {
  const link = await withTenant(ctx, async (tx) => {
    const [deal, quote] = await Promise.all([
      tx.deal.findUnique({ where: { id: args.dealId } }),
      tx.quote.findUnique({ where: { id: args.quoteId } }),
    ]);
    if (!deal) throw new CrmNotFoundError('Deal', args.dealId);
    if (!quote) throw new CrmNotFoundError('Quote', args.quoteId);

    const existing = await tx.dealQuote.findUnique({
      where: { dealId_quoteId: { dealId: args.dealId, quoteId: args.quoteId } },
    });
    if (existing) {
      throw new CrmConflictError('Quote is already attached to this deal');
    }

    const created = await tx.dealQuote.create({
      data: {
        tenantId: ctx.tenantId,
        dealId: args.dealId,
        quoteId: args.quoteId,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.quote_attached',
      entityType: 'DealQuote',
      entityId: args.dealId,
      diff: { after: { quoteId: args.quoteId } },
    });
    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.deal.quote_attached',
    payload: { dealId: args.dealId, quoteId: args.quoteId },
    dedupeKey: `crm.deal.quote_attached:${args.dealId}:${args.quoteId}`,
  });

  return link;
}

export async function detachQuote(
  ctx: ServiceContext,
  args: { dealId: string; quoteId: string }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.dealQuote.findUnique({
      where: { dealId_quoteId: { dealId: args.dealId, quoteId: args.quoteId } },
    });
    if (!existing) return;
    await tx.dealQuote.delete({
      where: { dealId_quoteId: { dealId: args.dealId, quoteId: args.quoteId } },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.quote_detached',
      entityType: 'DealQuote',
      entityId: args.dealId,
      diff: { before: { quoteId: args.quoteId } },
    });
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.deal.quote_detached',
    payload: { dealId: args.dealId, quoteId: args.quoteId },
    dedupeKey: `crm.deal.quote_detached:${args.dealId}:${args.quoteId}:${Date.now()}`,
  });
}
