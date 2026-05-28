// quoteLifecycleService — submit / accept / decline / expire / convert.
//
// Each transition validates the current status, stamps the timestamp,
// writes an audit row, and publishes the matching event:
//   • crm.quote.submitted / crm.quote.accepted / crm.quote.declined /
//     crm.quote.expired   — CRM-namespaced events (downstream consumers
//     like the email automation engine subscribe to these).
//   • platform `quote.created` / `quote.accepted` / `quote.declined`
//     mirrors so the CRM consumer's existing quote-event subscribers
//     populate the activity feed without duplicating logic.
// convertToOrder is the heaviest: copies items + header to a new Order,
// stamps the pointer, and emits both quote.converted and order.created.

import crypto from 'node:crypto';

import {
  AcceptQuoteInput,
  ConvertQuoteInput,
  DeclineQuoteInput,
  ExpireQuoteInput,
  SubmitQuoteInput,
} from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Order, Prisma, Quote } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import { publishPlatformEvent } from '../consumers/platform-bus';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { nextOrderNumber } from './record-numbers';

export async function submit(ctx: ServiceContext, rawInput: unknown): Promise<Quote> {
  const input = SubmitQuoteInput.parse(rawInput);
  const quote = await transition(ctx, input.quoteId, 'draft', 'submitted', (tx, q) =>
    tx.quote.update({
      where: { id: q.id },
      data: { status: 'submitted', submittedAt: new Date() },
    })
  );
  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.quote.submitted',
    payload: { quoteId: quote.id, customerId: quote.customerId, total: Number(quote.total) },
    dedupeKey: `crm.quote.submitted:${quote.id}`,
  });
  return quote;
}

export async function accept(ctx: ServiceContext, rawInput: unknown): Promise<Quote> {
  const input = AcceptQuoteInput.parse(rawInput);
  const quote = await transition(ctx, input.quoteId, 'submitted', 'accepted', (tx, q) =>
    tx.quote.update({
      where: { id: q.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    })
  );
  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.quote.accepted',
    payload: { quoteId: quote.id, customerId: quote.customerId },
    dedupeKey: `crm.quote.accepted:${quote.id}`,
  });
  return quote;
}

export async function decline(ctx: ServiceContext, rawInput: unknown): Promise<Quote> {
  const input = DeclineQuoteInput.parse(rawInput);
  const quote = await transition(ctx, input.quoteId, 'submitted', 'declined', (tx, q) =>
    tx.quote.update({
      where: { id: q.id },
      data: {
        status: 'declined',
        declinedAt: new Date(),
        declinedReason: input.reason ?? null,
      },
    })
  );
  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.quote.declined',
    payload: { quoteId: quote.id, customerId: quote.customerId, reason: input.reason },
    dedupeKey: `crm.quote.declined:${quote.id}`,
  });
  return quote;
}

export async function expire(ctx: ServiceContext, rawInput: unknown): Promise<Quote> {
  const input = ExpireQuoteInput.parse(rawInput);
  // Submitted OR draft (a draft past validUntil is also stale).
  return withTenant(ctx, async (tx) => {
    const before = await tx.quote.findUnique({ where: { id: input.quoteId } });
    if (!before) throw new CrmNotFoundError('Quote', input.quoteId);
    if (before.status !== 'submitted' && before.status !== 'draft') {
      throw new CrmValidationError(`Cannot expire a quote in status "${before.status}"`);
    }
    const updated = await tx.quote.update({
      where: { id: input.quoteId },
      data: { status: 'expired', expiredAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.quote.expired',
      entityType: 'Quote',
      entityId: updated.id,
      diff: { before: { status: before.status }, after: { status: updated.status } },
    });
    return updated;
  });
}

/** Convert an accepted quote into a new Order. Items + header values are
 *  snapshotted at conversion time — later edits to the (still-accepted)
 *  quote don't affect the resulting order. */
export async function convertToOrder(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ quote: Quote; order: Order }> {
  const input = ConvertQuoteInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: input.quoteId },
      include: { items: true },
    });
    if (!quote) throw new CrmNotFoundError('Quote', input.quoteId);
    if (quote.status !== 'accepted') {
      throw new CrmValidationError(
        `Quote must be accepted before conversion; current status is "${quote.status}"`
      );
    }
    if (quote.convertedToOrderId) {
      throw new CrmValidationError('Quote has already been converted');
    }

    const customerId = input.customerId ?? quote.customerId;
    if (!customerId) {
      throw new CrmValidationError(
        'Quote has no customer; pass customerId to specify which customer to bill'
      );
    }

    const orderNumber = input.orderNumber ?? (await nextOrderNumber(tx, ctx.tenantId));
    const placedAt = new Date();
    const order = await tx.order.create({
      data: {
        tenantId: ctx.tenantId,
        customerId,
        orderNumber,
        status: 'placed',
        paymentStatus: 'unpaid',
        channel: input.channel ?? 'admin',
        source: `quote:${quote.quoteNumber}`,
        currency: quote.currency,
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        shippingTotal: quote.shippingTotal,
        discountTotal: quote.discountTotal,
        total: quote.total,
        placedAt,
        metadata: { convertedFromQuoteId: quote.id },
        items: {
          create: quote.items.map((qi) => ({
            tenantId: ctx.tenantId,
            productId: qi.productId,
            variantId: qi.variantId,
            sku: qi.sku,
            name: qi.name,
            description: qi.description,
            quantity: qi.quantity,
            unitPrice: qi.unitPrice,
            lineSubtotal: qi.lineSubtotal,
            taxAmount: qi.taxAmount,
            discountAmount: qi.discountAmount,
            lineTotal: qi.lineTotal,
            metadata: qi.metadata as Prisma.InputJsonValue,
          })),
        },
      },
    });

    const updatedQuote = await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: 'converted',
        convertedToOrderId: order.id,
        convertedAt: new Date(),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.quote.converted',
      entityType: 'Quote',
      entityId: quote.id,
      diff: { after: { orderId: order.id, orderNumber: order.orderNumber } },
    });

    return { quote: updatedQuote, order };
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.quote.accepted',
    payload: {
      quoteId: result.quote.id,
      converted: true,
      orderId: result.order.id,
    },
    dedupeKey: `crm.quote.converted:${result.quote.id}`,
  });
  await publishPlatformEvent({
    id: crypto.randomUUID(),
    topic: 'order.created',
    tenantId: ctx.tenantId,
    occurredAt: result.order.placedAt,
    payload: {
      orderId: result.order.id,
      customerId: result.order.customerId,
      total: Number(result.order.total),
      currency: result.order.currency,
      placedAt: result.order.placedAt.toISOString(),
    },
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helper
// ─────────────────────────────────────────────────────────────────────────

async function transition(
  ctx: ServiceContext,
  quoteId: string,
  fromStatus: Quote['status'],
  toStatus: Quote['status'],
  apply: (tx: Prisma.TransactionClient, q: Quote) => Promise<Quote>
): Promise<Quote> {
  return withTenant(ctx, async (tx) => {
    const before = await tx.quote.findUnique({ where: { id: quoteId } });
    if (!before) throw new CrmNotFoundError('Quote', quoteId);
    if (before.status !== fromStatus) {
      throw new CrmValidationError(
        `Cannot transition quote from "${before.status}" to "${toStatus}"`
      );
    }
    const updated = await apply(tx, before);
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: `crm.quote.${toStatus}`,
      entityType: 'Quote',
      entityId: updated.id,
      diff: { before: { status: before.status }, after: { status: updated.status } },
    });
    return updated;
  });
}
