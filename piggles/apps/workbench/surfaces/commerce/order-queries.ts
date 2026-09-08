'use client';

// Reading orders — the list, one order, and the three things that happened to
// it. Owns the ['commerce','orders'] query key that every mutation invalidates.

import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { normalizeOrder, num } from './order-types';
import type { Order, OrderFulfillment, OrderPayment, OrderRefund } from './order-types';

export const ORDERS_KEY = ['commerce', 'orders'];

/** Server-side sort. The list is paged, and a browser-side sort of the loaded
 *  window sorts ONE page and presents it as the answer — "biggest order" would
 *  hand back the biggest order on page 3. */
export type OrderSortKey = 'placedAt' | 'total';
export type SortDirection = 'asc' | 'desc';

export interface OrderQuery {
  q?: string;
  status?: string;
  /** Only the orders that count toward a customer's figures — cancelled ones
   *  left out. For a list shown BESIDE those figures. */
  countedOnly?: boolean;
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
          ...(query.countedOnly ? { counted_only: 'true' } : {}),
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

/** One invoice raised for this order, as the pane shows it. */
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
