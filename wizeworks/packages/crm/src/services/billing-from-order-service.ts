// Making an invoice out of an order — the "ask the customer for the money" path.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// A shop with no payment provider takes no money at checkout. Its last screen
// says so plainly: "Placing this order does not take any money now. We'll be in
// touch about paying for it." The goods then go out, and the shop has to be in
// touch.
//
// It could not. There was an Invoices screen and a New invoice form, but the
// form had no idea orders existed: to bill a $234.60 order the owner opened it,
// read the items, came back, found the customer again and retyped every line by
// hand — including a tax rate she had already set up properly elsewhere. And
// when the customer paid that invoice, the ORDER stayed `unpaid` forever,
// because no column joined the two. She was reconciling by memory.
//
// ── WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
//
// It copies the sale onto an invoice: one line per item, the delivery charge as
// shipping, the addresses as they were frozen on the order, and the order's own
// tax as a rate. It does NOT re-price anything. The order is the record of what
// was agreed; an invoice that quietly charged a different number would be a
// second opinion about a sale that already happened.
//
// Money already received is carried across as a DEPOSIT, written directly rather
// than through `billingPaymentService.recordPayment`. That is load-bearing:
// `recordPayment` mirrors a payment back onto the linked order, and this money is
// already ON the order. Routing the seed through it would count it twice.

import { withTenant } from '@wizeworks/db';
import type { TxClient } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { recomputeTotals, type DocumentWithLines } from './billing-document-service';
import { applyStageEntryEffects } from './billing-document-stage-service';

/** An address as commerce freezes it on an order. */
interface FrozenAddress {
  recipientName?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/**
 * Translate a frozen ORDER address into the party shape invoicing stores.
 *
 * These are two different shapes for the same idea and copying one into the
 * other verbatim silently empties the invoice. Commerce freezes a structured
 * address (`recipientName`, `line1`, `region`, `postalCode`); an invoice's
 * `billTo` is three flat strings, `{ name, email, address }`, and EVERY reader
 * of it wants those three: the Bill to form, the "billed to" column on the
 * receivables list, the PDF, and the greeting on the emailed invoice. Handed
 * the commerce shape they all find nothing and print nothing, and the Send
 * dialog tells the owner there is no email address on an invoice whose customer
 * has one.
 *
 * The email comes off the CUSTOMER rather than the address, because a postal
 * address does not carry one and this field is what "Where the invoice gets
 * sent" means.
 */
function partyFromOrder(
  address: FrozenAddress | null,
  fallbackName: string,
  email: string | null
): { name: string; email: string; address: string } {
  const lines = [
    address?.line1,
    address?.line2,
    [address?.city, [address?.region, address?.postalCode].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', '),
    address?.country,
  ]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0);

  return {
    name: (address?.recipientName ?? '').trim() || fallbackName,
    email: email ?? '',
    address: lines.join('\n'),
  };
}

/** Money on an order, in the two numbers this decision needs. */
interface OrderMoney {
  total: number;
  amountPaid: number;
}

/** What is still owed, to the cent. */
function outstanding(order: OrderMoney): number {
  return Math.round((order.total - order.amountPaid) * 100) / 100;
}

/**
 * The single tax rate that reproduces this order's tax.
 *
 * The order stores tax per line, already computed by the tax service against the
 * place it was sold into. A billing document stores ONE rate and applies it to
 * whichever lines are marked taxable — so the rate is derived from the taxable
 * lines alone, not the whole subtotal, or an order with one exempt line would
 * come out under-taxed.
 *
 * Exact for the ordinary case, which is one tax place per order. An order that
 * somehow carried two different rates would round to a blended one; the order
 * remains the record of what was actually charged.
 */
function taxRateFrom(lines: { lineSubtotal: number; taxAmount: number }[]): number {
  const taxable = lines.filter((l) => l.taxAmount > 0);
  const base = taxable.reduce((acc, l) => acc + l.lineSubtotal, 0);
  if (base <= 0) return 0;
  const tax = taxable.reduce((acc, l) => acc + l.taxAmount, 0);
  // Decimal(6,4) on the column — four places is the precision it can hold.
  return Math.round((tax / base) * 10_000) / 10_000;
}

/** One invoice as the order pane needs to show it — enough to say what was asked
 *  for, how much of it has come back, and to open the document itself. */
export interface OrderInvoiceSummary {
  id: string;
  number: string | null;
  status: string;
  total: number;
  amountPaid: number;
  balance: number;
  currency: string;
  dueAt: string | null;
  createdAt: string;
  /**
   * When the invoice was actually emailed, and to whom — null while it has only
   * been raised.
   *
   * Raising an invoice and sending it are two different acts, and the pane read
   * as though they were one: it printed "Sent 7 Sep" off `createdAt` for a
   * document nobody had emailed. An owner reading that has been told her
   * customer has the bill, which is the one thing she is on this screen to
   * find out.
   */
  sentAt: string | null;
  sentTo: string | null;
}

/** The invoices raised for an order, newest first. Empty is the ordinary answer:
 *  a shop that takes card at checkout never raises one. */
export async function listInvoicesForOrder(
  ctx: ServiceContext,
  orderId: string
): Promise<OrderInvoiceSummary[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.billingDocument.findMany({
      where: { tenantId: ctx.tenantId, orderId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        amountPaid: true,
        balance: true,
        currency: true,
        dueAt: true,
        createdAt: true,
        // The send route has no `sent_at` column to write, so it records the
        // send in the metadata bag; this reads it back from the same place.
        metadata: true,
      },
    })
  );
  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      total: Number(r.total),
      amountPaid: Number(r.amountPaid),
      balance: Number(r.balance),
      currency: r.currency,
      dueAt: r.dueAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      sentAt: typeof meta.sentAt === 'string' ? meta.sentAt : null,
      sentTo: typeof meta.sentTo === 'string' ? meta.sentTo : null,
    };
  });
}

export interface CreateInvoiceForOrderResult {
  document: DocumentWithLines;
  /** What the customer is being asked for, after any money already received. */
  balance: number;
}

/**
 * Raise an invoice for an order.
 *
 * Refuses rather than guessing in the three cases where an invoice would be
 * wrong: an order nobody owes anything on, an order that was called off, and an
 * order that already has one. Each refusal names the thing it found, because
 * "cannot create invoice" tells an owner nothing about what to do next.
 */
export async function createInvoiceForOrder(
  ctx: ServiceContext,
  input: { orderId: string; dueAt?: string | null }
): Promise<CreateInvoiceForOrderResult> {
  const result = await withTenant(ctx, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        // The address on the order carries no email, and the invoice's "Where
        // the invoice gets sent" field is the one the Send button reads.
        customer: { select: { email: true, firstName: true, lastName: true } },
        billingDocuments: {
          where: { deletedAt: null },
          select: { id: true, number: true, status: true },
        },
      },
    });
    if (!order) throw new CrmNotFoundError('Order', input.orderId);

    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw new CrmValidationError(
        `Order ${order.orderNumber} was ${order.status === 'cancelled' ? 'cancelled' : 'refunded'}, so there is nothing to invoice.`
      );
    }

    const live = order.billingDocuments.filter((d) => d.status !== 'void');
    if (live.length > 0) {
      const existing = live[0];
      throw new CrmValidationError(
        `Order ${order.orderNumber} has already been invoiced${
          existing?.number ? ` as ${existing.number}` : ''
        }. Open that invoice to chase it, or void it before raising another.`
      );
    }

    const money = { total: Number(order.total), amountPaid: Number(order.amountPaid) };
    const owed = outstanding(money);
    if (owed <= 0) {
      throw new CrmValidationError(
        `Order ${order.orderNumber} is paid in full, so there is nothing to ask for.`
      );
    }

    // The workflow an invoice belongs on: the tenant's default, else the one
    // actually called `invoice`. A tenant with neither has not set invoicing up.
    const workflow =
      (await tx.documentWorkflow.findFirst({
        where: { tenantId: ctx.tenantId, archivedAt: null, isDefault: true },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
      })) ??
      (await tx.documentWorkflow.findFirst({
        where: { tenantId: ctx.tenantId, archivedAt: null, slug: 'invoice' },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
      }));
    if (!workflow || workflow.stages.length === 0) {
      throw new CrmValidationError(
        'There is no invoice layout set up yet, so an invoice cannot be numbered. Add one in Invoices settings first.'
      );
    }
    const stage = workflow.stages[0];
    if (!stage) throw new CrmValidationError('That invoice layout has no stages.');

    // What to print when the frozen address carried no recipient name — an
    // invoice addressed to nobody is not something to send.
    const customerName =
      [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ').trim() ||
      'Customer';

    const items = order.items.map((it) => ({
      name: it.name,
      sku: it.sku,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      lineSubtotal: Number(it.lineSubtotal),
      taxAmount: Number(it.taxAmount),
      discountAmount: Number(it.discountAmount),
      productId: it.productId,
      variantId: it.variantId,
    }));

    const created = await tx.billingDocument.create({
      data: {
        tenantId: ctx.tenantId,
        // The order's own site issues the invoice. On a tenant running two
        // businesses this is what keeps one shop's invoice out of the other's
        // numbering sequence — the reason `numberSeq` is per-site at all.
        propertyId: order.propertyId ?? (await resolveIssuingSite(tx, ctx.tenantId)),
        workflowId: workflow.id,
        stageId: stage.id,
        orderId: order.id,
        customerId: order.customerId,
        currency: order.currency,
        taxRate: taxRateFrom(items),
        // Frozen on the order at checkout, so this is where the goods actually
        // went — not wherever the customer record points today. Translated into
        // the invoice's own party shape on the way across; see `partyFromOrder`.
        billTo: partyFromOrder(
          (order.billingAddress ?? order.shippingAddress ?? null) as FrozenAddress | null,
          customerName,
          order.customer?.email ?? null
        ) as never,
        shipTo: partyFromOrder(
          (order.shippingAddress ?? null) as FrozenAddress | null,
          customerName,
          order.customer?.email ?? null
        ) as never,
        shippingTotal: Number(order.shippingTotal),
        surchargeTotal: Number(order.surchargeTotal),
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        notes: `For order ${order.orderNumber}.`,
      },
    });

    // Run the starting stage's entry effects, exactly as the New invoice form
    // does. This is not optional decoration: it is what MINTS THE NUMBER. An
    // invoice raised here without it went to the customer as a document with no
    // number, no due date and no frozen letterhead, so it sat outside every
    // aging bucket and could never be chased -- the one thing it was raised to
    // do. Two paths create a billing document and only one applied the rule;
    // this is the second.
    const { events: entryEvents } = await applyStageEntryEffects(tx, ctx, created, stage);

    for (const [index, it] of items.entries()) {
      await tx.billingDocumentLine.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: created.id,
          description: it.sku ? `${it.name} (${it.sku})` : it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountAmount: it.discountAmount,
          // Taxable exactly where the order taxed it, so an exempt line stays
          // exempt rather than picking up the blended rate.
          taxable: it.taxAmount > 0,
          lineSubtotal: it.lineSubtotal,
          taxAmount: it.taxAmount,
          lineTotal: it.lineSubtotal + it.taxAmount,
          productId: it.productId,
          variantId: it.variantId,
          sortOrder: index,
        },
      });
    }

    // Money already in, carried across so the balance is what is genuinely still
    // owed. Written directly and NOT through `recordPayment`, which mirrors onto
    // the order — this money is already there, and going through it would count
    // the same dollars twice.
    if (money.amountPaid > 0) {
      await tx.billingDocumentPayment.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: created.id,
          kind: 'deposit',
          method: 'other',
          amount: money.amountPaid,
          note: `Already received against order ${order.orderNumber}.`,
          receivedAt: order.paidAt ?? new Date(),
          recordedById: ctx.userId ?? null,
        },
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.document.created_for_order',
      entityType: 'BillingDocument',
      entityId: created.id,
      diff: {
        after: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          lines: items.length,
          balance: owed,
        },
      },
    });

    return {
      documentId: created.id,
      orderNumber: order.orderNumber,
      balance: owed,
      entryEvents,
    };
  });

  // Totals are derived from the lines, the rate, shipping and the payment rows —
  // done outside the create so there is exactly one place that knows the formula.
  const document = await withTenant(ctx, async (tx) => {
    await recomputeTotals(tx, ctx.tenantId, result.documentId);
    return tx.billingDocument.findUniqueOrThrow({
      where: { id: result.documentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.billing_document.created',
    payload: {
      documentId: document.id,
      number: document.number,
      customerId: document.customerId,
      companyId: document.companyId,
      workflowId: document.workflowId,
      stageId: document.stageId,
      currency: document.currency,
      orderId: document.orderId,
    },
    dedupeKey: `crm.billing_document.created:${document.id}`,
  });

  // Whatever the starting stage did (finalized, voided) is announced too, so an
  // invoice raised from an order is not quieter to the rest of the platform than
  // the same invoice typed by hand.
  for (const e of result.entryEvents) {
    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: e.topic,
      payload: e.payload,
      dedupeKey: e.dedupeKey,
    });
  }

  return { document, balance: result.balance };
}

/** The site an invoice is issued by when the order does not name one — the
 *  tenant's primary. An order with no site is a tenant-level sale. */
async function resolveIssuingSite(tx: TxClient, tenantId: string): Promise<string> {
  const primary = await tx.property.findFirst({
    where: { tenantId, isPrimary: true },
    select: { id: true },
  });
  if (primary) return primary.id;
  const any = await tx.property.findFirst({ where: { tenantId }, select: { id: true } });
  if (!any) throw new CrmValidationError('This business has no site to issue an invoice from.');
  return any.id;
}
