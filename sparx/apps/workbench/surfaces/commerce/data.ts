'use client';

// Orders data — a sale, everything that happened to it, and the one move you can
// make on it.
//
// This file OWNS the order types and the ['commerce','orders'] query key. Two
// definitions of the same row is how a list ends up reading a field the other
// one never fetched.
//
// Two things shape it beyond a normal data module.
//
// FIRST: every money column on an Order is a Prisma Decimal, and Decimal
// serializes to JSON as a STRING — "409.44", not 409.44. `Number()` at render
// time is not enough: "9.00" < "100.00" is TRUE as a string comparison, so
// anything that compares or sums raw wire values is quietly wrong. Coercion
// happens once, here, at the fetch boundary.
//
// SECOND: an order's state is genuinely two questions — has it been paid for,
// and has it been sent — and the platform stores them as two independent
// columns. So there are two state helpers, not one status enum, and the surfaces
// show both. Collapsing them loses the exact case an operator cares about most:
// paid but not yet shipped.

// Carrier words come from the schema package, not a local map. There were three
// of those and they had drifted: this console said "Sent by the supplier" where
// the shopper's own order page said "Drop-ship", and the customer's email said
// "usps". One list, so a new carrier is named once.
import { carrierLabel } from '@wizeworks/commerce-schemas';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { paymentMethodLabels } from '../../lib/payment-methods';
import { apiErrorMessage } from '../../lib/api-error';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** How the buyer is joined onto both list rows and a single order — enough to
 *  name them without a lookup per row. */
export interface OrderCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** The employer they typed — not the linked company record below. */
  companyName: string | null;
  email: string | null;
  companyId: string | null;
  company: {
    id: string;
    companyName: string;
    paymentTerms: string | null;
    status: string;
  } | null;
}

/** An address exactly as it was at the moment of the sale. Frozen on the order,
 *  so editing the customer's address later never rewrites where this one went. */
export interface OrderAddress {
  recipientName?: string;
  company?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  taxAmount: number;
  discountAmount: number;
  lineTotal: number;
  quantityFulfilled: number;
  quantityRefunded: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  propertyId: string | null;
  customerId: string;
  customer: OrderCustomer | null;

  status: string; // placed | fulfilled | delivered | cancelled | refunded
  paymentStatus: string; // unpaid | partially_paid | paid | refunded
  channel: string | null;
  source: string | null;

  subtotal: number;
  taxTotal: number;
  shippingTotal: number;
  discountTotal: number;
  surchargeTotal: number;
  total: number;
  amountPaid: number;
  refundTotal: number;
  currency: string;

  shippingAddress: OrderAddress | null;
  billingAddress: OrderAddress | null;

  placedAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  refundedAt: string | null;

  customerNote: string | null;
  internalNote: string | null;

  /** Everything checkout froze onto the order that has no column of its own --
   *  which is where HOW THE ORDER LEAVES lives (`shippingRateRef`,
   *  `shippingProviderSlug`, `shippingDescription`). Read it through
   *  `deliveryPlan()`; nothing else should be poking at raw keys. */
  metadata?: Record<string, unknown> | null;

  /** Only on a single order — the list route does not join items. */
  items?: OrderItem[];
}

export interface OrderPayment {
  id: string;
  processor: string;
  processorRef: string | null;
  amount: number;
  currency: string;
  status: string; // pending | authorized | captured | failed | voided | refunded
  failureReason: string | null;
  authorizedAt: string | null;
  capturedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface OrderFulfillment {
  id: string;
  status: string; // pending | shipped | delivered | failed | cancelled
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface OrderRefund {
  id: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string; // pending | completed | failed
  refundedAt: string | null;
  createdAt: string;
}

/* ── Wire coercion ──────────────────────────────────────────────────────── */

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItem(raw: OrderItem): OrderItem {
  return {
    ...raw,
    quantity: num(raw.quantity),
    unitPrice: num(raw.unitPrice),
    lineSubtotal: num(raw.lineSubtotal),
    taxAmount: num(raw.taxAmount),
    discountAmount: num(raw.discountAmount),
    lineTotal: num(raw.lineTotal),
    quantityFulfilled: num(raw.quantityFulfilled),
    quantityRefunded: num(raw.quantityRefunded),
  };
}

export function normalizeOrder(raw: Order): Order {
  return {
    ...raw,
    subtotal: num(raw.subtotal),
    taxTotal: num(raw.taxTotal),
    shippingTotal: num(raw.shippingTotal),
    discountTotal: num(raw.discountTotal),
    surchargeTotal: num(raw.surchargeTotal),
    total: num(raw.total),
    amountPaid: num(raw.amountPaid),
    refundTotal: num(raw.refundTotal),
    ...(raw.items ? { items: raw.items.map(normalizeItem) } : {}),
  };
}

/* ── Queries ────────────────────────────────────────────────────────────── */

export const ORDERS_KEY = ['commerce', 'orders'];

/** Server-side sort. The list is paged, and a browser-side sort of the loaded
 *  window sorts ONE page and presents it as the answer — "biggest order" would
 *  hand back the biggest order on page 3. */
export type OrderSortKey = 'placedAt' | 'total';
export type SortDirection = 'asc' | 'desc';

export interface OrderQuery {
  q?: string;
  status?: string;
  paymentStatus?: string;
  /** Scope the list to one customer — the customer's-side lens on Selling. The
   *  endpoint (`GET /v1/orders?customer_id=`) is the join; there is no separate
   *  per-customer orders route. */
  customerId?: string;
  sortBy: OrderSortKey;
  order: SortDirection;
  take: number;
  skip: number;
}

export function useOrders(query: OrderQuery) {
  return useQuery({
    queryKey: [...ORDERS_KEY, query],
    queryFn: () =>
      api
        .list<Order>('/v1/orders', {
          ...(query.q ? { q: query.q } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.paymentStatus ? { payment_status: query.paymentStatus } : {}),
          ...(query.customerId ? { customer_id: query.customerId } : {}),
          sort_by: query.sortBy,
          order: query.order,
          take: query.take,
          skip: query.skip,
        })
        .then((result) => ({
          items: result.items.map(normalizeOrder),
          total: result.total,
        })),
    // Keeps the current window on screen while the next one loads, so paging and
    // re-sorting don't blink the table out to an empty state and back.
    placeholderData: (previous) => previous,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, id],
    queryFn: () => api.get<Order>(`/v1/orders/${id}`).then(normalizeOrder),
  });
}

/**
 * What happened to the money, and what happened to the goods.
 *
 * Three separate endpoints rather than one fat order payload, because that is
 * how api-rest models them — payments, fulfillments and refunds are real
 * subresources with their own writes. They are fetched in parallel and each
 * failure is independent: a fulfillment service having a bad day must not blank
 * out the payment history on the same screen.
 */
export function useOrderPayments(id: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, id, 'payments'],
    queryFn: () =>
      api
        .get<OrderPayment[]>(`/v1/orders/${id}/payments`)
        .then((rows) => rows.map((row) => ({ ...row, amount: num(row.amount) }))),
  });
}

export function useOrderFulfillments(id: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, id, 'fulfillments'],
    queryFn: () => api.get<OrderFulfillment[]>(`/v1/orders/${id}/fulfillments`),
  });
}

export function useOrderRefunds(id: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, id, 'refunds'],
    queryFn: () =>
      api
        .get<OrderRefund[]>(`/v1/orders/${id}/refunds`)
        .then((rows) => rows.map((row) => ({ ...row, amount: num(row.amount) }))),
  });
}

/**
 * Record money the business took ITSELF — cash over the counter, a cheque, a
 * bank transfer.
 *
 * ── WHY THIS WAS MISSING AND WHY THAT MATTERED ──────────────────────────────
 *
 * `POST /v1/orders/:id/payments` has always existed. The order pane READ it —
 * the "Money in" card lists every payment and says "No payment has been
 * recorded against this order yet" when there are none — and offered no way to
 * add one. So the sentence was true and permanent.
 *
 * That is not a missing nicety. The provider picker offers **Manual payments**
 * and describes it, in its own words, as "you mark each order paid yourself".
 * A business that took that offer could place orders and never mark one paid.
 * A collection-only bakery, whose entire model is money at the counter, had a
 * shop that could take an order and no way to ever finish it.
 *
 * `processor: 'manual'` is the honest record: nothing was charged through a
 * gateway, somebody was handed money. `status: 'captured'` because it is not a
 * pending authorisation — it has already happened.
 */
export function useRecordOrderPayment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      amount: number;
      currency: string;
      processor: string;
      reference?: string;
    }) =>
      api.post<OrderPayment>(`/v1/orders/${id}/payments`, {
        amount: input.amount,
        currency: input.currency,
        processor: input.processor,
        status: 'captured',
        capturedAt: new Date().toISOString(),
        ...(input.reference?.trim() ? { processorRef: input.reference.trim() } : {}),
      }),
    onSuccess: () => {
      // The order's own payment_status and amount_paid move with this, so the
      // order itself is refetched, not just its payments list.
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Writing down that the goods went.
 *
 * ── WHY THIS WAS MISSING, AND WHY THAT MATTERED ─────────────────────────────
 *
 * `POST /v1/orders/:id/fulfillments` has always existed and nothing in either
 * console called it. The order pane READ the list and said "Nothing has been
 * sent for this order yet" -- true, and permanently true.
 *
 * The pane's one fulfilment-shaped action was **Send it to the warehouse**,
 * which generates a picking walk. That is not this. A walk tells somebody what
 * to go and fetch; it marks nothing as gone, and a business without a warehouse
 * -- a bakery with a counter, a studio that posts from the desk -- has no use
 * for one. So every order any of them ever took stayed open forever, and the
 * order status never left `placed`.
 *
 * ── ONE OUTCOME, TWO EVENTS ─────────────────────────────────────────────────
 *
 * Handing something over and posting something are different facts and the
 * record has to keep them apart, because the customer's question differs:
 *   collected -> `delivered`. It is over. There is nothing to follow.
 *   posted    -> `shipped`. It is in transit, and a tracking number is the
 *                point of the record.
 * `carrier: 'pickup'` is the API's existing word for the first, so this invents
 * no vocabulary.
 */
export function useRecordFulfillment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status: 'shipped' | 'delivered';
      lines: { orderItemId: string; quantity: number }[];
      carrier?: string;
      service?: string;
      trackingNumber?: string;
      notes?: string;
    }) =>
      api.post<OrderFulfillment>(`/v1/orders/${id}/fulfillments`, {
        status: input.status,
        lines: input.lines,
        ...(input.carrier ? { carrier: input.carrier } : {}),
        ...(input.service ? { service: input.service } : {}),
        ...(input.trackingNumber?.trim() ? { trackingNumber: input.trackingNumber.trim() } : {}),
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      }),
    onSuccess: () => {
      // The order's own status, fulfilledAt and per-item quantityFulfilled all
      // move with this, so the whole order is refetched rather than the list.
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Putting a tracking number on a parcel that already went.
 *
 * The other half of the gap `useRecordFulfillment` above describes. `PATCH
 * /v1/orders/:id/fulfillments/:fulfillmentId` has always existed and, like the
 * POST before it, nothing in either console called it — so the moment a shipment
 * was recorded its details were frozen forever.
 *
 * That is not an edge case for a shop that posts its own parcels. The tracking
 * number is optional at the counter and usually not known yet: the goods are
 * boxed and marked sent, and the number comes back from the post office
 * afterwards. There was nowhere to put it. The customer had already been emailed
 * "your order is on its way" with no way to follow it, and no later mail would
 * ever carry one.
 */
export function useUpdateTracking(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fulfillmentId,
      trackingNumber,
    }: {
      fulfillmentId: string;
      trackingNumber: string;
    }) =>
      api.patch<OrderFulfillment>(`/v1/orders/${id}/fulfillments/${fulfillmentId}`, {
        // Empty clears it. `null` is what the schema takes for "there is no
        // number", and it is a real answer — a number typed by mistake should be
        // removable, not merely replaceable.
        trackingNumber: trackingNumber.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/** The rate ref checkout writes when a shopper chooses to come and get it.
 *  Mirrors COLLECTION_RATE_REF in @wizeworks/commerce (collection-option.ts);
 *  copied rather than imported because that package is server-side and would
 *  drag Prisma into the browser bundle. */
const COLLECTION_RATE_REF = 'collection:in-person';

export interface DeliveryPlan {
  /** True when the customer is coming to fetch it -- so there is nothing to
   *  post, no carrier to name, and no warehouse walk that makes sense. */
  collected: boolean;
  /** What the shopper chose, in their words. Null when the order predates
   *  checkout recording it, which is NOT the same as "collection" -- an old
   *  order with no record must not be presented as one or the other. */
  description: string | null;
}

/**
 * How this order leaves, according to what the shopper picked at checkout.
 *
 * Reads the metadata checkout froze on. `collected` is deliberately keyed on
 * the RATE REF rather than the absence of a shipping address: a collection
 * order still carries an address (it is the billing address, and the shop may
 * well want it), so "no address" would call every one of them a despatch.
 */
export function deliveryPlan(order: Order): DeliveryPlan {
  const meta = order.metadata ?? {};
  const ref = typeof meta.shippingRateRef === 'string' ? meta.shippingRateRef : null;
  const described =
    typeof meta.shippingDescription === 'string' && meta.shippingDescription.trim()
      ? meta.shippingDescription.trim()
      : null;
  return { collected: ref === COLLECTION_RATE_REF, description: described };
}

/** The server refuses to cancel a delivered or refunded order with a sentence
 *  saying so — which is worth showing verbatim rather than replacing with a
 *  guess. */
export function useCancelOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      api.post<Order>(`/v1/orders/${id}/cancel`, reason ? { reason } : {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * Refund money already taken for an order. The server settles this through the
 * tenant's payment gateway and THEN records it (see api-rest lib/order-refund.ts), so
 * a success here means the money really moved — and a 4xx carries the gateway's own
 * reason, which `orderErrorMessage` surfaces verbatim.
 */
export function useRefundOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; reason?: string }) =>
      api.post(`/v1/orders/${id}/refunds`, {
        amount: input.amount,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/**
 * The server's own sentence for a 4xx. These routes explain the actual problem
 * ("Cannot cancel an order in status \"delivered\"") far better than anything
 * this side could infer from a status code. A 5xx has no such sentence, so it
 * falls back to the caller's wording.
 */
export function orderErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/* ── Saying what a state means ──────────────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Has it been sent? In the words an owner would use.
 *
 * The stored values are `placed | fulfilled | delivered | cancelled | refunded`,
 * which is a developer's vocabulary — "fulfilled" in particular reads as
 * "finished" to everyone who has not worked in commerce, when it means the
 * opposite: it has just left the building.
 */
export function shippingState(order: Order): { label: string; tone: Tone; detail: string } {
  // Nobody delivered anything to a customer who walked in and took it. Same
  // column, same stored status, different fact — and this is the one place both
  // the list and the order pane read it from, so correcting it here corrects it
  // everywhere rather than in the two call sites that happened to notice.
  const collected = deliveryPlan(order).collected;
  switch (order.status) {
    case 'delivered':
      return {
        label: collected ? 'Collected' : 'Delivered',
        tone: 'success',
        detail: collected ? 'The customer picked this up.' : 'This order reached the customer.',
      };
    case 'fulfilled':
      return {
        label: 'On the way',
        tone: 'info',
        detail: 'This order has been sent and is with the carrier.',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        tone: 'danger',
        detail: order.cancelledReason
          ? `This order was cancelled: ${order.cancelledReason}`
          : 'This order was cancelled and nothing more will be sent.',
      };
    case 'refunded':
      return {
        label: 'Refunded',
        tone: 'neutral',
        detail: 'The customer has had their money back on this order.',
      };
    default:
      return {
        label: collected ? 'To collect' : 'To send',
        tone: 'warning',
        detail: collected
          ? 'The customer has not picked this up yet.'
          : 'Nothing has been sent to the customer yet.',
      };
  }
}

/** Has it been paid for? Money truth is its own axis — an order can be paid and
 *  unsent, or sent and unpaid, and both are situations someone acts on. */
export function paymentState(order: Order): { label: string; tone: Tone; detail: string } {
  switch (order.paymentStatus) {
    case 'paid':
      return { label: 'Paid', tone: 'success', detail: 'Paid in full.' };
    case 'partially_paid':
      return {
        label: 'Part paid',
        tone: 'info',
        detail: 'Some of this order has been paid for, and some is still owed.',
      };
    case 'refunded':
      return { label: 'Refunded', tone: 'neutral', detail: 'This money has been given back.' };
    default:
      return { label: 'Not paid', tone: 'warning', detail: 'No money has come in for this order.' };
  }
}

export function paymentRecordTone(status: string): Tone {
  switch (status) {
    case 'captured':
      return 'success';
    case 'authorized':
      return 'info';
    case 'failed':
      return 'danger';
    case 'voided':
    case 'refunded':
      return 'neutral';
    default:
      return 'warning'; // pending
  }
}

export function fulfillmentTone(status: string): Tone {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'shipped':
      return 'info';
    case 'failed':
      return 'danger';
    case 'cancelled':
      return 'neutral';
    default:
      return 'warning'; // pending
  }
}

export function refundTone(status: string): Tone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    default:
      return 'warning';
  }
}

/** Plain-word labels for a payment record's own status, which uses card-industry
 *  words nobody outside payments has met. */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  authorized: 'Held, not taken',
  captured: 'Taken',
  failed: 'Failed',
  voided: 'Cancelled',
  refunded: 'Given back',
};

/**
 * How the money arrived, in the words a business uses.
 *
 * The pane printed `payment.processor` raw, so a cash sale read "$33.00 ·
 * manual" — a column value on a screen about somebody handing over notes. Same
 * reasoning as PAYMENT_STATUS_LABELS above: "captured" means "taken", and a
 * payment processor's vocabulary is not the shopkeeper's.
 *
 * `manual` is the API's name for "the business took it themselves", and by far
 * its commonest form is cash — but not its only one, so a recorded cheque or
 * transfer keeps its own name.
 *
 * The words themselves now live in lib/payment-methods, because four panes
 * named this same column and disagreed on how to spell a cheque. This list is
 * only which processors the commerce panes expect to see.
 */
export const PAYMENT_PROCESSOR_LABELS: Record<string, string> = paymentMethodLabels([
  'manual',
  'check',
  'ach',
  'wire',
  'net_terms',
  'stripe',
  'paypal',
  'gift_card',
]);

/** True when the money never went through a gateway, so there is nothing to
 *  send it back to. Drives the refund wording, which used to promise every
 *  refund went "back to the card it was paid with" — including a cash sale. */
export function paidByHand(processor: string): boolean {
  // `gift_card` counts: nothing here credits a card automatically, so putting
  // the money back is an adjustment somebody makes on the card by hand.
  return ['manual', 'check', 'wire', 'gift_card'].includes(processor);
}

export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Being packed',
  shipped: 'On the way',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  cancelled: 'Cancelled',
};

/**
 * The one line at the top of a shipment row.
 *
 * A collection is not a delivery by a carrier called "pickup", so it does not
 * render as one. `service` already holds the words the shopper chose ("Collect
 * in person"), which reads whole on its own — the same reason `describeRate`
 * does not prefix the carrier onto it.
 */
export function shipmentHeadline(shipment: OrderFulfillment): string {
  if (shipment.carrier === 'pickup') return shipment.service ?? 'Collected in person';
  const carrier = carrierLabel(shipment.carrier);
  const service = shipment.service ?? '';
  // A carrier's own service names usually START with the carrier, so joining
  // both produced "USPS · USPS Ground Advantage Economy". When the service
  // already says who is carrying it, it says it once.
  if (carrier && service.toLowerCase().startsWith(carrier.toLowerCase())) return service;
  return [carrier, service].filter(Boolean).join(' · ') || 'Delivery';
}

/** "Delivered" is right for something a courier brought and wrong for something
 *  the customer walked in and took. Same row, same column, different fact. */
export function shipmentStatusLabel(shipment: OrderFulfillment): string {
  if (shipment.carrier === 'pickup' && shipment.status === 'delivered') return 'Collected';
  return FULFILLMENT_STATUS_LABELS[shipment.status] ?? shipment.status;
}

export const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: 'In progress',
  completed: 'Given back',
  failed: 'Failed',
};

/** How the sale came in. Defined here rather than imported from crm-schemas:
 *  the workbench is built free-standing, and these are the words a business
 *  owner uses, not the stored slugs. */
export const CHANNEL_LABELS: Record<string, string> = {
  storefront: 'Your website',
  b2b_portal: 'Trade portal',
  admin: 'Entered by your team',
  import: 'Imported',
  mcp: 'AI assistant',
  marketplace: 'Marketplace',
};

export const MARKETPLACE_SOURCE_LABELS: Record<string, string> = {
  tiktok_shop: 'TikTok Shop',
  etsy: 'Etsy',
  amazon: 'Amazon',
  walmart: 'Walmart',
  ebay: 'eBay',
  faire: 'Faire',
  meta: 'Facebook & Instagram',
  sparx_market: 'sparx.market',
};

/** Where an order came from, in one phrase. A marketplace order names the actual
 *  marketplace — "Marketplace" alone tells a seller nothing they can act on. */
export function channelLabel(order: Order): string {
  if (order.channel === 'marketplace' && order.source) {
    return MARKETPLACE_SOURCE_LABELS[order.source] ?? order.source;
  }
  if (order.channel) return CHANNEL_LABELS[order.channel] ?? order.channel;
  return 'Unknown';
}

/** The buyer in one line: a company if they trade as one, otherwise their name,
 *  otherwise their email. Never an empty cell — an order always has a buyer. */
export function customerName(customer: OrderCustomer | null): string {
  if (!customer) return 'Unknown customer';
  const person = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  if (customer.companyName) return customer.companyName;
  if (person) return person;
  return customer.email ?? 'Unknown customer';
}

/**
 * What is still collectable on this order.
 *
 * `total − amountPaid` alone is wrong at both ends of an order's life. A
 * refunded order has had its money handed back, and a cancelled one is never
 * going to be paid — both would otherwise report the FULL total as outstanding
 * and put a "still owed" banner on a sale nobody should be chasing. Observed on
 * a real refunded order, which read "Still owed $421.28" under a Refunded badge.
 */
export function amountDue(order: Order): number {
  if (order.status === 'cancelled' || order.status === 'refunded') return 0;
  if (order.paymentStatus === 'refunded') return 0;
  return Math.max(0, order.total - order.amountPaid - order.refundTotal);
}

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A frozen address as a list of lines, blanks dropped. Rendering the fields
 *  individually leaves gaps where an optional one is missing. */
export function addressLines(address: OrderAddress | null): string[] {
  if (!address) return [];
  const region = [address.city, address.region, address.postalCode].filter(Boolean).join(', ');
  return [
    address.recipientName,
    address.company,
    address.line1,
    address.line2,
    region,
    address.country,
    address.phone,
  ].filter((line): line is string => Boolean(line?.trim()));
}

/** One invoice raised for an order, as the order pane shows it. */
export interface OrderInvoice {
  id: string;
  number: string | null;
  status: string;
  total: number;
  amountPaid: number;
  balance: number;
  currency: string;
  dueAt: string | null;
  createdAt: string;
  /** When the invoice was actually emailed, and where to. Null while it has only
   *  been raised — making an invoice and sending it are two different acts. */
  sentAt: string | null;
  sentTo: string | null;
}

/**
 * The invoices raised to ask for the money on this order.
 *
 * Empty is the ordinary answer for a shop that takes card at checkout — nobody
 * needs to be asked. It is the shops that take NO payment at checkout for which
 * this is the whole second half of the sale.
 */
export function useOrderInvoices(id: string) {
  return useQuery({
    queryKey: [...ORDERS_KEY, id, 'invoices'],
    queryFn: () =>
      api.get<OrderInvoice[]>(`/v1/orders/${id}/invoices`).then((rows) =>
        rows.map((row) => ({
          ...row,
          total: num(row.total),
          amountPaid: num(row.amountPaid),
          balance: num(row.balance),
        }))
      ),
  });
}

/**
 * Raising the invoice that asks for the money on this order.
 *
 * The order is copied onto it — every line, the delivery charge, the addresses
 * as they were frozen at checkout, and the order's own tax. Nothing is
 * re-priced: the order is the record of what was agreed, and an invoice quietly
 * charging a different number would be a second opinion about a sale that has
 * already happened.
 *
 * The server refuses, in a sentence worth showing verbatim, when there is
 * nothing to ask for: an order paid in full, one that was called off, or one
 * that has already been invoiced.
 */
export function useCreateInvoiceForOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { dueAt?: string } = {}) =>
      api.post<{ document: { id: string; number: string | null }; balance: number }>(
        `/v1/orders/${id}/invoices`,
        input.dueAt ? { dueAt: input.dueAt } : {}
      ),
    onSuccess: () => {
      // The order's own paid/unpaid state does not move yet — raising an invoice
      // asks for money, it does not receive any — but the invoice list on this
      // pane does, and so does the Invoices screen.
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
    },
  });
}
