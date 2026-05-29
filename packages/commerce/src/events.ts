// Commerce Pub/Sub event publisher.
//
// Mirrors @sparx/auth's `publishAuthEmail` pattern: each service emits
// via this thin wrapper rather than calling @sparx/events directly so
// the package can attach an audit-log write and a consistent logger in
// one place. The actual transport is @sparx/events, which talks to
// Google Pub/Sub in prod and a noop-with-logging publisher in dev/test.

import { createPublisher, publishEvent, type EventType, type PublisherLogger } from '@sparx/events';

const logger: PublisherLogger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', src: 'commerce', ...obj, msg })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', src: 'commerce', ...obj, msg })),
  error: (obj, msg) =>
    console.error(JSON.stringify({ level: 'error', src: 'commerce', ...obj, msg })),
};

// Subset of EventType the Commerce module actually publishes. Narrowing
// here means a typo in a topic surfaces at compile time. Adding a new
// commerce event requires (1) extending EventType in @sparx/events and
// (2) listing it here.
export type CommerceTopic = Extract<
  EventType,
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'variant.created'
  | 'variant.updated'
  | 'variant.deleted'
  | 'inventory.adjusted'
  | 'inventory.low'
  | 'inventory.depleted'
  | 'cart.created'
  | 'cart.updated'
  | 'cart.abandoned'
  | 'cart.recovered'
  | 'checkout.started'
  | 'checkout.completed'
  | 'checkout.expired'
  | 'order.placed'
  | 'order.paid'
  | 'order.fulfilled'
  | 'order.delivered'
  | 'order.cancelled'
  | 'order.refunded'
  | 'order.payment_failed'
  | 'subscription.created'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.cancelled'
  | 'return.requested'
  | 'return.approved'
  | 'return.received'
  | 'return.refunded'
  | 'review.submitted'
  | 'review.published'
  | 'review.flagged'
  | 'provider.installed'
  | 'provider.uninstalled'
  | 'provider.health_changed'
  | 'giftcard.issued'
  | 'giftcard.redeemed'
  | 'storecredit.granted'
  | 'storecredit.spent'
  | 'configuration.requested'
  | 'configuration.quoted'
  | 'configuration.accepted'
>;

export interface CommerceEventInput<T = Record<string, unknown>> {
  tenantId: string;
  actorId?: string | null;
  topic: CommerceTopic;
  data: T;
}

/**
 * Publish a Commerce event to the platform bus. Always called AFTER a
 * DB transaction commits — never inside one. A rolled-back write must
 * never emit a phantom event.
 */
export async function publishCommerceEvent<T>(input: CommerceEventInput<T>): Promise<void> {
  const publisher = createPublisher({
    projectId: process.env.GCP_PROJECT_ID,
    logger,
  });
  await publishEvent(
    publisher,
    input.topic,
    input.tenantId,
    input.actorId ?? null,
    input.data,
    logger
  );
}
