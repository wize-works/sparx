// Client-side checkout API. Thin fetch wrappers over the public checkout
// surface (via the same-origin /api/sparx proxy), carrying the cart ownership
// token (x-cart-token) on every call. All calls run in the browser.

const API_BASE = '/api/sparx';
const TOKEN_KEY = 'sparx_cart_token';

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface ShippingRate {
  providerSlug: string;
  rateRef: string;
  service: string;
  carrier: string;
  amountCents: number;
  estimatedDays: number | null;
}

/** The slug the server tags the hand-it-over-the-counter option with. Not a
 *  carrier — see the commerce package's collection-option. */
export const COLLECTION_PROVIDER_SLUG = 'collection';

export function isCollectionRate(rate: Pick<ShippingRate, 'providerSlug'>): boolean {
  return rate.providerSlug === COLLECTION_PROVIDER_SLUG;
}

export interface ShippingQuote {
  /**
   * Whether this shop delivers at all — from what it has SET UP, not from
   * whether these particular rates came back empty. False means every option
   * here is a hand-over in person, so there is no address to ask anybody for
   * (issue 064).
   */
  deliveryOffered: boolean;
  rates: ShippingRate[];
}

export interface CheckoutTotals {
  subtotalCents: number;
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  // Disclosed document surcharge (docs/48 §6) — e.g. a card processing fee.
  surchargeTotalCents?: number;
  // Money already paid, already subtracted inside totalCents. api-rest has
  // always sent both; naming them here is what lets the summary show the rows
  // that make the total add up. Defaulted on read for an older api-rest.
  giftCardAppliedCents: number;
  accountCreditAppliedCents: number;
  totalCents: number;
}

export interface CheckoutSession {
  sessionId: string;
  cartId: string;
  step: string;
  currency: string;
  /**
   * How this shop takes money: a card form, in person, or not at all.
   *
   * Optional on the type, and read defensively, because an api-rest that
   * predates this field sends nothing — and the safe reading of "nothing" is the
   * card path every shop had before, not a claim that the shop takes cash.
   */
  paymentMode?: 'card' | 'in_person' | 'unavailable';
  customerEmail?: string;
  // Present only when the signed-in customer is an active B2B contact — the
  // frontend's ONLY signal for showing the "bill to account" payment choice.
  companyId?: string;
  // The linked account's payment-terms designation (e.g. 'prepay', 'net30').
  // A 'prepay' account has no net-terms entitlement — hide that choice.
  b2bAccountPaymentTerms?: string;
  // Customer-facing label for the surcharge line, when one applies.
  surchargeLabel?: string;
  totals: CheckoutTotals;
  /** Made to order (issue 026) — what the card is charged now and what falls
   *  due on collection. Optional, and read defensively: an api-rest that
   *  predates it sends nothing, and the safe reading of nothing is an ordinary
   *  basket paid in full, which is what every checkout did before. */
  madeToOrder?: CheckoutMadeToOrder;
}

export interface CheckoutMadeToOrder {
  readyOn: string | null;
  noticeDays: number | null;
  dueNowCents: number;
  balanceCents: number;
  depositCents: number;
}

export interface PaymentIntentResult {
  paymentRef: string;
  providerSlug: string;
  /** Inline (Stripe-family) gateways confirm with this in the browser. */
  clientSecret?: string;
  /** The publishable key to load Stripe.js with, when the intent isn't on sparx's own
   *  account (a `stripe_direct` tenant using their own Stripe). Absent for sparx Pay,
   *  where the build-time platform key is correct. */
  publishableKey?: string;
  /** Hosted-redirect gateways: the vendor page to send the shopper to. When a token
   *  also rides in `clientSecret` (Authorize.net), POST it to this URL instead of GET. */
  redirectUrl?: string;
  amountCents: number;
  currency: string;
  status: string;
}

function token(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

async function call<T>(
  path: string,
  tenantSlug: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}?tenant=${encodeURIComponent(tenantSlug)}`, {
    ...rest,
    headers: {
      'x-cart-token': token(),
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { message: string; code: string } }
    | null;
  if (!res.ok || !body || body.success === false) {
    const message = body?.success === false ? body.error.message : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body.data;
}

export function startCheckout(
  tenantSlug: string,
  cartId: string,
  email?: string
): Promise<CheckoutSession> {
  return call('/v1/public/commerce/checkout', tenantSlug, {
    method: 'POST',
    json: { cartId, ...(email ? { email } : {}) },
  });
}

export function getCheckout(tenantSlug: string, sessionId: string): Promise<CheckoutSession> {
  return call(`/v1/public/commerce/checkout/${sessionId}`, tenantSlug, { method: 'GET' });
}

export function submitContact(
  tenantSlug: string,
  sessionId: string,
  input: { email: string; name?: string; phone?: string; acceptsMarketing?: boolean }
): Promise<CheckoutSession> {
  return call(`/v1/public/commerce/checkout/${sessionId}/contact`, tenantSlug, {
    method: 'POST',
    json: input,
  });
}

export function quoteShipping(
  tenantSlug: string,
  sessionId: string,
  input: {
    destinationAddress?: Address;
    destinationCountry?: string;
    destinationPostal?: string;
  }
): Promise<ShippingQuote> {
  return call(`/v1/public/commerce/checkout/${sessionId}/shipping-quote`, tenantSlug, {
    method: 'POST',
    json: input,
  });
}

export function submitShipping(
  tenantSlug: string,
  sessionId: string,
  input: {
    /** Omitted for a collection rate: nothing is being posted, so there is no
     *  address, and the server stores absence rather than a placeholder. */
    shippingAddress?: Address;
    billingAddress?: Address;
    shippingRateRef: string;
    shippingProviderSlug: string;
    shippingService?: string;
    shippingCarrier?: string;
  }
): Promise<CheckoutSession> {
  return call(`/v1/public/commerce/checkout/${sessionId}/shipping`, tenantSlug, {
    method: 'POST',
    json: input,
  });
}

export function createPaymentIntent(
  tenantSlug: string,
  sessionId: string,
  returnUrl?: string
): Promise<PaymentIntentResult> {
  return call(`/v1/public/commerce/checkout/${sessionId}/payment-intent`, tenantSlug, {
    method: 'POST',
    json: returnUrl ? { returnUrl } : {},
  });
}

export function submitPayment(
  tenantSlug: string,
  sessionId: string,
  input:
    | { paymentProviderSlug: string; paymentRef: string; poNumber?: string }
    | { poNumber?: string; paymentTermsRequested: string }
    // Paid in person: nothing to declare. The server reads how this shop takes
    // money from the shop's own configuration, never from what the client claims.
    | Record<string, never>
): Promise<CheckoutSession> {
  return call(`/v1/public/commerce/checkout/${sessionId}/payment`, tenantSlug, {
    method: 'POST',
    json: input,
  });
}

/** `expectedTotalCents` is the figure on the button she just pressed. The server
 *  refuses rather than write an order for a total she was never shown — a sale
 *  can end between this page being drawn and the press (issues 298, 300). */
export function completeCheckout(
  tenantSlug: string,
  sessionId: string,
  idempotencyKey: string,
  expectedTotalCents?: number
): Promise<{ orderId: string; orderNumber: string }> {
  return call(`/v1/public/commerce/checkout/${sessionId}/complete`, tenantSlug, {
    method: 'POST',
    json: { idempotencyKey, ...(expectedTotalCents !== undefined ? { expectedTotalCents } : {}) },
  });
}
