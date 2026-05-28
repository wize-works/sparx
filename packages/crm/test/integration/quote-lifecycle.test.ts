// quoteService + quoteLifecycleService — the load-bearing tests are:
//   (1) status transitions are validated (no skipping submitted → accepted),
//   (2) convertToOrder atomically snapshots items + stamps the pointer, and
//   (3) edits to a non-draft quote are rejected.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { customerService, quoteLifecycleService, quoteService } from '../../src/services/index.js';
import {
  getPlatformBus,
  resetPlatformBusForTesting,
  type PlatformEvent,
} from '../../src/consumers/platform-bus.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('quote lifecycle', () => {
  let test: TestContext;
  let customerId: string;
  const platformEvents: PlatformEvent[] = [];

  beforeAll(async () => {
    test = await makeTestContext('owner');
    const bus = resetPlatformBusForTesting();
    bus.subscribe('order.created', (e) => {
      platformEvents.push(e);
      return Promise.resolve();
    });

    const customer = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'buyer@quotelifecycle.test',
      company: 'Quote Test Co',
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  beforeEach(() => {
    test.publisher.clear();
    platformEvents.length = 0;
  });

  it('create — drafts a quote with computed totals', async () => {
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [
        { sku: 'Q-A', name: 'Q item A', quantity: 2, unitPrice: 50, taxAmount: 8 },
        { sku: 'Q-B', name: 'Q item B', quantity: 1, unitPrice: 25 },
      ],
      shippingTotal: 5,
    });

    expect(quote.quoteNumber).toMatch(/^Q-\d{6}$/);
    expect(quote.status).toBe('draft');
    expect(Number(quote.subtotal)).toBe(125);
    expect(Number(quote.taxTotal)).toBe(8);
    expect(Number(quote.total)).toBe(138);
    expect(quote.items).toHaveLength(2);
  });

  it('lifecycle — submit → accept fires the CRM events', async () => {
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'L-1', name: 'Lifecycle item', quantity: 1, unitPrice: 100 }],
    });

    await quoteLifecycleService.submit(test.ctx, { quoteId: quote.id });
    const submitted = await quoteService.get(test.ctx, quote.id);
    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAt).not.toBeNull();

    await quoteLifecycleService.accept(test.ctx, { quoteId: quote.id });
    const accepted = await quoteService.get(test.ctx, quote.id);
    expect(accepted.status).toBe('accepted');

    const crmTopics = test.publisher.events.map((e) => e.topic);
    expect(crmTopics).toEqual(
      expect.arrayContaining(['crm.quote.submitted', 'crm.quote.accepted'])
    );
  });

  it('lifecycle — rejects skipping draft → accepted', async () => {
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'S-1', name: 'Skip', quantity: 1, unitPrice: 5 }],
    });
    await expect(quoteLifecycleService.accept(test.ctx, { quoteId: quote.id })).rejects.toThrow(
      /Cannot transition/
    );
  });

  it('edit non-draft — rejected outright', async () => {
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'E-1', name: 'Edit test', quantity: 1, unitPrice: 5 }],
    });
    await quoteLifecycleService.submit(test.ctx, { quoteId: quote.id });
    await expect(
      quoteService.update(test.ctx, quote.id, { customerNote: 'changed' })
    ).rejects.toThrow(/Cannot edit/);
  });

  it('convertToOrder — snapshots items + emits platform order.created', async () => {
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [
        { sku: 'CV-A', name: 'Convert A', quantity: 2, unitPrice: 100 },
        { sku: 'CV-B', name: 'Convert B', quantity: 1, unitPrice: 30 },
      ],
      shippingTotal: 10,
    });
    await quoteLifecycleService.submit(test.ctx, { quoteId: quote.id });
    await quoteLifecycleService.accept(test.ctx, { quoteId: quote.id });
    platformEvents.length = 0;

    const { quote: converted, order } = await quoteLifecycleService.convertToOrder(test.ctx, {
      quoteId: quote.id,
    });

    expect(converted.status).toBe('converted');
    expect(converted.convertedToOrderId).toBe(order.id);
    expect(converted.convertedAt).not.toBeNull();
    expect(order.orderNumber).toMatch(/^O-\d{6}$/);
    expect(order.status).toBe('placed');
    expect(Number(order.total)).toBe(240); // 230 subtotal + 10 ship

    await getPlatformBus().drain();
    const created = platformEvents.filter((e) => e.topic === 'order.created');
    expect(created).toHaveLength(1);

    // Idempotency — second convert call refuses. The status check fires
    // first (now 'converted'), which surfaces a clear validation error.
    await expect(
      quoteLifecycleService.convertToOrder(test.ctx, { quoteId: quote.id })
    ).rejects.toThrow(/must be accepted/);
  });

  it('addItem / removeItem — only allowed in draft, recomputes totals', async () => {
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'I-1', name: 'Item 1', quantity: 1, unitPrice: 10 }],
    });

    const added = await quoteService.addItem(test.ctx, {
      quoteId: quote.id,
      item: { sku: 'I-2', name: 'Item 2', quantity: 2, unitPrice: 5 },
    });
    expect(added.sku).toBe('I-2');

    const afterAdd = await quoteService.get(test.ctx, quote.id);
    expect(Number(afterAdd.subtotal)).toBe(20); // 10 + 10
    expect(afterAdd.items).toHaveLength(2);

    await quoteService.removeItem(test.ctx, { itemId: added.id });
    const afterRemove = await quoteService.get(test.ctx, quote.id);
    expect(Number(afterRemove.subtotal)).toBe(10);
    expect(afterRemove.items).toHaveLength(1);

    // After submission, further item mutations are rejected.
    await quoteLifecycleService.submit(test.ctx, { quoteId: quote.id });
    await expect(
      quoteService.addItem(test.ctx, {
        quoteId: quote.id,
        item: { sku: 'I-3', name: 'Item 3', quantity: 1, unitPrice: 1 },
      })
    ).rejects.toThrow(/non-draft/);
  });

  it('decline / expire — both reachable from submitted', async () => {
    const declined = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'D-1', name: 'Decline', quantity: 1, unitPrice: 1 }],
    });
    await quoteLifecycleService.submit(test.ctx, { quoteId: declined.id });
    await quoteLifecycleService.decline(test.ctx, {
      quoteId: declined.id,
      reason: 'budget',
    });
    const afterDecline = await quoteService.get(test.ctx, declined.id);
    expect(afterDecline.status).toBe('declined');
    expect(afterDecline.declinedReason).toBe('budget');

    const expired = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'X-1', name: 'Expire', quantity: 1, unitPrice: 1 }],
    });
    await quoteLifecycleService.submit(test.ctx, { quoteId: expired.id });
    await quoteLifecycleService.expire(test.ctx, { quoteId: expired.id });
    const afterExpire = await quoteService.get(test.ctx, expired.id);
    expect(afterExpire.status).toBe('expired');
  });
});
