// Sending an invoice to the person who owes the money.
//
// ── WHY THIS EXISTED NOWHERE ────────────────────────────────────────────────
//
// Invoicing could create, number, total, snapshot, print and take payment on a
// document — and had no way to give it to the customer. The editor even labels
// the email box "Where the invoice gets sent", a promise nothing kept: the only
// outbound actions were "Print or save as PDF" and "Copy payment link", both of
// which hand the job back to the operator's own mail client.
//
// ── WHY THE DOCUMENT TRAVELS IN THE BODY ────────────────────────────────────
//
// There is no public invoice page (the payment-link route says so in its own
// comment) and the event path carries no attachment, so a mail that only
// ANNOUNCED an invoice would announce something the recipient cannot open.
// Everything needed to check it — who it is from, the number, the lines, the
// total, what is still owed, when it is due, and the note — is in the mail.
//
// Same placement rationale as `signature-mail.ts`: this lives in api-rest, not
// in @wizeworks/crm, because the composition root already owns the outbound
// path and giving the CRM package a transport dependency would be paid for in
// every unit test in it.

import type { FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@wizeworks/db';
import { requireAuth } from '@wizeworks/api-core/auth';
import { publish } from '@wizeworks/api-core/pubsub';
import { billingDocumentStageService } from '@wizeworks/crm';

export class InvoiceSendError extends Error {}

/** The money figures a bill is built from, in dollars. */
export interface InvoiceMoney {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  surchargeTotal: number;
  amountPaid: number;
}

/**
 * THE ROWS THE CUSTOMER ADDS UP.
 *
 * Only the rows that are TRUE of this document: a "Tax $0.00" line on a bakery
 * that charges no tax is a number nobody set, and "Already paid" on an untouched
 * invoice says a payment happened.
 *
 * But every row that IS true has to be here, and delivery and surcharge were
 * not. A bill whose lines added to $58, whose subtotal said $58, asked the
 * customer for $67 and explained none of it. Nine dollars from nowhere is a
 * document nobody can check: the customer who checks has to write and ask, and
 * the one who does not pays a charge they were never shown. The PRINTED invoice
 * had both rows from the start, which is why this went unnoticed -- the one
 * artifact that got it right is the one nobody reads on screen.
 *
 * The invariant, and what its test asserts: subtotal - discount + tax + delivery
 * + surcharge - already paid == the balance the email asks for.
 */
export function invoiceSummaryRows(
  m: InvoiceMoney,
  currency: string
): { label: string; value: string }[] {
  const rows = [{ label: 'Subtotal', value: money(m.subtotal, currency) }];
  if (m.discountTotal > 0) {
    rows.push({ label: 'Discount', value: `-${money(m.discountTotal, currency)}` });
  }
  if (m.taxTotal > 0) rows.push({ label: 'Tax', value: money(m.taxTotal, currency) });
  if (m.shippingTotal > 0) {
    rows.push({ label: 'Delivery', value: money(m.shippingTotal, currency) });
  }
  if (m.surchargeTotal > 0) {
    rows.push({ label: 'Surcharge', value: money(m.surchargeTotal, currency) });
  }
  if (m.amountPaid > 0) {
    rows.push({ label: 'Already paid', value: `-${money(m.amountPaid, currency)}` });
  }
  return rows;
}

/** The trading name frozen on the document when it was finalized, or null.
 *  `siteName`, not `legalName`: this is the name on the email a customer opens,
 *  and the shop is what they recognise. The printed document uses the legal
 *  entity — see `frozenIssuerIdentity`. */
function frozenIssuerName(issuedBy: unknown): string | null {
  if (!issuedBy || typeof issuedBy !== 'object' || Array.isArray(issuedBy)) return null;
  const value = (issuedBy as Record<string, unknown>).siteName;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "48 × $8.50" — the arithmetic behind the line, so a bookkeeper can check it
 *  without opening anything. Whole quantities lose their trailing zeros; 2.5
 *  hours keeps its half. */
function quantityLine(quantity: number, unitPrice: number, currency: string): string {
  const qty = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return `${qty} × ${money(unitPrice, currency)}`;
}

export interface SendInvoiceResult {
  to: string;
  documentNumber: string;
}

/**
 * Email the document to whoever it bills.
 *
 * Refuses rather than guesses in the two cases where a send would be a lie:
 * a document with no recipient address, and one that has not been numbered yet
 * (an unnumbered draft has nothing the customer could quote back).
 */
export async function sendInvoice(
  request: FastifyRequest,
  documentId: string
): Promise<SendInvoiceResult> {
  const auth = requireAuth(request);
  const doc = await withTenant({ tenantId: auth.tenantId }, (tx) =>
    tx.billingDocument.findUnique({
      where: { id: documentId },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        stage: { select: { customerLabel: true } },
        customer: { select: { email: true, firstName: true, lastName: true } },
      },
    })
  );
  if (!doc) throw new InvoiceSendError('That invoice no longer exists.');

  const billTo = (doc.billTo ?? {}) as { name?: string; email?: string };
  const to = billTo.email ?? doc.customer?.email ?? null;
  if (!to) {
    throw new InvoiceSendError(
      'There is no email address to send this to. Add one under Bill to, then send it again.'
    );
  }
  if (!doc.number) {
    throw new InvoiceSendError(
      'This document has no number yet, so there is nothing for the customer to quote back. Move it to a stage that numbers it first.'
    );
  }

  // WHEN TO PAY, on the bill that asks for the money.
  //
  // A due date used to be written only when the payer's employer had agreed a
  // net-terms window. So every invoice to a person -- which is most of them for
  // a shop -- went out with no deadline at all, and the one number a bill exists
  // to state was blank. Nothing downstream worked either: `deriveDocumentStatus`
  // can never call it overdue, `bucketAging` files it under "Current" forever,
  // and every step of the dunning ladder keys on a day count off this date, so
  // it was never chased. The customer was asked for money by no particular date
  // and then never reminded.
  //
  // This is the moment to answer it, not the moment the invoice was raised: the
  // customer has the document NOW. A payer on terms already has a date from
  // stage entry and keeps it -- `dueAt` is only filled when it is still empty,
  // so a date she set by hand always wins.
  const dueAt =
    doc.dueAt ??
    (await withTenant({ tenantId: auth.tenantId }, (tx) =>
      billingDocumentStageService.dueDateFromTerms(tx, doc, new Date())
    ));

  // WHO THIS IS FROM, as it was when the document was issued.
  //
  // The document freezes its issuer on finalize (`issued_by`) precisely so a
  // later rename cannot rewrite the letterhead on a bill somebody already has —
  // and this is the copy that reaches them, so the frozen name wins. `siteName`
  // rather than `legalName`: the shop is the business a customer deals with
  // (docs/58), and the trading name is the one they recognise on an email.
  //
  // The live lookup remains for a document with nothing frozen — anything not
  // yet finalized, or issued before the column existed.
  const frozenName = frozenIssuerName(doc.issuedBy);
  const site =
    frozenName === null && doc.propertyId
      ? await prisma.property.findUnique({ where: { id: doc.propertyId }, select: { name: true } })
      : null;
  const tenant =
    frozenName === null
      ? await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { name: true } })
      : null;
  const fromName = frozenName ?? site?.name ?? tenant?.name ?? 'us';

  const currency = doc.currency;
  const total = Number(doc.total);
  const balance = Number(doc.balance);
  const paid = Number(doc.amountPaid);

  const summary = invoiceSummaryRows(
    {
      subtotal: Number(doc.subtotal),
      discountTotal: Number(doc.discountTotal),
      taxTotal: Number(doc.taxTotal),
      shippingTotal: Number(doc.shippingTotal),
      surchargeTotal: Number(doc.surchargeTotal),
      amountPaid: paid,
    },
    currency
  );

  await publish(request.log, 'email.send', auth.tenantId, auth.actorId, {
    to,
    template: 'invoice-sent',
    propertyId: doc.propertyId ?? null,
    props: {
      billToName: billTo.name ?? undefined,
      fromName,
      // The tenant's own word for this stage — "Invoice", "Bill", "Statement".
      documentLabel: doc.stage.customerLabel || 'Invoice',
      documentNumber: doc.number,
      total,
      balance,
      currency,
      dueAt: dueAt.toISOString(),
      lines: doc.lines.map((line) => ({
        title: line.description,
        subtitle: quantityLine(Number(line.quantity), Number(line.unitPrice), currency),
        amount: money(Number(line.lineTotal), currency),
      })),
      summary,
      note: doc.notes,
    },
  });

  // Remember that it went, and to where. There is no `sent_at` column on this
  // model, so it rides in the document's own metadata bag — merged, never
  // replaced, because other keys live there too.
  const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
  await withTenant({ tenantId: auth.tenantId }, (tx) =>
    tx.billingDocument.update({
      where: { id: documentId },
      data: {
        metadata: { ...metadata, sentAt: new Date().toISOString(), sentTo: to },
        // Only when it had none. Written here rather than before the send so a
        // mail that fails leaves the document exactly as it was.
        ...(doc.dueAt === null ? { dueAt } : {}),
      },
    })
  );

  return { to, documentNumber: doc.number };
}
