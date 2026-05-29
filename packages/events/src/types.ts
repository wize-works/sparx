// Event type registry — central list of every Pub/Sub event Sparx publishes.
// Topic name == event type (per-topic + for_each Terraform pattern), so a
// publisher with a typed `EventType` cannot accidentally publish to a topic
// that hasn't been provisioned.
//
// Adding a new event:
//   1. Add the literal to `EventType` here.
//   2. Add the topic + subscribers in terraform/envs/prod/main.tf.
//   3. terraform apply.
//   4. Define a payload interface in the consumer-side worker (and import
//      it back here only if multiple publishers share the same payload).

export type EventType =
  // Content
  | 'content.entry.created'
  | 'content.entry.updated'
  | 'content.entry.published'
  | 'content.entry.scheduled'
  | 'content.entry.unpublished'
  | 'content.entry.deleted'
  | 'content.revision.created'
  | 'content_type.upserted'
  // Media
  | 'media.uploaded'
  | 'media.processed'
  | 'media.deleted'
  // Email
  | 'email.send'
  | 'email.domain.verified'
  // Webhooks / redirects
  | 'redirect.added'
  | 'redirect.removed'
  // ─── Commerce ───────────────────────────────────────────────────────
  // Catalog
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'variant.created'
  | 'variant.updated'
  | 'variant.deleted'
  // Inventory
  | 'inventory.adjusted'
  | 'inventory.low'
  | 'inventory.depleted'
  // Cart + checkout
  | 'cart.created'
  | 'cart.updated'
  | 'cart.abandoned'
  | 'cart.recovered'
  | 'checkout.started'
  | 'checkout.completed'
  | 'checkout.expired'
  // Orders (Commerce-side fan-out; CRM still owns the row)
  | 'order.placed'
  | 'order.paid'
  | 'order.fulfilled'
  | 'order.delivered'
  | 'order.cancelled'
  | 'order.refunded'
  | 'order.payment_failed'
  // Subscriptions
  | 'subscription.created'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.cancelled'
  // Returns / RMA
  | 'return.requested'
  | 'return.approved'
  | 'return.received'
  | 'return.refunded'
  // Reviews + Q&A
  | 'review.submitted'
  | 'review.published'
  | 'review.flagged'
  // Provider marketplace
  | 'provider.installed'
  | 'provider.uninstalled'
  | 'provider.health_changed'
  // Gift cards + store credit
  | 'giftcard.issued'
  | 'giftcard.redeemed'
  | 'storecredit.granted'
  | 'storecredit.spent'
  // Configurator
  | 'configuration.requested'
  | 'configuration.quoted'
  | 'configuration.accepted';

export interface SparxEvent<T = unknown> {
  type: EventType;
  tenantId: string;
  actorId: string | null;
  /** ISO timestamp. */
  occurredAt: string;
  data: T;
}

// ────────────────────────────────────────────────────────────────────────
// Per-event payload contracts
//
// Payloads live here only when multiple publishers emit the same event
// (e.g. both api-rest and the dashboard publish email.send). Otherwise
// keep them inline in the publisher to avoid premature coupling.
// ────────────────────────────────────────────────────────────────────────

/**
 * Payload for `email.send`. Template-based — the worker resolves the
 * template id against @sparx/email's registry and renders before relay.
 *
 * `to` MUST be the recipient's verified address; the worker does no
 * enrichment lookup. For "send to userId" semantics, resolve at the
 * publish site.
 */
export interface EmailSendPayload {
  to: string;
  cc?: string;
  bcc?: string;
  /** Must match a registered template id in @sparx/email's TemplateSend. */
  template: 'password-reset' | 'welcome-merchant';
  /** Shape is enforced by @sparx/email's TemplateSend.props on render. */
  props: Record<string, unknown>;
  /** Optional From override; defaults to SPARX_EMAIL_FROM env in worker. */
  from?: string;
  replyTo?: string;
  /** Optional header bag (X-Tenant-Id, List-Unsubscribe, etc.). */
  headers?: Record<string, string>;
}
