// Asking the customer for the money — an invoice raised FOR an order, against a
// real (RLS-scoped) database.
//
// A shop with no payment provider takes none at checkout: the goods go out and
// the sale stays unpaid until somebody bills it. Before this existed the owner
// could raise an invoice only by retyping every line by hand, and paying that
// invoice settled nothing — the order it was for stayed `unpaid` for ever,
// because no column joined the two.
//
// The load-bearing behaviors, in the order they matter:
//   (1) the sale is copied, not re-priced — the invoice totals what the order does,
//   (2) money already received comes across, so the balance is what is truly owed,
//   (3) PAYING THE INVOICE SETTLES THE ORDER. Without this the link is decorative,
//   (4) the seeded deposit is not double-counted onto the order,
//   (5) it refuses, by name, in the three cases where an invoice would be wrong.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  billingFromOrderService,
  billingPaymentService,
  customerService,
  documentLineTypeService,
  documentWorkflowService,
  orderPaymentsService,
  orderService,
} from '../../src/services/index.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('an invoice can bill an order', () => {
  let test: TestContext;
  let customerId: string;

  beforeAll(async () => {
    test = await makeTestContext('owner');
    await documentWorkflowService.bootstrapDefaultWorkflows(test.ctx);
    await documentLineTypeService.bootstrapDefaultLineTypes(test.ctx);
    const customer = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'owes@invoice.test',
      firstName: 'Anneliese',
      lastName: 'Vogt',
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  const placeOrder = async (items: { sku: string; unitPrice: number; quantity?: number }[]) =>
    orderService.create(test.ctx, {
      customerId,
      items: items.map((i) => ({
        sku: i.sku,
        name: i.sku,
        quantity: i.quantity ?? 1,
        unitPrice: i.unitPrice,
      })),
    });

  it('copies the sale rather than re-pricing it', async () => {
    const order = await placeOrder([
      { sku: 'MARLOW-KNIT', unitPrice: 96 },
      { sku: 'EVERYDAY-TEE', unitPrice: 42, quantity: 2 },
    ]);

    const { document, balance } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });

    // Every line came across, and the invoice asks for exactly what the order
    // says. An invoice quietly charging a different number would be a second
    // opinion about a sale that already happened.
    expect(document.lines).toHaveLength(2);
    expect(Number(document.total)).toBe(Number(order.total));
    expect(balance).toBe(Number(order.total));
    expect(document.orderId).toBe(order.id);
    // The default single-stage Invoice workflow numbers on create.
    expect(document.number).toMatch(/^INV-/);

    const listed = await billingFromOrderService.listInvoicesForOrder(test.ctx, order.id);
    expect(listed.map((i) => i.id)).toEqual([document.id]);
  });

  it('addresses the invoice to somebody, in the shape invoicing reads', async () => {
    const order = await placeOrder([{ sku: 'LINEN-SHIRT', unitPrice: 88 }]);
    const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });

    // An order freezes a STRUCTURED address (`recipientName`, `line1`,
    // `postalCode`); an invoice's `billTo` is three flat strings. Copying one
    // into the other verbatim type-checks, saves, and silently empties the
    // invoice: the Bill to form, the "billed to" column, the PDF and the
    // greeting on the emailed invoice all read `name`/`email`/`address` and
    // would find nothing — and the Send dialog would tell the owner there is no
    // address on an invoice whose customer has one.
    const billTo = document.billTo as { name?: string; email?: string; address?: string } | null;
    expect(billTo?.name).toBe('Anneliese Vogt');
    expect(billTo?.email).toBe('owes@invoice.test');
    expect(typeof billTo?.address).toBe('string');
  });

  it('freezes who issued it, on the default workflow', async () => {
    const order = await placeOrder([{ sku: 'WOOL-THROW', unitPrice: 120 }]);
    const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });

    // `issued_by` exists so that renaming a site, or editing the legal entity's
    // address, cannot rewrite the letterhead on invoices already in customers'
    // hands. It was written only when a document entered a `final` stage — and
    // THE DEFAULT WORKFLOW EVERY TENANT STARTS ON HAS NO FINAL STAGE. Its one
    // Invoice stage is `open`, so the freeze never fired: 0 of 90 documents on
    // the dev database carried an issuer, 52 of them finalized, and every
    // letterhead was resolved live. It now freezes when the document becomes
    // payable, which is the same moment the due date is set and the same moment
    // the customer is handed a bill.
    const issuer = document.issuedBy as { siteName?: string; legalName?: string } | null;
    expect(issuer).not.toBeNull();
    expect(typeof issuer?.siteName).toBe('string');
  });

  it('carries money already received across, so the balance is what is truly owed', async () => {
    const order = await placeOrder([{ sku: 'SILK-SCARF', unitPrice: 67 }]);
    await orderPaymentsService.recordPayment(test.ctx, {
      orderId: order.id,
      processor: 'manual',
      amount: 40,
      currency: 'USD',
      status: 'captured',
    });

    const { document, balance } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });

    // The invoice still shows the whole sale — that is what an invoice IS — but
    // the $40 already handed over is on it, so the ask is the remaining $27.
    expect(Number(document.total)).toBe(67);
    expect(Number(document.amountPaid)).toBe(40);
    expect(Number(document.balance)).toBe(27);
    expect(balance).toBe(27);

    // And it did NOT bounce back onto the order as a second $40. The seeded
    // deposit is written straight to the payment table precisely so the mirror
    // in `billingPaymentService.recordPayment` never sees it.
    const settled = await orderService.get(test.ctx, order.id);
    expect(Number(settled.amountPaid)).toBe(40);
    expect(settled.paymentStatus).toBe('partially_paid');
  });

  it('settles the ORDER when the invoice is paid', async () => {
    const order = await placeOrder([{ sku: 'ASH-OVERSHIRT', unitPrice: 180 }]);
    const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });

    await billingPaymentService.recordPayment(test.ctx, document.id, {
      kind: 'payment',
      method: 'check',
      amount: 180,
    });

    // THE POINT OF THE WHOLE THING. Without this the customer pays, the invoice
    // reads Paid, and the order still says "Not paid · $180.00 still owed" for
    // ever — the owner reconciling two screens by memory.
    const settled = await orderService.get(test.ctx, order.id);
    expect(Number(settled.amountPaid)).toBe(180);
    expect(settled.paymentStatus).toBe('paid');
    expect(settled.paidAt).not.toBeNull();

    // Recorded as a real payment on the order, pointing back at the invoice it
    // arrived through, so the money has a provenance rather than appearing.
    const payments = await orderPaymentsService.listForOrder(test.ctx, order.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.processor).toBe('check');
    const meta = payments[0]?.metadata as { billingDocumentId?: string } | null;
    expect(meta?.billingDocumentId).toBe(document.id);
  });

  it('settles part of an order when the invoice is part paid', async () => {
    const order = await placeOrder([{ sku: 'CEDAR-COAT', unitPrice: 276 }]);
    const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });
    await billingPaymentService.recordPayment(test.ctx, document.id, {
      kind: 'payment',
      method: 'cash',
      amount: 100,
    });

    const settled = await orderService.get(test.ctx, order.id);
    expect(Number(settled.amountPaid)).toBe(100);
    expect(settled.paymentStatus).toBe('partially_paid');
    // `cash` on an invoice is money handed over, which an order calls `manual` —
    // the two vocabularies are not the same list.
    const payments = await orderPaymentsService.listForOrder(test.ctx, order.id);
    expect(payments[0]?.processor).toBe('manual');
  });

  describe('refuses, by name, where an invoice would be wrong', () => {
    it('an order that is already paid in full', async () => {
      const order = await placeOrder([{ sku: 'PAID-42', unitPrice: 42 }]);
      await orderPaymentsService.recordPayment(test.ctx, {
        orderId: order.id,
        processor: 'manual',
        amount: 42,
        currency: 'USD',
        status: 'captured',
      });
      await expect(
        billingFromOrderService.createInvoiceForOrder(test.ctx, { orderId: order.id })
      ).rejects.toThrow(/paid in full/i);
    });

    it('an order that was called off', async () => {
      const order = await placeOrder([{ sku: 'GONE-99', unitPrice: 99 }]);
      await orderService.cancel(test.ctx, { orderId: order.id, reason: 'changed mind' });
      await expect(
        billingFromOrderService.createInvoiceForOrder(test.ctx, { orderId: order.id })
      ).rejects.toThrow(/cancelled/i);
    });

    it('an order that has already been invoiced, naming the invoice', async () => {
      const order = await placeOrder([{ sku: 'TWICE-51', unitPrice: 51 }]);
      const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
        orderId: order.id,
      });
      // The refusal names the document, because "cannot create invoice" tells an
      // owner nothing about what to do next.
      await expect(
        billingFromOrderService.createInvoiceForOrder(test.ctx, { orderId: order.id })
      ).rejects.toThrow(new RegExp(document.number ?? 'INV-'));
    });
  });

  it('does not mirror a refund onto the order', async () => {
    const order = await placeOrder([{ sku: 'REFUND-60', unitPrice: 60 }]);
    const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });
    await billingPaymentService.recordPayment(test.ctx, document.id, {
      kind: 'payment',
      method: 'cash',
      amount: 60,
    });
    await billingPaymentService.recordPayment(test.ctx, document.id, {
      kind: 'refund',
      method: 'cash',
      amount: 20,
    });

    // Putting money back is its own lifecycle on the order; writing a negative
    // capture here would corrupt the rollup both paths share. So the order still
    // shows the one payment, and the refund lives on the invoice.
    const payments = await orderPaymentsService.listForOrder(test.ctx, order.id);
    expect(payments).toHaveLength(1);
    // Read back through the service, not the bare client: every billing table is
    // row-level-secured, so a direct query outside a tenant context returns an
    // empty list rather than an error and would have "proved" this by seeing
    // nothing at all.
    const rows = await billingPaymentService.listPayments(test.ctx, document.id);
    expect(rows.filter((r) => r.kind === 'refund')).toHaveLength(1);
  });
});
