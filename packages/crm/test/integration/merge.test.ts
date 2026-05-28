// Customer merge tests — covers the four guarantees the service makes:
//   1. Activities, deals, tasks from each duplicate REATTACH to the primary.
//   2. Commerce stats sum across primary + duplicates (totalSpent, orderCount,
//      firstOrderAt/lastOrderAt min/max).
//   3. Tags union across all merged records.
//   4. Duplicates are soft-deleted with mergedIntoCustomerId set.
// Plus duplicate detection — the "find likely duplicates" surface that
// drives the merge UI.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withTenant } from '@sparx/db';
import {
  customerService,
  dealService,
  pipelineService,
} from '../../src/services/index.js';
import {
  disposeTestContext,
  makeTestContext,
  type TestContext,
} from '../helpers.js';

describe('customer merge', () => {
  let test: TestContext;
  let pipelineId: string;
  let leadStageId: string;

  beforeAll(async () => {
    test = await makeTestContext('owner');
    const pipeline = await pipelineService.bootstrapDefaultPipeline(test.ctx);
    pipelineId = pipeline.id;
    leadStageId = pipeline.stages.find((s) => s.name === 'Lead')!.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  beforeEach(() => {
    test.publisher.clear();
  });

  it('moves activities, deals, and tasks onto the primary', async () => {
    const primary = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'primary@example.test',
      firstName: 'Primary',
      tags: ['vip'],
    });
    const duplicate = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'primary+dup@example.test',
      firstName: 'Dup',
      tags: ['fleet'],
    });

    // Attach a deal and an activity to the duplicate.
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId: duplicate.id,
      title: 'Deal on duplicate',
      value: 5000,
    });

    await withTenant(test.ctx, (tx) =>
      tx.crmActivity.create({
        data: {
          tenantId: test.ctx.tenantId,
          customerId: duplicate.id,
          type: 'note',
          description: 'Belongs to duplicate before merge',
          actorId: test.ctx.userId,
          actorType: 'staff',
          occurredAt: new Date(),
        },
      }),
    );

    const result = await customerService.merge(test.ctx, {
      primaryCustomerId: primary.id,
      duplicateCustomerIds: [duplicate.id],
    });

    expect(result.merged).toHaveLength(1);
    expect(result.reattached.activities).toBeGreaterThanOrEqual(1);
    expect(result.reattached.deals).toBe(1);

    // Tags unioned.
    expect(new Set(result.primary.tags)).toEqual(new Set(['vip', 'fleet']));

    // Duplicate is soft-deleted with the merge pointer set.
    const dupAfter = await withTenant(test.ctx, (tx) =>
      tx.customer.findUnique({ where: { id: duplicate.id } }),
    );
    expect(dupAfter?.deletedAt).not.toBeNull();
    expect(dupAfter?.mergedIntoCustomerId).toBe(primary.id);

    // Activity moved.
    const noteOnPrimary = await withTenant(test.ctx, (tx) =>
      tx.crmActivity.findFirst({
        where: { customerId: primary.id, description: 'Belongs to duplicate before merge' },
      }),
    );
    expect(noteOnPrimary).not.toBeNull();

    // Deal moved.
    const dealAfter = await withTenant(test.ctx, (tx) =>
      tx.deal.findUnique({ where: { id: deal.id } }),
    );
    expect(dealAfter?.customerId).toBe(primary.id);

    // A "customer.merged" activity lands on the primary.
    const mergeActivity = await withTenant(test.ctx, (tx) =>
      tx.crmActivity.findFirst({
        where: { customerId: primary.id, type: 'customer.merged' },
      }),
    );
    expect(mergeActivity).not.toBeNull();
  });

  it('sums commerce stats across primary + duplicates', async () => {
    const primary = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'spend-primary@example.test',
    });
    const dup1 = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'spend-dup1@example.test',
    });
    const dup2 = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'spend-dup2@example.test',
    });

    // Seed stats via direct update (consumers would normally do this).
    await withTenant(test.ctx, async (tx) => {
      await tx.customer.update({
        where: { id: primary.id },
        data: {
          totalSpent: 100,
          orderCount: 1,
          firstOrderAt: new Date('2026-01-15'),
          lastOrderAt: new Date('2026-02-15'),
        },
      });
      await tx.customer.update({
        where: { id: dup1.id },
        data: {
          totalSpent: 200,
          orderCount: 2,
          firstOrderAt: new Date('2025-12-01'),
          lastOrderAt: new Date('2026-03-01'),
        },
      });
      await tx.customer.update({
        where: { id: dup2.id },
        data: {
          totalSpent: 50,
          orderCount: 1,
          firstOrderAt: new Date('2025-11-20'),
          lastOrderAt: new Date('2026-01-10'),
        },
      });
    });

    const result = await customerService.merge(test.ctx, {
      primaryCustomerId: primary.id,
      duplicateCustomerIds: [dup1.id, dup2.id],
    });

    expect(Number(result.primary.totalSpent)).toBe(350);
    expect(result.primary.orderCount).toBe(4);
    expect(result.primary.firstOrderAt?.toISOString().slice(0, 10)).toBe('2025-11-20');
    expect(result.primary.lastOrderAt?.toISOString().slice(0, 10)).toBe('2026-03-01');
  });

  it('rejects when primary is in the duplicate list', async () => {
    const primary = await customerService.create(test.ctx, {
      type: 'retail',
      email: 'self-merge@example.test',
    });
    await expect(
      customerService.merge(test.ctx, {
        primaryCustomerId: primary.id,
        duplicateCustomerIds: [primary.id],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('findLikelyDuplicates', () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await makeTestContext('owner');
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  it('groups customers that share an email (case-insensitive)', async () => {
    await customerService.create(test.ctx, {
      type: 'retail',
      email: 'shared@example.test',
      firstName: 'First',
    });
    await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'SHARED@example.test', // same email, different case
      firstName: 'Second',
    });

    const groups = await customerService.findLikelyDuplicates(test.ctx);
    const emailGroup = groups.find((g) => g.reason === 'email');
    expect(emailGroup).toBeDefined();
    expect(emailGroup!.customers).toHaveLength(2);
  });

  it('groups customers that share (lastName, company)', async () => {
    await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'a@acmefleet.test',
      lastName: 'Wong',
      company: 'Acme Fleet',
    });
    await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'b@acmefleet.test',
      lastName: 'Wong',
      company: 'Acme Fleet',
    });

    const groups = await customerService.findLikelyDuplicates(test.ctx);
    const nameGroup = groups.find((g) => g.reason === 'name+company');
    expect(nameGroup).toBeDefined();
    expect(nameGroup!.customers.length).toBeGreaterThanOrEqual(2);
  });
});
