// CRM webhook fan-out.
//
// Each CRM event published via publishCrmEvent should also enqueue
// WebhookDelivery rows for every matching WebhookSubscription. This
// wrapping publisher does the enqueue inside a tenant-scoped transaction,
// then delegates to the inner publisher (typically the LoggingPublisher
// or a real Pub/Sub backed one).
//
// Reuses the same WebhookSubscription / WebhookDelivery tables CMS uses
// — the topic namespace just expands to include 'crm.*'. The api-rest
// background tick (services/api-rest/src/lib/webhook-delivery.ts)
// dispatches both CMS and CRM deliveries equivalently.

import { prisma, withTenant } from '@sparx/db';

import type { CrmEvent, Publisher } from './events';

/** Publisher that enqueues a WebhookDelivery row per matching
 *  WebhookSubscription before delegating to the inner publisher. */
export class WebhookFanoutPublisher implements Publisher {
  constructor(private readonly inner: Publisher) {}

  async publish(event: CrmEvent): Promise<void> {
    // Best-effort enqueue — a failure here must not block the inner
    // publish, since the originating service tx has already committed.
    try {
      await withTenant({ tenantId: event.tenantId }, async (tx) => {
        const subscriptions = await tx.webhookSubscription.findMany({
          where: {
            tenantId: event.tenantId,
            active: true,
            events: { has: event.topic },
          },
          select: { id: true },
        });
        if (subscriptions.length === 0) return;

        await tx.webhookDelivery.createMany({
          data: subscriptions.map((s) => ({
            tenantId: event.tenantId,
            subscriptionId: s.id,
            eventType: event.topic,
            payload: {
              type: event.topic,
              tenantId: event.tenantId,
              occurredAt: (event.occurredAt ?? new Date()).toISOString(),
              data: event.payload,
            },
            status: 'pending',
            attemptCount: 0,
            nextAttemptAt: new Date(),
          })),
        });
      });
    } catch (err) {
      console.error('[crm-webhook-fanout]', event.topic, err);
    }

    await this.inner.publish(event);
  }
}

/** Convenience — pre-warms a connection to prisma so the first webhook
 *  enqueue isn't paying connection-startup cost. */
export async function preconnectWebhookFanout(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
