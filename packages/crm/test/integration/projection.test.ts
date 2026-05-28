// Customer projection — the layer segments and consumers reason about.
// Confirms the derived flags (hasOrdered / isHighValue / isInactive) line
// up with the underlying row state.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '@sparx/db';
import {
  buildCustomerProjection,
  customerService,
} from '../../src/index.js';
import {
  disposeTestContext,
  makeTestContext,
  type TestContext,
} from '../helpers.js';

describe('customer projection', () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await makeTestContext('owner');
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  it('a fresh prospect — no orders, not high value, not inactive', async () => {
    const c = await customerService.create(test.ctx, {
      type: 'prospect',
      email: 'fresh@example.test',
    });
    const p = await buildCustomerProjection(test.ctx, c.id);
    expect(p.hasOrdered).toBe(false);
    expect(p.isHighValue).toBe(false);
    expect(p.isInactive).toBe(false);
    expect(p.orderCount).toBe(0);
    expect(p.totalSpent).toBe(0);
    expect(p.daysSinceLastOrder).toBeNull();
  });

  it('a customer with spend >= 5000 is high value', async () => {
    const c = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'rich@example.test',
    });
    await withTenant(test.ctx, (tx) =>
      tx.customer.update({
        where: { id: c.id },
        data: { totalSpent: 7500, orderCount: 3, lastOrderAt: new Date(), firstOrderAt: new Date() },
      }),
    );

    const p = await buildCustomerProjection(test.ctx, c.id);
    expect(p.isHighValue).toBe(true);
    expect(p.hasOrdered).toBe(true);
  });

  it('a customer with last order 100 days ago is inactive', async () => {
    const c = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'sleeper@example.test',
    });
    const longAgo = new Date(Date.now() - 100 * 86_400_000);
    await withTenant(test.ctx, (tx) =>
      tx.customer.update({
        where: { id: c.id },
        data: {
          totalSpent: 200,
          orderCount: 1,
          firstOrderAt: longAgo,
          lastOrderAt: longAgo,
        },
      }),
    );

    const p = await buildCustomerProjection(test.ctx, c.id);
    expect(p.isInactive).toBe(true);
    expect(p.daysSinceLastOrder).toBeGreaterThanOrEqual(99);
  });

  it('throws NOT_FOUND for a missing customer', async () => {
    await expect(
      buildCustomerProjection(test.ctx, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', entityType: 'Customer' });
  });
});
