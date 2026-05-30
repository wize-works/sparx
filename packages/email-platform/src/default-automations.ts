// Default automations (PRD §4) — seeded per tenant on email-module activation.
//
// Each maps a platform business event → a transactional template, with a delay
// and an optional frequency cap. `canDisable: false` automations are essential
// (order confirmation, quotes) and stay on. `templateKey` references a built-in
// template; automations whose template component hasn't shipped yet are seeded
// (configurable) but only deliver once that template exists — the dispatch path
// logs + skips an unknown template.
//
// `triggerEvent` is the published topic the engine matches against. Publishers
// (commerce, CRM schedulers) must emit these exact strings.

export interface DefaultAutomation {
  key: string;
  name: string;
  description: string;
  triggerEvent: string;
  templateKey: string;
  /** 0 = immediate. */
  delaySeconds: number;
  /** null = no cap. */
  frequencyCapSeconds: number | null;
  canDisable: boolean;
  defaultEnabled: boolean;
}

const HOUR = 3600;
const DAY = 86400;

export const DEFAULT_AUTOMATIONS: readonly DefaultAutomation[] = [
  {
    key: 'order-confirmed',
    name: 'Order confirmed',
    description: 'Sent immediately after an order is paid.',
    triggerEvent: 'order.paid',
    templateKey: 'order-confirmed',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: false,
    defaultEnabled: true,
  },
  {
    key: 'order-shipped',
    name: 'Order shipped',
    description: 'Sent when a fulfillment ships, with tracking.',
    triggerEvent: 'order.fulfilled',
    templateKey: 'order-shipped',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: true,
    defaultEnabled: true,
  },
  {
    key: 'order-delivered',
    name: 'Order delivered',
    description: 'Sent when a shipment is delivered.',
    triggerEvent: 'order.delivered',
    templateKey: 'order-delivered',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: true,
    defaultEnabled: true,
  },
  {
    key: 'cart-abandoned',
    name: 'Abandoned cart',
    description: 'Nudge a shopper 2 hours after they leave a full cart.',
    triggerEvent: 'cart.abandoned',
    templateKey: 'cart-abandoned',
    delaySeconds: 2 * HOUR,
    frequencyCapSeconds: 7 * DAY,
    canDisable: true,
    defaultEnabled: true,
  },
  {
    key: 'win-back',
    name: 'Win-back',
    description: 'Re-engage a customer with no order in 90 days.',
    triggerEvent: 'crm.customer.inactive',
    templateKey: 'win-back',
    delaySeconds: 0,
    frequencyCapSeconds: 30 * DAY,
    canDisable: true,
    defaultEnabled: true,
  },
  {
    key: 'welcome-customer',
    name: 'Welcome',
    description: 'Greet a newly created customer.',
    triggerEvent: 'crm.customer.created',
    templateKey: 'welcome-customer',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: true,
    defaultEnabled: true,
  },
  {
    key: 'b2b-account-approved',
    name: 'B2B account approved',
    description: 'Notify a wholesale applicant their account is approved.',
    triggerEvent: 'crm.b2b.account.approved',
    templateKey: 'b2b-account-approved',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: false,
    defaultEnabled: true,
  },
  {
    key: 'quote-received',
    name: 'Quote received',
    description: 'Confirm a quote request was received.',
    triggerEvent: 'crm.quote.created',
    templateKey: 'quote-received',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: false,
    defaultEnabled: true,
  },
  {
    key: 'invoice-due',
    name: 'Invoice due',
    description: 'Remind a B2B customer 3 days before payment is due.',
    triggerEvent: 'crm.invoice.due',
    templateKey: 'invoice-due',
    delaySeconds: 0,
    frequencyCapSeconds: null,
    canDisable: true,
    defaultEnabled: true,
  },
  {
    key: 'invoice-overdue',
    name: 'Invoice overdue',
    description: 'Notify when an invoice is past due.',
    triggerEvent: 'crm.invoice.overdue',
    templateKey: 'invoice-overdue',
    delaySeconds: 0,
    frequencyCapSeconds: 3 * DAY,
    canDisable: true,
    defaultEnabled: true,
  },
] as const;

export function getDefaultAutomation(key: string): DefaultAutomation | undefined {
  return DEFAULT_AUTOMATIONS.find((a) => a.key === key);
}
