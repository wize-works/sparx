'use client';

// Checkout-session data — a shopper part-way through paying.
//
// This file OWNS the checkout-session types and the ['commerce','checkout']
// query key. A session is created by the storefront as it walks a shopper from
// cart to order; staff never author one. So this is a READ surface with one
// honest staff move: a stalled session can be expired by hand to release the
// stock it is holding.
//
// Money is integer CENTS (cached totals on the session row); the surfaces divide
// by 100 at the render edge and reuse `formatMoney` from ./data.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { channelLabel } from '../../lib/console/channels';
import { api } from '../../lib/api/client';
import type { Tone } from './data';
import type { OrderAddress } from './data';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export type CheckoutStep =
  'cart_review' | 'contact' | 'shipping' | 'payment' | 'review' | 'completed' | 'expired';

/** A row in the checkout-sessions list. */
export interface CheckoutRow {
  id: string;
  step: CheckoutStep;
  channel: string;
  currency: string;
  customerId: string | null;
  customerEmail: string | null;
  /** The shopper's name when they have an account. Null for a guest, who is
   *  only ever an email address. */
  customerName: string | null;
  subtotalCents: number;
  totalCents: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutTotalsDetail {
  subtotalCents: number;
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  surchargeTotalCents: number;
  giftCardAppliedCents: number;
  accountCreditAppliedCents: number;
  totalCents: number;
}

/** The full session — where it stalled, what the shopper entered so far, and the
 *  totals it has computed. The addresses reuse OrderAddress from ./data, whose
 *  shape matches the stored AddressSnapshot. */
export interface CheckoutDetail {
  sessionId: string;
  cartId: string;
  step: CheckoutStep;
  channel: string;
  currency: string;
  customerEmail?: string;
  customerId?: string;
  companyId?: string;
  b2bAccountPaymentTerms?: string;
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  shippingDescription?: string;
  paymentProviderSlug?: string;
  poNumber?: string;
  paymentTermsRequested?: string;
  surchargeLabel?: string;
  totals: CheckoutTotalsDetail;
  expiresAt: string;
}

/* ── Queries ────────────────────────────────────────────────────────────── */

export const CHECKOUT_KEY = ['commerce', 'checkout'];

export interface CheckoutQuery {
  step?: CheckoutStep;
  /** Every step except completed and expired. The list is called half-finished
   *  checkouts and most of what it held were finished ones, so this is what it
   *  opens on. */
  unfinished?: boolean;
  take: number;
  skip: number;
}

export function useCheckoutSessions(query: CheckoutQuery) {
  return useQuery({
    queryKey: [...CHECKOUT_KEY, 'list', query],
    queryFn: () =>
      api.list<CheckoutRow>('/v1/commerce/checkout-sessions', {
        ...(query.step ? { step: query.step } : {}),
        ...(query.unfinished ? { unfinished: true } : {}),
        take: query.take,
        skip: query.skip,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useCheckoutSession(id: string) {
  return useQuery({
    queryKey: [...CHECKOUT_KEY, 'detail', id],
    queryFn: () => api.get<CheckoutDetail | null>(`/v1/commerce/checkout-sessions/${id}`),
    enabled: id !== '',
  });
}

/** Expire a stalled session by hand — the one staff move. A no-op on a session
 *  that already completed or expired, so the surface only offers it while the
 *  session is still in flight. */
export function useExpireCheckoutSession(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/v1/commerce/checkout-sessions/${id}/expire`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHECKOUT_KEY });
    },
  });
}

export function checkoutErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/* ── Saying what a step means ───────────────────────────────────────────── */

/**
 * How far a shopper got before this session was last touched, and whether that
 * is somewhere it can move on from. The stored steps are the storefront's
 * internal stages; these are what they mean to the person watching a sale stall.
 */
export function checkoutState(step: CheckoutStep): { label: string; tone: Tone; detail: string } {
  switch (step) {
    case 'completed':
      return {
        label: 'Finished',
        tone: 'success',
        detail: 'This shopper paid — the sale went through and became an order.',
      };
    case 'expired':
      return {
        label: 'Expired',
        tone: 'neutral',
        detail: 'This session timed out. The shopper would have to start again.',
      };
    case 'payment':
      return {
        label: 'Stalled at payment',
        tone: 'warning',
        detail: 'The shopper reached the payment step and has not finished paying.',
      };
    case 'review':
      return {
        label: 'Stalled at review',
        tone: 'warning',
        detail: 'The shopper was on the final review step and did not confirm.',
      };
    case 'shipping':
      return {
        label: 'Stalled at delivery',
        tone: 'info',
        detail: 'The shopper was choosing a delivery option.',
      };
    case 'contact':
      return {
        label: 'Stalled at contact',
        tone: 'info',
        detail: 'The shopper was entering their contact details.',
      };
    default:
      return {
        label: 'Just started',
        tone: 'info',
        detail: 'The shopper had only reached the first step, reviewing their cart.',
      };
  }
}

/** The plain-language name for a step, used inline in prose. */
export const STEP_LABELS: Record<CheckoutStep, string> = {
  cart_review: 'Reviewing the cart',
  contact: 'Entering contact details',
  shipping: 'Choosing delivery',
  payment: 'Paying',
  review: 'Final review',
  completed: 'Finished',
  expired: 'Expired',
};

export function stepLabel(step: CheckoutStep): string {
  return STEP_LABELS[step] ?? step;
}

/** True while a session can still be expired by hand. */
export function isCheckoutLive(step: CheckoutStep): boolean {
  return step !== 'completed' && step !== 'expired';
}

/** One console vocabulary — see lib/console/channels.ts. */
export function checkoutChannelLabel(channel: string): string {
  return channelLabel(channel);
}
