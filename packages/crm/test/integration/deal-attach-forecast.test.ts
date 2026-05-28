// dealService — attach/detach + forecast math.
//
// Locked decision #5: deals attach to orders/quotes via join tables, never
// via columns on orders/quotes. attachOrder writes deal_orders + emits the
// matching event; detachOrder deletes the join row. Orders themselves are
// never mutated.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  customerService,
  dealService,
  orderService,
  pipelineService,
  quoteService,
} from '../../src/services/index.js';
import { resetPlatformBusForTesting } from '../../src/consumers/platform-bus.js';
import { CrmConflictError, CrmNotFoundError } from '../../src/errors.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('deal attach + forecast', () => {
  let test: TestContext;
  let pipelineId: string;
  let leadStageId: string;
  let qualifiedStageId: string;
  let wonStageId: string;
  let customerId: string;

  beforeAll(async () => {
    test = await makeTestContext('owner');
    resetPlatformBusForTesting();

    const pipeline = await pipelineService.bootstrapDefaultPipeline(test.ctx);
    pipelineId = pipeline.id;
    leadStageId = pipeline.stages.find((s) => s.name === 'Lead')!.id;
    qualifiedStageId = pipeline.stages.find((s) => s.name === 'Qualified')!.id;
    wonStageId = pipeline.stages.find((s) => s.name === 'Closed Won')!.id;

    const customer = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'buyer@dealattach.test',
      company: 'Attach Test',
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  beforeEach(() => {
    test.publisher.clear();
  });

  it('attachOrder — writes deal_orders without mutating the order', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Attach test deal',
      value: 1_000,
    });
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'A-1', name: 'Attach 1', quantity: 1, unitPrice: 100 }],
    });
    const orderBefore = await orderService.get(test.ctx, order.id);

    const link = await dealService.attachOrder(test.ctx, {
      dealId: deal.id,
      orderId: order.id,
    });
    expect(link.dealId).toBe(deal.id);
    expect(link.orderId).toBe(order.id);

    // The order row itself is unchanged.
    const orderAfter = await orderService.get(test.ctx, order.id);
    expect(orderAfter.updatedAt.getTime()).toBe(orderBefore.updatedAt.getTime());

    const attached = await dealService.listAttachedOrders(test.ctx, deal.id);
    expect(attached.map((o) => o.id)).toEqual([order.id]);

    expect(test.publisher.events.map((e) => e.topic)).toContain('crm.deal.order_attached');
  });

  it('attachOrder — re-attaching the same pair throws conflict', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Conflict deal',
      value: 100,
    });
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'C-1', name: 'Conflict', quantity: 1, unitPrice: 1 }],
    });
    await dealService.attachOrder(test.ctx, { dealId: deal.id, orderId: order.id });

    await expect(
      dealService.attachOrder(test.ctx, { dealId: deal.id, orderId: order.id })
    ).rejects.toBeInstanceOf(CrmConflictError);
  });

  it('detachOrder — idempotent; missing pair is a no-op, not an error', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Detach deal',
      value: 100,
    });
    const order = await orderService.create(test.ctx, {
      customerId,
      items: [{ sku: 'D-1', name: 'Detach', quantity: 1, unitPrice: 1 }],
    });
    await dealService.attachOrder(test.ctx, { dealId: deal.id, orderId: order.id });

    await dealService.detachOrder(test.ctx, { dealId: deal.id, orderId: order.id });
    const after = await dealService.listAttachedOrders(test.ctx, deal.id);
    expect(after).toHaveLength(0);

    // Detaching again — no exception thrown.
    await dealService.detachOrder(test.ctx, { dealId: deal.id, orderId: order.id });
  });

  it('attach unknown order — throws NotFound', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Missing order',
      value: 1,
    });
    await expect(
      dealService.attachOrder(test.ctx, {
        dealId: deal.id,
        orderId: '00000000-0000-0000-0000-000000000000',
      })
    ).rejects.toBeInstanceOf(CrmNotFoundError);
  });

  it('attachQuote / listAttachedQuotes — symmetrical to orders', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Quote-attached deal',
      value: 1,
    });
    const quote = await quoteService.create(test.ctx, {
      customerId,
      items: [{ sku: 'Q-1', name: 'Quote item', quantity: 1, unitPrice: 1 }],
    });

    await dealService.attachQuote(test.ctx, { dealId: deal.id, quoteId: quote.id });
    const attached = await dealService.listAttachedQuotes(test.ctx, deal.id);
    expect(attached.map((q) => q.id)).toEqual([quote.id]);
  });

  it('forecast — sums weighted open value across months', async () => {
    // Window: next 6 months starting today's month. Place an open deal in
    // each of two distinct months and a closed-won deal as well, then assert
    // the bucket math.
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15));

    const open = await dealService.create(test.ctx, {
      pipelineId,
      stageId: qualifiedStageId,
      customerId,
      title: 'Open weighted',
      value: 10_000,
      probability: 50,
      expectedCloseDate: thisMonth.toISOString().slice(0, 10),
    });
    expect(open.id).toBeTruthy();

    const futureOpen = await dealService.create(test.ctx, {
      pipelineId,
      stageId: qualifiedStageId,
      customerId,
      title: 'Future weighted',
      value: 5_000,
      probability: 40,
      expectedCloseDate: nextMonth.toISOString(),
    });
    expect(futureOpen.id).toBeTruthy();

    const wonDeal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: qualifiedStageId,
      customerId,
      title: 'Closed-won',
      value: 8_000,
      probability: 100,
      expectedCloseDate: thisMonth.toISOString().slice(0, 10),
    });
    await dealService.moveStage(test.ctx, wonDeal.id, { toStageId: wonStageId });

    const result = await dealService.forecast(test.ctx, { pipelineId });

    const thisKey = monthKey(thisMonth);
    const nextKey = monthKey(nextMonth);
    const thisBucket = result.buckets.find((b) => b.month === thisKey);
    const nextBucket = result.buckets.find((b) => b.month === nextKey);

    expect(thisBucket).toBeDefined();
    expect(nextBucket).toBeDefined();

    // openValue includes any other deals from earlier tests that happen to
    // fall in the same window; assert that *at least* the weighted values
    // we created contribute.
    expect(thisBucket!.openValue).toBeGreaterThanOrEqual(5_000); // 10k × 50%
    expect(thisBucket!.closedWonValue).toBeGreaterThanOrEqual(8_000);
    expect(nextBucket!.openValue).toBeGreaterThanOrEqual(2_000); // 5k × 40%
    expect(result.totalWeighted).toBeGreaterThan(0);
  });
});

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}
