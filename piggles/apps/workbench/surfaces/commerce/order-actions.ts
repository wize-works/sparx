'use client';

// The moves you can make on an order that already exists — writing down money
// taken, goods handed over, a cancellation and a refund.

import { useMutation, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import { ORDERS_KEY } from './order-queries';
import type { Order, OrderFulfillment, OrderPayment } from './order-types';

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
        // Her note goes in `metadata`, NOT `processorRef`. That field means "the
        // gateway's own reference for this charge", and writing a cheque number
        // into it told the refund path a gateway charge existed — so an order
        // became un-refundable the moment somebody filled in the note box the
        // screen asked them to fill in (persona issue 223). It is also part of
        // a uniqueness constraint, so two cheques noted the same way collided.
        ...(input.reference?.trim() ? { metadata: { note: input.reference.trim() } } : {}),
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
 * The other half of the gap the comment above describes. `PATCH
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
 * Refund money already taken for an order. If a gateway is holding the charge
 * the server reverses it there and THEN records it (see api-rest
 * lib/order-refund.ts), so a success means the money really moved and a 4xx
 * carries the gateway's own reason, which `orderErrorMessage` surfaces verbatim.
 * If the money was handed over — cash, a cheque, a transfer — there is nothing
 * to call, and a success means it is written down for the shop to hand back.
 * `refundWords` says which of those two happened, off the same fact.
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
 *
 * `VALIDATION_ERROR` is the exception, and the reason this is not just
 * `error.message`. It is the schema layer reporting on itself — the message is
 * the literal string **"Request validation failed."**, and the useful part is in
 * `details`, keyed by field path. Shown to a shopkeeper it explains nothing and
 * sounds like their fault, so the caller's plain sentence wins instead.
 */
export function orderErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
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
