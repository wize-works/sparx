// quoteService — list / get / create / update + item mutations on a draft
// quote. Lifecycle transitions (submit / accept / decline / expire /
// convertToOrder) live in quote-lifecycle-service.ts.

import {
  AddQuoteItemInput,
  CreateQuoteInput,
  ListQuotesInput,
  RemoveQuoteItemInput,
  UpdateQuoteInput,
} from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, Quote, QuoteItem } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { computeLine, computeTotals } from './order-totals';
import { nextQuoteNumber } from './record-numbers';

export interface QuoteWithItems extends Quote {
  items: QuoteItem[];
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

export async function list(
  ctx: ServiceContext,
  rawFilter: unknown = {}
): Promise<{ items: Quote[]; total: number }> {
  const filter = ListQuotesInput.parse(rawFilter);
  return withTenant(ctx, async (tx) => {
    const where: Prisma.QuoteWhereInput = {
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.b2bAccountId ? { b2bAccountId: filter.b2bAccountId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.expiringBefore ? { validUntil: { lt: new Date(filter.expiringBefore) } } : {}),
      ...(filter.q ? { quoteNumber: { startsWith: filter.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      tx.quote.findMany({
        where,
        orderBy: { [filter.sortBy]: 'desc' },
        take: filter.take,
        skip: filter.skip,
      }),
      tx.quote.count({ where }),
    ]);
    return { items, total };
  });
}

export async function get(ctx: ServiceContext, quoteId: string): Promise<QuoteWithItems> {
  const quote = await withTenant(ctx, (tx) =>
    tx.quote.findUnique({ where: { id: quoteId }, include: { items: true } })
  );
  if (!quote) throw new CrmNotFoundError('Quote', quoteId);
  return quote;
}

// ─────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<QuoteWithItems> {
  const input = CreateQuoteInput.parse(rawInput);
  const totals = computeTotals(input.items, input.shippingTotal, input.taxTotal);

  const quote = await withTenant(ctx, async (tx) => {
    const quoteNumber = input.quoteNumber ?? (await nextQuoteNumber(tx, ctx.tenantId));

    const created = await tx.quote.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        quoteNumber,
        status: 'draft',
        currency: input.currency,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        shippingTotal: totals.shippingTotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        paymentTerms: input.paymentTerms ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        customerNote: input.customerNote ?? null,
        internalNote: input.internalNote ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        createdByUserId: ctx.userId ?? null,
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
      action: 'crm.quote.created',
      entityType: 'Quote',
      entityId: created.id,
      diff: { after: { quoteNumber: created.quoteNumber, total: created.total.toString() } },
    });

    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.quote.created',
    payload: { quoteId: quote.id, customerId: quote.customerId, total: Number(quote.total) },
    dedupeKey: `crm.quote.created:${quote.id}`,
  });

  return quote;
}

export async function update(
  ctx: ServiceContext,
  quoteId: string,
  rawInput: unknown
): Promise<Quote> {
  const input = UpdateQuoteInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const before = await tx.quote.findUnique({ where: { id: quoteId } });
    if (!before) throw new CrmNotFoundError('Quote', quoteId);
    if (before.status !== 'draft') {
      throw new CrmValidationError(
        `Cannot edit a quote in status "${before.status}"; clone it instead`
      );
    }
    const updated = await tx.quote.update({
      where: { id: quoteId },
      data: {
        ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
        ...(input.validUntil !== undefined
          ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
          : {}),
        ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
        ...(input.shippingTotal !== undefined ? { shippingTotal: input.shippingTotal } : {}),
        ...(input.discountTotal !== undefined ? { discountTotal: input.discountTotal } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    await recomputeQuoteTotals(tx, quoteId);
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.quote.updated',
      entityType: 'Quote',
      entityId: updated.id,
      diff: null,
    });
    return updated;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Item mutations (draft only)
// ─────────────────────────────────────────────────────────────────────────

export async function addItem(ctx: ServiceContext, rawInput: unknown): Promise<QuoteItem> {
  const input = AddQuoteItemInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const quote = await tx.quote.findUnique({ where: { id: input.quoteId } });
    if (!quote) throw new CrmNotFoundError('Quote', input.quoteId);
    if (quote.status !== 'draft') {
      throw new CrmValidationError('Cannot add items to a non-draft quote');
    }
    const line = computeLine(input.item);
    const created = await tx.quoteItem.create({
      data: {
        tenantId: ctx.tenantId,
        quoteId: input.quoteId,
        productId: input.item.productId ?? null,
        variantId: input.item.variantId ?? null,
        sku: input.item.sku,
        name: input.item.name,
        description: input.item.description ?? null,
        quantity: input.item.quantity,
        unitPrice: input.item.unitPrice,
        lineSubtotal: line.lineSubtotal,
        taxAmount: line.taxAmount,
        discountAmount: line.discountAmount,
        lineTotal: line.lineTotal,
        metadata: (input.item.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    await recomputeQuoteTotals(tx, input.quoteId);
    return created;
  });
}

export async function removeItem(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = RemoveQuoteItemInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const item = await tx.quoteItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new CrmNotFoundError('QuoteItem', input.itemId);
    const quote = await tx.quote.findUnique({ where: { id: item.quoteId } });
    if (quote?.status !== 'draft') {
      throw new CrmValidationError('Cannot remove items from a non-draft quote');
    }
    await tx.quoteItem.delete({ where: { id: input.itemId } });
    await recomputeQuoteTotals(tx, item.quoteId);
  });
}

/** Re-derive quote header totals from current line items. Called after
 *  every item-set mutation. */
async function recomputeQuoteTotals(tx: Prisma.TransactionClient, quoteId: string): Promise<void> {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    include: { items: true },
  });
  if (!quote) return;
  const totals = computeTotals(
    quote.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      sku: i.sku,
      name: i.name,
      description: i.description,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      taxAmount: Number(i.taxAmount),
      discountAmount: Number(i.discountAmount),
    })),
    Number(quote.shippingTotal)
  );
  await tx.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      shippingTotal: totals.shippingTotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
    },
  });
}
