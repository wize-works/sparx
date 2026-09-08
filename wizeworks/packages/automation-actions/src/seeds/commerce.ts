// Commerce system-automation seeds (docs/90 §3b). The Managed defaults that ship on
// Commerce activation. Three no-email defaults — two internal staff alerts (the
// PLATFORM-level `email.send_internal`, no email-module gate, so a commerce-only
// tenant still gets them) + a CRM note — plus two email-sending defaults
// (abandoned-cart, post-purchase-review) that reference a provisioned Builder-email
// by `key`; the `module: 'email'` gate holds those sends until email is active.

import type { SystemAutomationSpec } from '@wizeworks/automation';

/** Alert staff when a high-value order is paid. The $500 default is the ADR's
 *  `highValueThreshold ?? 500`; the alert goes to the tenant's notify address (the
 *  owner) by default. Edit the threshold or add a `to`/`toField` on the action. */
export const COMMERCE_HIGH_VALUE_ORDER_ALERT: SystemAutomationSpec = {
  name: 'High-value order alert',
  description: 'Emails staff when an order of $500 or more is paid.',
  trigger: { kind: 'event', eventType: 'order.paid' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'order.total', operator: 'gte', value: 500 }],
  },
  actions: [
    {
      type: 'email.send_internal',
      config: { subject: 'High-value order — {{order.number}} · ${{order.total}}' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Alert staff when a variant drops to/under its low-stock threshold (the
 *  `inventory.low` event already carries the on-hand level). */
export const COMMERCE_LOW_INVENTORY_ALERT: SystemAutomationSpec = {
  name: 'Low inventory alert',
  description: 'Emails staff when a product variant runs low on stock.',
  trigger: { kind: 'event', eventType: 'inventory.low' },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_internal',
      config: { subject: 'Low inventory — {{product.title}} · {{inventory.quantity}} remaining' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Tell staff when a shopper asks to send something back.
 *
 *  Ships on because the request is worthless unless somebody hears it. Storefront
 *  self-service means a return now arrives without an email attached to it, so
 *  without this the whole thing lands silently in a screen nobody has a reason to
 *  open — which is the same shape as a cart being marked abandoned with nothing
 *  subscribed to it. `email.send_internal` is PLATFORM-level, so a commerce-only
 *  tenant with no email module still gets it. */
export const COMMERCE_RETURN_REQUESTED_ALERT: SystemAutomationSpec = {
  name: 'Return requested — staff alert',
  description: 'Emails staff when a customer asks to send something back.',
  trigger: { kind: 'event', eventType: 'return.requested' },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_internal',
      config: {
        subject: 'Return requested — {{order.number}} · wants a {{return.preferredOutcome}}',
      },
    },
  ],
  locked: false,
  status: 'active',
};

/** Log a CRM note on the customer when a refund is issued, so the account timeline
 *  reflects it without a human re-entering it. */
export const COMMERCE_REFUND_CRM_NOTE: SystemAutomationSpec = {
  name: 'Refund issued — CRM note',
  description: 'Adds a note to the customer’s CRM timeline when an order is refunded.',
  trigger: { kind: 'event', eventType: 'order.refunded' },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'crm.add_note',
      config: { note: 'Refund issued — {{order.number}} · ${{order.refundTotal}}' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Nudge a shopper who left items in their cart. An INTERVAL scan over the `cart`
 *  scanner (which already returns carts cold >30 min, still holding items, with an
 *  emailable customer, and never recovered) — once-per-entity dedupe means one
 *  nudge per cart. The 2-hour delay lets a distracted shopper return on their own
 *  first (docs/90 — `wait(2h)`). Marketing. */
export const COMMERCE_ABANDONED_CART_NUDGE: SystemAutomationSpec = {
  name: 'Abandoned cart nudge',
  description:
    'Emails a shopper once their cart has been sitting long enough to count as abandoned — the wait is the one you set in Selling settings.',
  trigger: {
    kind: 'schedule',
    schedule: { cadence: 'interval', everyMinutes: 15 },
    predicate: {
      entity: 'cart',
      where: {
        logic: 'AND',
        conditions: [{ field: 'customer.email', operator: 'is_set' }],
      },
    },
  },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_campaign',
      // No delay: the shop owner has already said how long a quiet cart should
      // wait, in the one field that says so, and the scanner now fires off that
      // mark. A delay here would silently add to her number — it used to add 2h
      // to a hardcoded 30 minutes, so a shop set to 15 nudged at 2.5 hours.
      config: { builderEmailKey: 'abandoned-cart', emailType: 'marketing', delaySeconds: 0 },
    },
  ],
  locked: false,
  status: 'active',
};

/** The order-lifecycle transactional emails (docs/implementation/transactional-email
 *  §4 P1). Each fires on its matching `order.*` event (all of them are ORDER_EVENTS
 *  in the trigger resolver, so `customer.email` + the `order` refs resolve) and sends
 *  a provisioned Builder email by key. Transactional, so a marketing unsubscribe
 *  never withholds them; the `is_set` guard skips a guest order with no emailable
 *  address.
 *
 *  THE CONFIRMATION COMES FIRST, and for a long time it was the one that did not
 *  exist. The later ones were written as "the counterparts to order-confirmation
 *  that were missing" — on the reasonable assumption that the confirmation itself
 *  was already handled somewhere. It was not. The `order-confirmation` Builder
 *  email was provisioned, published and live on every shop, and NOTHING sent it:
 *  no automation seed named it, no tenant automation triggered on `order.placed`
 *  (zero rows, platform-wide), and `checkout-service.complete()` sends no mail.
 *
 *  So a shopper bought something and heard nothing back. No order number, no
 *  receipt, no confirmation that the money or the order had registered — and on a
 *  pay-later shop, which is what a shop with no payment provider is, that silence
 *  is the entire handover. Later mails told her the order was delivered, cancelled
 *  or refunded; none told her it had been placed. */
export const COMMERCE_ORDER_CONFIRMATION_EMAIL: SystemAutomationSpec = {
  name: 'Order confirmation — email',
  description: 'Emails the customer their order confirmation as soon as the order is placed.',
  trigger: { kind: 'event', eventType: 'order.placed' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'customer.email', operator: 'is_set' }],
  },
  actions: [
    {
      type: 'email.send_campaign',
      // No delay. A confirmation that arrives later than the shopper's own doubt
      // is not a confirmation.
      config: { builderEmailKey: 'order-confirmation', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** The same silence, one step later in the order's life. `shipping-confirmation`
 *  was provisioned and published on every shop and nothing sent it either: the
 *  only listener on `order.fulfilled` was the review request, which waits three
 *  days and then asks the customer how they liked a parcel nobody ever told them
 *  was coming. Sends the moment the goods leave, so the tracking number reaches
 *  the customer before the parcel does.
 *
 *  NOT ON A COLLECTION. A customer walking out of the shop with their order is
 *  recorded as a fulfillment carried by `pickup`, and it publishes
 *  `order.fulfilled` exactly like a despatch — deliberately, so the activity feed
 *  and the review request see the sale complete. But "Your order is on its way —
 *  track your package" is plainly false to somebody already holding it, so the
 *  carrier is checked. `order.delivered` fires for a collection too, and the
 *  delivered notice is the one that belongs there. */
export const COMMERCE_SHIPPING_CONFIRMATION_EMAIL: SystemAutomationSpec = {
  name: 'Shipping confirmation — email',
  description: 'Emails the customer their tracking details as soon as an order ships.',
  trigger: { kind: 'event', eventType: 'order.fulfilled' },
  conditions: {
    logic: 'AND',
    conditions: [
      { field: 'customer.email', operator: 'is_set' },
      { field: 'fulfillment.carrier', operator: 'neq', value: 'pickup' },
    ],
  },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'shipping-confirmation', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

export const COMMERCE_ORDER_DELIVERED_EMAIL: SystemAutomationSpec = {
  name: 'Order delivered — email',
  description: 'Emails the customer when their order is marked delivered.',
  trigger: { kind: 'event', eventType: 'order.delivered' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'customer.email', operator: 'is_set' }],
  },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'order-delivered', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

export const COMMERCE_ORDER_CANCELLED_EMAIL: SystemAutomationSpec = {
  name: 'Order cancelled — email',
  description: 'Emails the customer when their order is cancelled.',
  trigger: { kind: 'event', eventType: 'order.cancelled' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'customer.email', operator: 'is_set' }],
  },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'order-cancelled', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

export const COMMERCE_ORDER_REFUNDED_EMAIL: SystemAutomationSpec = {
  name: 'Order refunded — email',
  description: 'Emails the customer when a refund is issued for their order.',
  trigger: { kind: 'event', eventType: 'order.refunded' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'customer.email', operator: 'is_set' }],
  },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'order-refunded', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

export const COMMERCE_PAYMENT_FAILED_EMAIL: SystemAutomationSpec = {
  name: 'Payment failed — email',
  description: 'Emails the customer when their order payment fails, so they can retry.',
  trigger: { kind: 'event', eventType: 'order.payment_failed' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'customer.email', operator: 'is_set' }],
  },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'payment-failed', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Ask for a review a few days after an order is fulfilled. Event-driven off
 *  `order.fulfilled`; the 3-day delay gives the order time to arrive before the
 *  ask (docs/90 — `wait(3d)`). Marketing. */
export const COMMERCE_POST_PURCHASE_REVIEW: SystemAutomationSpec = {
  name: 'Post-purchase review request',
  description: 'Emails the customer three days after their order ships, asking for a review.',
  trigger: { kind: 'event', eventType: 'order.fulfilled' },
  conditions: {
    logic: 'AND',
    conditions: [{ field: 'customer.email', operator: 'is_set' }],
  },
  actions: [
    {
      type: 'email.send_campaign',
      config: {
        builderEmailKey: 'post-purchase-review',
        emailType: 'marketing',
        delaySeconds: 259_200, // 3 days
      },
    },
  ],
  locked: false,
  status: 'active',
};
