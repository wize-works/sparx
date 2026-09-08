// WHEN A BILL IS DUE — and who never got told.
//
// A due date used to be written only when the payer's EMPLOYER had a net-terms
// window on file. A shop's customers are people, not companies, so almost every
// invoice went out with no deadline at all: `deriveDocumentStatus` can never
// call one overdue, `bucketAging` files it under "Current" for ever, and every
// rung of the dunning ladder keys on a day count off that date, so it was never
// chased. The email even told the customer "Due on receipt" while the platform
// recorded no date and did nothing about it.
//
// The rule now: the window comes from the payer's terms, and it is counted from
// THE DAY THE CUSTOMER GETS THE BILL. Raising it is not handing it over, so a
// payer with no agreed window waits for the send rather than starting a clock
// that would make the invoice overdue before it arrived.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '@wizeworks/db';

import {
  billingDocumentService,
  billingDocumentStageService,
  billingFromOrderService,
  companyService,
  customerService,
  documentLineTypeService,
  documentWorkflowService,
  orderService,
} from '../../src/services/index.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

const DAY = 86_400_000;

describe('a bill says when it is due', () => {
  let test: TestContext;
  let walkInId: string;
  let onTermsId: string;
  let invoiceWorkflowId: string;

  beforeAll(async () => {
    test = await makeTestContext('owner');
    await documentWorkflowService.bootstrapDefaultWorkflows(test.ctx);
    await documentLineTypeService.bootstrapDefaultLineTypes(test.ctx);
    const invoiceWorkflow = (await documentWorkflowService.list(test.ctx)).find(
      (w) => w.slug === 'invoice'
    );
    if (!invoiceWorkflow) throw new Error('default workflows not seeded');
    invoiceWorkflowId = invoiceWorkflow.id;

    const walkIn = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'walk-in@invoice.test',
      firstName: 'Marguerite',
      lastName: 'Adeyemi',
    });
    walkInId = walkIn.id;

    const stockist = await companyService.create(test.ctx, {
      companyName: 'Alder & Vine Stockists',
      paymentTerms: 'net30',
    });
    const buyer = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'buyer@stockist.test',
      firstName: 'Tomas',
      lastName: 'Ferreira',
      companyId: stockist.id,
    });
    onTermsId = buyer.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  const invoiceFor = async (customerId: string) => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'WOOL-THROW', name: 'Wool throw', quantity: 1, unitPrice: 120 }],
    });
    const { document } = await billingFromOrderService.createInvoiceForOrder(test.ctx, {
      orderId: order.id,
    });
    return document;
  };

  it('sets the deadline from the terms the payer agreed', async () => {
    const document = await invoiceFor(onTermsId);

    // THE TERMS FOLLOW THE PAYER'S EMPLOYER. The invoice is raised against a
    // person -- nothing in the console sets `companyId` on the document itself
    // -- so reading terms off the document alone found none, every time.
    expect(document.dueAt).not.toBeNull();
    const days = Math.round((document.dueAt!.getTime() - Date.now()) / DAY);
    expect(days).toBe(30);
  });

  it('leaves a walk-in without a deadline until the bill is actually sent', async () => {
    const document = await invoiceFor(walkInId);

    // Deliberate, and the half of this rule that is easiest to get wrong.
    // "Due on receipt" cannot be dated on the day the invoice is RAISED: an
    // invoice may sit unsent while she checks a line, and dating it now would
    // deliver it already overdue. The send route fills this in from the day it
    // goes out. Until then the list marks it "Not sent", which is the honest
    // description of a bill nobody has been given.
    expect(document.dueAt).toBeNull();
  });

  it('answers "due on receipt" as the day of receipt, for a payer with no terms', async () => {
    // This is what the send route calls. `netTermsDays` has always documented an
    // empty terms field as "0 (due immediately)"; its only caller threw that 0
    // away, which is how "due immediately" became "no deadline, for ever".
    const receivedOn = new Date('2026-09-07T12:00:00.000Z');
    const due = await withTenant({ tenantId: test.tenant.tenantId }, (tx) =>
      billingDocumentStageService.dueDateFromTerms(
        tx,
        { companyId: null, customerId: walkInId },
        receivedOn
      )
    );
    expect(due.toISOString()).toBe(receivedOn.toISOString());
  });

  it('counts the agreed window from the day of receipt, not the day it was raised', async () => {
    const receivedOn = new Date('2026-09-07T12:00:00.000Z');
    const due = await withTenant({ tenantId: test.tenant.tenantId }, (tx) =>
      billingDocumentStageService.dueDateFromTerms(
        tx,
        { companyId: null, customerId: onTermsId },
        receivedOn
      )
    );
    expect(due.toISOString()).toBe('2026-10-07T12:00:00.000Z');
  });

  it('never overrides a deadline she set herself', async () => {
    // The idempotence guard is `dueAt === null`. Without it a payer on net 30
    // would have any hand-picked date silently replaced by "thirty days from
    // now" the moment the document entered its payable stage -- her decision
    // overwritten by a default, which is the worst kind of quiet.
    const chosen = '2026-12-24T00:00:00.000Z';
    const document = await billingDocumentService.create(test.ctx, {
      workflowId: invoiceWorkflowId,
      customerId: onTermsId,
      dueAt: chosen,
      currency: 'USD',
      taxRate: 0,
      shippingTotal: 0,
      surchargeTotal: 0,
    });
    expect(document.dueAt?.toISOString()).toBe(chosen);
  });
});
