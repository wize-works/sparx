# BUG-005 — The shipping method the shopper picks is never charged

Status: **✅ FIXED — VERIFIED IN PRODUCTION 2026-07-24**
Severity: **High** — the merchant eats the shipping cost on every order
Found: 2026-07-24, production payments E2E (order `O-000002`)
Surfaces: `wizeworks/packages/commerce/src/services/checkout-service.ts` (`submitShipping`),
`wizeworks/packages/commerce/src/services/shipping-service.ts`, `wizeworks/services/api-rest/src/routes/v1/public/checkout.ts`

## Symptom

At checkout the shipping step offered **"Standard Shipping · 5 days $5.00"** (pre-selected),
and it was submitted. The order summary still read **Shipping: Free / Total $25.00**, and
the placed order came out:

```json
{ "subtotal": "25", "shippingTotal": "0", "total": "25", "amountPaid": "25" }
```

The shopper was charged $25.00 with **$0.00 shipping** — the merchant absorbs the carrier
cost on every single order.

## Root cause

`submitShipping()` persisted only the identifiers of the chosen rate, never its price:

```ts
data: {
  step: 'shipping',
  shippingAddress, billingAddress,
  shippingProviderSlug: input.shippingProviderSlug,
  shippingRateRef: input.shippingRateRef,   // ← ref only, no amount
}
```

`shippingTotalCents` on the session stayed at whatever the cart had (0), so `complete()`'s
`shippingDollars = session.shippingTotalCents / 100` was always 0, and the charged
`totalCents` never included shipping either. Selecting a shipping method was, in effect,
decorative.

The rate's price was only ever known inside the `/shipping-quote` ROUTE, which composed
the package + ship-from address + rating itself and returned the options to the browser.
Nothing server-side ever mapped the returned `rateRef` back to its amount.

## Fix

The price must be re-derived **server-side** — a client-supplied amount would let a
shopper post $0 shipping — so the quote composition had to become shareable rather than
route-local:

1. **New `shippingService.quoteForCart(ctx, { cartId, toAddress })`** — the single
   server-authoritative cart quote: cart lines → one package, tenant ship-from resolved,
   rated against the cart's own site + currency.
2. **`submitShipping()` re-quotes and matches the chosen `rateRef`**, then persists
   `shippingTotalCents`, `shippingDescription`, and a corrected `totalCents`
   (`total − previousShipping + chosenShipping`, so switching methods can't stack
   charges). If the ref is no longer in the quote it raises a clean validation error
   rather than silently charging nothing. Rating runs BEFORE the write transaction, since
   it opens its own tenant-scoped reads and may call a carrier.
3. **The public `/shipping-quote` route now calls the same helper**, so the quoted price
   and the charged price cannot drift apart.

## Verify after deploy

- Pick a paid shipping method → the checkout summary total rises by that amount, the
  Stripe charge equals the new total, and the order records a matching `shippingTotal`.
- Go back and switch methods → the total reflects the new rate only (no stacking).
- Free-shipping / no-rate configurations still complete at $0 shipping.

## Verified in production 2026-07-24

Order **O-000003** (`keen-cedar-6433`): picked Standard Shipping $5.00 →
checkout summary went `Shipping: Free / $25.00`→`Shipping: $5.00 / $30.00`,
button read **Pay $30.00**. Stripe PaymentIntent `pi_3Twp7x…`: `amount: 3000`,
`application_fee_amount: 15`(0.5% of the new $30, so the fee tracks the real
total too). Order record:`subtotal 25 / shippingTotal 5 / total 30 / amountPaid 30`.
The merchant no longer eats the carrier cost.
