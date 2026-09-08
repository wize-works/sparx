// The shapes the event catalogue is written in.
//
// Keys are wire values the server validates against (`EVENT_KEYS` in
// api-rest's webhooks/subscriptions route). We never invent one: an off-list
// key is refused by the create and patch schemas.

export type WebhookEventKey =
  | 'content.entry.created'
  | 'content.entry.updated'
  | 'content.entry.published'
  | 'content.entry.scheduled'
  | 'content.entry.unpublished'
  | 'content.entry.deleted'
  | 'media.uploaded'
  | 'media.processed'
  | 'form.submitted'
  | 'redirect.added'
  | 'redirect.changed'
  | 'redirect.removed'
  | 'order.paid'
  | 'payment.captured'
  | 'payment.failed'
  // `inventory.levels.updated` is absent on purpose: it exists in the event
  // registry and nothing publishes it, so a subscription to it would sit silent
  // and read as a broken endpoint.
  | 'inventory.adjusted'
  | 'inventory.low'
  | 'inventory.depleted'
  | 'inventory.count.completed'
  | 'inventory.reconciliation.drift'
  | 'inventory.oversell.blocked'
  | 'inventory.classification.changed'
  | 'inventory.lot.expiring'
  | 'inventory.bin.moved'
  | 'inventory.pick_list.created'
  | 'inventory.pick_list.completed'
  | 'inventory.pick.short'
  | 'inventory.package.packed'
  | 'inventory.transfer.shipped'
  | 'inventory.transfer.received'
  | 'inventory.assembly.completed'
  | 'inventory.purchase_order.late'
  | 'inventory.backorder.created'
  | 'inventory.backorder.allocated'
  | 'inventory.source.created'
  | 'inventory.source.sync_started'
  | 'inventory.source.sync_completed'
  | 'inventory.source.error'
  | 'inventory.source.stale'
  | 'inventory.source.recovered';

export type WebhookEventGroup =
  'Selling' | 'Content' | 'Files' | 'Redirects' | 'Stock' | 'Warehouse' | 'Supply' | 'Stock feeds';

export interface WebhookEventDef {
  key: WebhookEventKey;
  label: string;
  description: string;
  group: WebhookEventGroup;
}
