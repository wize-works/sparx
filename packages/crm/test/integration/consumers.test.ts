// Consumer integration tests.
//
// The Phase 2 consumers subscribe to platform events (order.*, email.*,
// quote.*, user.*) and translate them into CrmActivity rows + denormalized
// customer stats. Tests here:
//
//   1. Publish a synthetic order.created → confirm the activity row, the
//      bumped total_spent/order_count, and the first_order_at/last_order_at
//      timestamps.
//   2. Publish a refund → confirm total_spent decrements.
//   3. Publish a duplicate event with the same id → confirm the dedupe layer
//      skips reprocessing (no double-counting).
//   4. Publish an event for a tenant where CRM is DISABLED → confirm zero
//      rows land and zero stats change. This is the locked-decision #6
//      guarantee.
//   5. Publish an email.unsubscribed → confirm do_not_contact flips.
//   6. Publish a user.login keyed by authUserId → confirm the activity lands
//      on the correct customer via the FK lookup.

import crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma, withTenant } from '@sparx/db';
import { invalidateModuleCache } from '@sparx/auth';
import {
  customerService,
  registerCrmConsumers,
  resetDedupeForTesting,
  resetPlatformBusForTesting,
  type PlatformEventBus,
} from '../../src/index.js';
import {
  createTestTenant,
  dropTestTenant,
  type TestTenant,
} from '../helpers.js';

describe('CRM consumers', () => {
  let bus: PlatformEventBus;
  let teardown: () => void;
  let alice: TestTenant;
  let aliceCtx: { tenantId: string; userId: string };
  let aliceCustomerId: string;
  let aliceCustomerAuthId: string;

  beforeAll(async () => {
    bus = resetPlatformBusForTesting();
    resetDedupeForTesting();
    const registration = registerCrmConsumers({ bus });
    teardown = registration.unregister;

    alice = await createTestTenant('owner');
    aliceCtx = { tenantId: alice.tenantId, userId: alice.userId };

    // One customer to receive everything. Set authUserId so the auth-event
    // consumer can find them by FK.
    aliceCustomerAuthId = crypto.randomUUID();
    const created = await customerService.create(aliceCtx, {
      type: 'retail',
      email: 'kira@example.test',
      firstName: 'Kira',
    });
    aliceCustomerId = created.id;
    // Set authUserId via a tenant-scoped raw update — service-layer create
    // doesn't expose it on the Zod schema (the field is internal to the
    // customer↔auth link).
    await withTenant(aliceCtx, async (tx) => {
      await tx.customer.update({
        where: { id: created.id },
        data: { authUserId: aliceCustomerAuthId },
      });
    });
  });

  afterAll(async () => {
    teardown();
    await dropTestTenant(alice.tenantId);
  });

  beforeEach(() => {
    resetDedupeForTesting();
  });

  it('order.created → activity row + total_spent/order_count bump', async () => {
    const eventId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const placedAt = new Date();

    await bus.publish({
      id: eventId,
      topic: 'order.created',
      tenantId: alice.tenantId,
      occurredAt: placedAt,
      payload: {
        orderId,
        customerId: aliceCustomerId,
        total: 250,
        currency: 'USD',
        placedAt: placedAt.toISOString(),
      },
    });
    await bus.drain();

    const customer = await customerService.get(aliceCtx, aliceCustomerId);
    expect(Number(customer.totalSpent)).toBe(250);
    expect(customer.orderCount).toBe(1);
    expect(customer.firstOrderAt).not.toBeNull();
    expect(customer.lastOrderAt).not.toBeNull();

    const activities = await withTenant(aliceCtx, (tx) =>
      tx.crmActivity.findMany({
        where: { customerId: aliceCustomerId, type: 'order.placed' },
      }),
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]?.linkedEntityId).toBe(orderId);
  });

  it('duplicate event id is deduped — no double counting', async () => {
    const eventId = crypto.randomUUID();
    const placedAt = new Date();

    const before = await customerService.get(aliceCtx, aliceCustomerId);
    const beforeSpent = Number(before.totalSpent);

    const event = {
      id: eventId,
      topic: 'order.created',
      tenantId: alice.tenantId,
      occurredAt: placedAt,
      payload: {
        orderId: crypto.randomUUID(),
        customerId: aliceCustomerId,
        total: 100,
        currency: 'USD',
        placedAt: placedAt.toISOString(),
      },
    };

    await bus.publish(event);
    await bus.publish(event); // same id — should be skipped
    await bus.drain();

    const after = await customerService.get(aliceCtx, aliceCustomerId);
    expect(Number(after.totalSpent)).toBe(beforeSpent + 100);
    expect(after.orderCount).toBe(before.orderCount + 1);
  });

  it('order.refunded decrements total_spent', async () => {
    const before = await customerService.get(aliceCtx, aliceCustomerId);
    const beforeSpent = Number(before.totalSpent);

    await bus.publish({
      id: crypto.randomUUID(),
      topic: 'order.refunded',
      tenantId: alice.tenantId,
      occurredAt: new Date(),
      payload: {
        orderId: crypto.randomUUID(),
        customerId: aliceCustomerId,
        refundAmount: 50,
        currency: 'USD',
      },
    });
    await bus.drain();

    const after = await customerService.get(aliceCtx, aliceCustomerId);
    expect(Number(after.totalSpent)).toBe(beforeSpent - 50);

    const refund = await withTenant(aliceCtx, (tx) =>
      tx.crmActivity.findFirst({
        where: { customerId: aliceCustomerId, type: 'order.refunded' },
      }),
    );
    expect(refund).not.toBeNull();
  });

  it('email.unsubscribed flips do_not_contact', async () => {
    await bus.publish({
      id: crypto.randomUUID(),
      topic: 'email.unsubscribed',
      tenantId: alice.tenantId,
      occurredAt: new Date(),
      payload: {
        customerId: aliceCustomerId,
        messageId: crypto.randomUUID(),
      },
    });
    await bus.drain();

    const after = await customerService.get(aliceCtx, aliceCustomerId);
    expect(after.doNotContact).toBe(true);

    const activity = await withTenant(aliceCtx, (tx) =>
      tx.crmActivity.findFirst({
        where: { customerId: aliceCustomerId, type: 'email.unsubscribed' },
      }),
    );
    expect(activity).not.toBeNull();
  });

  it('user.login resolves to the customer via authUserId FK', async () => {
    await bus.publish({
      id: crypto.randomUUID(),
      topic: 'user.login',
      tenantId: alice.tenantId,
      occurredAt: new Date(),
      payload: {
        authUserId: aliceCustomerAuthId,
        ipAddress: '203.0.113.7',
      },
    });
    await bus.drain();

    const activity = await withTenant(aliceCtx, (tx) =>
      tx.crmActivity.findFirst({
        where: { customerId: aliceCustomerId, type: 'login' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(activity).not.toBeNull();
    const metadata = activity!.metadata as Record<string, unknown>;
    expect(metadata.ipAddress).toBe('203.0.113.7');
  });

  it('zero side effects for a CRM-disabled tenant (locked decision #6)', async () => {
    // Make a separate tenant without enabling the CRM module.
    const disabledSlug = `crm-disabled-${crypto.randomBytes(4).toString('hex')}`;
    const disabled = await prisma.tenant.create({
      data: {
        slug: disabledSlug,
        name: `Disabled ${disabledSlug}`,
        email: `${disabledSlug}@sparx.test`,
        plan: 'starter',
        status: 'active',
        settings: {}, // no modules block → CRM disabled
      },
    });
    invalidateModuleCache(disabled.id, 'crm');

    // Need a customer-shaped row to target. RLS would let us insert one
    // anyway because the test bypasses module-gate at the service layer —
    // the gate is what's under test. Insert via raw to bypass the service.
    const fakeCustomerId = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${disabled.id}'`);
      await tx.customer.create({
        data: {
          id: fakeCustomerId,
          tenantId: disabled.id,
          type: 'retail',
          email: 'ignored@example.test',
        },
      });
    });

    await bus.publish({
      id: crypto.randomUUID(),
      topic: 'order.created',
      tenantId: disabled.id,
      occurredAt: new Date(),
      payload: {
        orderId: crypto.randomUUID(),
        customerId: fakeCustomerId,
        total: 999,
        currency: 'USD',
        placedAt: new Date().toISOString(),
      },
    });
    await bus.drain();

    // No activity recorded, no stats moved.
    const activities = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${disabled.id}'`);
      return tx.crmActivity.findMany({ where: { customerId: fakeCustomerId } });
    });
    expect(activities).toHaveLength(0);

    const customer = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${disabled.id}'`);
      return tx.customer.findUniqueOrThrow({ where: { id: fakeCustomerId } });
    });
    expect(Number(customer.totalSpent)).toBe(0);
    expect(customer.orderCount).toBe(0);

    await dropTestTenant(disabled.id);
    invalidateModuleCache(disabled.id, 'crm');
  });
});
