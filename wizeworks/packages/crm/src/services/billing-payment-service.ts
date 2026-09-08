// billingPaymentService — record deposits / payments / refunds against a billing
// document (docs/87 §8). Append-only: a correction is a new `refund` row, never
// an edit or delete. The document's amountPaid / depositTotal / balance / status
// are re-derived from the payment rows by `recomputeTotals` after every write.
// Emits crm.billing_document.paid the first time the balance clears.
//
// Payments are allowed on a LOCKED (final/paid) document — locking freezes the
// LINES, not the act of paying a finalized invoice.

import { RecordBillingPaymentInput } from '@wizeworks/crm-schemas';
import { withTenant } from '@wizeworks/db';
import type { BillingDocumentPayment } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError } from '../errors';
import { recomputeTotals, type DocumentWithLines } from './billing-document-service';
import { recomputeOrderPaymentRollup } from './order-payments-service';

/** How the money arrived, in the words the ORDER's payment record uses. The two
 *  vocabularies overlap but are not the same list: an invoice can be settled with
 *  account credit, which an order payment spells `gift_card`, and `cash` on an
 *  invoice is money handed over, which an order calls `manual`. */
const ORDER_PROCESSOR: Record<string, string> = {
  cash: 'manual',
  card: 'card',
  check: 'check',
  ach: 'wire',
  wire: 'wire',
  account_credit: 'gift_card',
  store_credit: 'gift_card',
  other: 'manual',
};

export async function listPayments(
  ctx: ServiceContext,
  documentId: string
): Promise<BillingDocumentPayment[]> {
  return withTenant(ctx, async (tx) => {
    const doc = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new CrmNotFoundError('BillingDocument', documentId);
    return tx.billingDocumentPayment.findMany({
      where: { documentId },
      orderBy: { receivedAt: 'desc' },
    });
  });
}

export async function recordPayment(
  ctx: ServiceContext,
  documentId: string,
  rawInput: unknown
): Promise<{ document: DocumentWithLines; payment: BillingDocumentPayment }> {
  const input = RecordBillingPaymentInput.parse(rawInput);
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);

    const payment = await tx.billingDocumentPayment.create({
      data: {
        tenantId: ctx.tenantId,
        documentId,
        kind: input.kind,
        method: input.method,
        amount: input.amount,
        reference: input.reference ?? null,
        providerRef: input.providerRef ?? null,
        note: input.note ?? null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        recordedById: ctx.userId ?? null,
      },
    });
    // Re-derive amountPaid / balance / status from the full payment set.
    const recomputed = await recomputeTotals(tx, ctx.tenantId, documentId);

    // ── SETTLE THE ORDER THIS INVOICE BILLS ─────────────────────────────────
    //
    // Without this the link is decorative: the customer pays the invoice, the
    // invoice reads Paid, and the ORDER still says "Not paid · $234.60 still
    // owed" for ever. The owner would be reconciling two screens by memory,
    // which is the whole thing an invoice was supposed to stop.
    //
    // A refund is not mirrored here — putting money back is its own lifecycle on
    // the order (`order-refunds-service`), and writing a negative capture would
    // corrupt the rollup that both paths share.
    //
    // Seeded deposits do not reach this code at all: `createInvoiceForOrder`
    // writes the already-received money straight to the payment table rather
    // than through here, precisely so the same dollars are not counted twice.
    if (before.orderId && input.kind !== 'refund') {
      await tx.orderPayment.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: before.orderId,
          processor: ORDER_PROCESSOR[input.method] ?? 'manual',
          processorRef: payment.id,
          amount: input.amount,
          currency: before.currency,
          status: 'captured',
          capturedAt: payment.receivedAt,
          metadata: { billingDocumentId: documentId, billingDocumentNumber: before.number },
        },
      });
      // The one place that knows how an order's paid/partly-paid/unpaid state is
      // derived, so a payment arriving by invoice lands identically to one typed
      // onto the order.
      await recomputeOrderPaymentRollup(tx, ctx.tenantId, before.orderId);
    }
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: `invoicing.payment.${input.kind}`,
      entityType: 'BillingDocumentPayment',
      entityId: payment.id,
      diff: { after: { kind: input.kind, method: input.method, amount: input.amount } },
    });
    const document = await tx.billingDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    return {
      document,
      payment,
      becamePaid: before.status !== 'paid' && recomputed.status === 'paid',
    };
  });

  if (result.becamePaid) {
    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: 'crm.billing_document.paid',
      payload: {
        documentId: result.document.id,
        number: result.document.number,
        customerId: result.document.customerId,
        companyId: result.document.companyId,
        total: Number(result.document.total),
        currency: result.document.currency,
      },
      dedupeKey: `crm.billing_document.paid:${result.document.id}`,
    });
  }
  return { document: result.document, payment: result.payment };
}
