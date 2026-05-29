// Webhook fan-out — every publishCrmEvent() must enqueue one
// WebhookDelivery per matching active subscription.
//
//   1. A tenant with one subscription matching crm.deal.stage_changed
//      sees a delivery row land after a service-level moveStage call.
//   2. A tenant with no subscription sees zero deliveries (no orphans).
//   3. installCrmWebhookFanout is idempotent — a second call leaves
//      exactly one wrapper in place (no double-enqueue).

import crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withTenant } from '@sparx/db';

import * as customerService from '../../src/services/customer-service';
import * as pipelineService from '../../src/services/pipeline-service';
import * as dealService from '../../src/services/deal-service';
import {
  getPublisher,
  installCrmWebhookFanout,
  publishCrmEvent,
  RecordingPublisher,
  setPublisher,
} from '../../src/index.js';
import { createTestTenant, dropTestTenant, type TestTenant } from '../helpers.js';

describe('CRM webhook fan-out', () => {
  let tenant: TestTenant;
  let ctx: { tenantId: string; userId: string };

  beforeAll(async () => {
    tenant = await createTestTenant('owner');
    ctx = { tenantId: tenant.tenantId, userId: tenant.userId };
  });

  afterAll(async () => {
    await dropTestTenant(tenant.tenantId);
  });

  beforeEach(async () => {
    // Reset to a fresh RecordingPublisher so each test composes the wrapper
    // around a known inner. installCrmWebhookFanout wraps whatever is active.
    setPublisher(new RecordingPublisher());
    // Clear any prior deliveries / subscriptions so counts start from 0.
    await withTenant(ctx, async (tx) => {
      await tx.webhookDelivery.deleteMany({});
      await tx.webhookSubscription.deleteMany({});
    });
  });

  it('enqueues one delivery per matching active subscription', async () => {
    installCrmWebhookFanout();

    await withTenant(ctx, (tx) =>
      tx.webhookSubscription.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Stage moves',
          url: 'https://example.test/hook',
          events: ['crm.deal.stage_changed', 'crm.customer.created'],
          signingSecret: 'whsec_test',
          active: true,
        },
      })
    );
    // A subscription on an unrelated event should never receive deliveries.
    await withTenant(ctx, (tx) =>
      tx.webhookSubscription.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'Tasks only',
          url: 'https://example.test/tasks',
          events: ['crm.task.created'],
          signingSecret: 'whsec_test',
          active: true,
        },
      })
    );

    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: 'crm.deal.stage_changed',
      payload: { dealId: crypto.randomUUID(), from: 'a', to: 'b' },
    });

    const deliveries = await withTenant(ctx, (tx) =>
      tx.webhookDelivery.findMany({ where: { eventType: 'crm.deal.stage_changed' } })
    );
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]?.status).toBe('pending');
    const payload = deliveries[0]?.payload as { type: string; data: { dealId: string } };
    expect(payload.type).toBe('crm.deal.stage_changed');
    expect(payload.data.dealId).toBeDefined();
  });

  it('writes zero rows for tenants with no matching subscription', async () => {
    installCrmWebhookFanout();

    // No subscription at all.
    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: 'crm.customer.created',
      payload: { customerId: crypto.randomUUID() },
    });

    const count = await withTenant(ctx, (tx) =>
      tx.webhookDelivery.count({ where: { eventType: 'crm.customer.created' } })
    );
    expect(count).toBe(0);
  });

  it('install is idempotent — a second call does not double-wrap', () => {
    installCrmWebhookFanout();
    const first = getPublisher();
    installCrmWebhookFanout();
    const second = getPublisher();
    expect(first).toBe(second);
  });

  it('emits a delivery row when the service-level moveStage runs end-to-end', async () => {
    installCrmWebhookFanout();

    await withTenant(ctx, (tx) =>
      tx.webhookSubscription.create({
        data: {
          tenantId: ctx.tenantId,
          name: 'All deal events',
          url: 'https://example.test/deals',
          events: [
            'crm.deal.created',
            'crm.deal.updated',
            'crm.deal.stage_changed',
            'crm.deal.closed',
          ],
          signingSecret: 'whsec_test',
          active: true,
        },
      })
    );

    const pipeline = await pipelineService.bootstrapDefaultPipeline(ctx);
    const fromStage = pipeline.stages[0]!;
    const toStage = pipeline.stages[1]!;
    const customer = await customerService.create(ctx, {
      type: 'retail',
      email: `whfanout-${crypto.randomBytes(3).toString('hex')}@example.test`,
    });
    const deal = await dealService.create(ctx, {
      pipelineId: pipeline.id,
      stageId: fromStage.id,
      customerId: customer.id,
      title: 'Webhook fan-out fixture',
      value: 1000,
      currency: 'USD',
    });

    // Counts before the move so we isolate the move's delivery.
    const before = await withTenant(ctx, (tx) =>
      tx.webhookDelivery.count({ where: { eventType: 'crm.deal.stage_changed' } })
    );

    await dealService.moveStage(ctx, deal.id, { toStageId: toStage.id });

    const after = await withTenant(ctx, (tx) =>
      tx.webhookDelivery.findMany({
        where: { eventType: 'crm.deal.stage_changed' },
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(after.length).toBe(before + 1);
    const payload = after[0]?.payload as { data: { dealId: string; toStageId: string } };
    expect(payload.data.dealId).toBe(deal.id);
    expect(payload.data.toStageId).toBe(toStage.id);
  });
});
