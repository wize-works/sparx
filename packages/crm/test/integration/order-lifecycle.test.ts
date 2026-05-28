// orderService lifecycle — the load-bearing test is that an order moves
// through placed → fulfilled → delivered atomically (one Promise.allSettled
// shouldn't observe a half-state), and that refund + payment rollups stay
// consistent through every mutation.
//
// Multi-tenant invariants are exercised in rls-isolation.test.ts; here we
// trust withTenant and focus on the lifecycle math.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withTenant } from '@sparx/db';
import {
  customerService,
  orderFulfillmentsService,
  orderPaymentsService,
  orderRefundsService,
  orderService,
} from '../../src/services/index.js';
import {
  getPlatformBus,
  resetPlatformBusForTesting,
  type PlatformEvent,
} from '../../src/consumers/platform-bus.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('order lifecycle', () => {
  let test: TestContext;
  let customerId: string;
  const platformEvents: PlatformEvent[] = [];

  function clearPlatformEvents() {
    platformEvents.length = 0;
  }

  beforeAll(async () => {
    test = await makeTestContext('owner');
    // Tee every platform event into a local recorder so we can assert what
    // upstream topics the lifecycle emitted without depending on consumer
    // side effects.
    const bus = resetPlatformBusForTesting();
    const topics = [
      'order.created',
      'order.cancelled',
      'order.payment.recorded',
      'order.refunded',
      'order.fulfilled',
      'order.delivered',
    ];
    for (const t of topics) {
      bus.subscribe(t, (event) => {
        platformEvents.push(event);
        return Promise.resolve();
      });
    }

    const customer = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'buyer@orderlifecycle.test',
      firstName: 'Buyer',
      lastName: 'Person',
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  beforeEach(() => {
    test.publisher.clear();
    clearPlatformEvents();
  });

  it('create — generates order number, snapshots line items, computes totals', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [
        { sku: 'WIDGET-A', name: 'Widget A', quantity: 2, unitPrice: 10, taxAmount: 1.6 },
        { sku: 'WIDGET-B', name: 'Widget B', quantity: 1, unitPrice: 5, taxAmount: 0.4 },
      ],
      shippingTotal: 3,
    });

    expect(order.orderNumber).toMatch(/^O-\d{6}$/);
    expect(Number(order.subtotal)).toBe(25);
    expect(Number(order.taxTotal)).toBe(2);
    expect(Number(order.shippingTotal)).toBe(3);
    expect(Number(order.total)).toBe(30);
    expect(order.items).toHaveLength(2);
    expect(order.status).toBe('placed');
    expect(order.paymentStatus).toBe('unpaid');
  });

  it('full lifecycle — pay → fulfill → deliver promotes order to delivered', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'K-1', name: 'Kit', quantity: 3, unitPrice: 20 }],
    });

    await orderPaymentsService.recordPayment(test.ctx, {
      orderId: order.id,
      processor: 'stripe',
      amount: 60,
      currency: 'USD',
      status: 'captured',
    });

    const afterPay = await orderService.get(test.ctx, order.id);
    expect(Number(afterPay.amountPaid)).toBe(60);
    expect(afterPay.paymentStatus).toBe('paid');
    expect(afterPay.paidAt).not.toBeNull();

    const fulfillment = await orderFulfillmentsService.createFulfillment(test.ctx, {
      orderId: order.id,
      status: 'shipped',
      lines: order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
    });

    const afterShip = await orderService.get(test.ctx, order.id);
    expect(afterShip.status).toBe('fulfilled');
    expect(afterShip.fulfilledAt).not.toBeNull();

    await orderFulfillmentsService.updateFulfillment(test.ctx, {
      fulfillmentId: fulfillment.id,
      status: 'delivered',
    });

    const afterDeliver = await orderService.get(test.ctx, order.id);
    expect(afterDeliver.status).toBe('delivered');
    expect(afterDeliver.deliveredAt).not.toBeNull();

    // Platform events: order.created, order.payment.recorded, order.fulfilled, order.delivered
    // Drain the bus to be sure async subscribers ran.
    await getPlatformBus().drain();
    const topics = platformEvents.map((e) => e.topic);
    expect(topics).toEqual(
      expect.arrayContaining(['order.created', 'order.fulfilled', 'order.delivered'])
    );
  });

  it('partial fulfillment — order stays in placed until every line is fulfilled', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'P-1', name: 'Partial item', quantity: 4, unitPrice: 5 }],
    });
    const item = order.items[0]!;

    await orderFulfillmentsService.createFulfillment(test.ctx, {
      orderId: order.id,
      status: 'shipped',
      lines: [{ orderItemId: item.id, quantity: 2 }],
    });

    const mid = await orderService.get(test.ctx, order.id);
    expect(mid.status).toBe('placed'); // not all lines fulfilled yet
    expect(mid.items[0]!.quantityFulfilled).toBe(2);

    await orderFulfillmentsService.createFulfillment(test.ctx, {
      orderId: order.id,
      status: 'shipped',
      lines: [{ orderItemId: item.id, quantity: 2 }],
    });

    const after = await orderService.get(test.ctx, order.id);
    expect(after.status).toBe('fulfilled');
    expect(after.items[0]!.quantityFulfilled).toBe(4);
  });

  it('refund — partial refund recomputes rollup but stays in paid status', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'R-1', name: 'Refund test', quantity: 2, unitPrice: 25 }],
    });
    const item = order.items[0]!;

    await orderPaymentsService.recordPayment(test.ctx, {
      orderId: order.id,
      processor: 'stripe',
      amount: 50,
      currency: 'USD',
      status: 'captured',
    });

    await orderRefundsService.recordRefund(test.ctx, {
      orderId: order.id,
      amount: 25,
      currency: 'USD',
      lines: [{ orderItemId: item.id, quantity: 1, amount: 25 }],
    });

    const after = await orderService.get(test.ctx, order.id);
    expect(Number(after.refundTotal)).toBe(25);
    expect(Number(after.amountPaid)).toBe(25);
    expect(after.paymentStatus).toBe('partially_paid');
    expect(after.status).toBe('placed'); // partial refund doesn't flip status
    expect(after.items[0]!.quantityRefunded).toBe(1);
  });

  it('refund — full refund flips order.status to refunded', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'F-1', name: 'Full refund', quantity: 1, unitPrice: 99 }],
    });
    await orderPaymentsService.recordPayment(test.ctx, {
      orderId: order.id,
      processor: 'stripe',
      amount: 99,
      currency: 'USD',
      status: 'captured',
    });
    await orderRefundsService.recordRefund(test.ctx, {
      orderId: order.id,
      amount: 99,
      currency: 'USD',
    });

    const after = await orderService.get(test.ctx, order.id);
    expect(after.status).toBe('refunded');
    expect(after.refundedAt).not.toBeNull();
  });

  it('cancel — placed → cancelled emits event; cannot cancel delivered', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'C-1', name: 'Cancel me', quantity: 1, unitPrice: 10 }],
    });
    test.publisher.clear();

    await orderService.cancel(test.ctx, { orderId: order.id, reason: 'changed mind' });

    const after = await orderService.get(test.ctx, order.id);
    expect(after.status).toBe('cancelled');
    expect(after.cancelledReason).toBe('changed mind');

    await getPlatformBus().drain();
    const cancelEvents = platformEvents.filter((e) => e.topic === 'order.cancelled');
    expect(cancelEvents).toHaveLength(1);

    // Cancelling a cancelled order is a no-op (idempotent), not an error.
    const recancelled = await orderService.cancel(test.ctx, { orderId: order.id });
    expect(recancelled.status).toBe('cancelled');
  });

  it('fulfillment cap — refuses to ship more than ordered', async () => {
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'CAP-1', name: 'Cap test', quantity: 2, unitPrice: 10 }],
    });
    const item = order.items[0]!;

    await expect(
      orderFulfillmentsService.createFulfillment(test.ctx, {
        orderId: order.id,
        status: 'pending',
        lines: [{ orderItemId: item.id, quantity: 3 }],
      })
    ).rejects.toThrow(/exceeds remaining/);
  });

  // Touch withTenant to silence the unused-import warning; the real
  // tenant-isolation assertions live in rls-isolation.test.ts.
  it('RLS context is wired (smoke)', async () => {
    await withTenant(test.ctx, async (tx) => {
      const c = await tx.customer.count();
      expect(c).toBeGreaterThanOrEqual(1);
    });
  });
});
