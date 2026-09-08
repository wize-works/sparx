# 432 — A customer bought something and heard nothing back

**Status:** fixed
**Severity:** blocker
**Found by:** P03 · Juniper Row · act 97
**Surface:** juniper-row.piggles.site checkout → the customer's inbox
**Filed:** 2026-09-06
**Fixed:** 2026-09-06

## What happened

Nine of Devi's orders were sitting "To send" and unpaid, three of them past their
due date. Looking for a way to chase the money led somewhere worse.

**Nothing on this platform has ever sent an order confirmation.**

The `order-confirmation` Builder email exists on every shop. It is provisioned,
published and live — one of thirty on hers. It has never been sent, because
nothing sends it:

- **Zero automations trigger on `order.placed`.** Not on her shop; not on any
  shop. `select count(*) from automations where trigger_type='order.placed'` → **0**.
- **No seeded system automation names it.** The four order-lifecycle emails that
  DO exist fire on `order.delivered`, `order.cancelled`, `order.refunded` and
  `order.payment_failed`.
- **`checkoutService.complete()` sends no mail at all.**

The one mention of it anywhere in the automation code is a comment above those
four, describing them as:

> the counterparts to order-confirmation that were missing

Which is the whole story in a line. Someone built the counterparts on the
reasonable assumption that the original was already handled. It never was. The
platform could tell a customer their order was delivered, cancelled or refunded.
It could not tell them it had been placed.

## Why it matters more on her shop than most

Juniper Row takes no payment at checkout. Her last screen says, in the
platform's own words:

> Placing this order does not take any money now, and no card details are needed.
> **We'll be in touch about paying for it.**

So the shopper hands over their address, presses **Place order — $140.71 to
pay**, and receives: nothing. No order number, no summary, no record that
anything happened, and no sign of the promised contact. On a shop that takes the
money at the till a confirmation is a courtesy; on a pay-later shop it is the
entire handover, and it is where the promise to be in touch was supposed to
start.

Two of her seeded automations compound it. **High-value order alert** fires on
`order.paid` and **Payment failed — email** on `order.payment_failed`; her shop
never takes payment at checkout, so neither can ever fire. The one event her shop
does produce every time, `order.placed`, had nothing listening.

## The fix

**One seeded system automation, exactly mirroring the four that already exist:**
fires on `order.placed`, sends the `order-confirmation` Builder email as
transactional (so a marketing unsubscribe never withholds it), guarded by
`customer.email is_set` so a guest order with no address is skipped. No delay —
a confirmation that arrives later than the shopper's own doubt is not a
confirmation.

Everything it needs was already in place: `order.placed` is in `ORDER_EVENTS` in
the trigger resolver, so `customer.email` and the `order.*` refs resolve. Only
the seed was missing.

**Existing shops need no migration.** `reconcileSystemSeeds` runs daily off the
automation worker, discovers every tenant whose owning module is active, and
idempotently upserts the catalog. Every shop already trading picks this up within
a day of the deploy, which is the mechanism the tax fix ([429]) had to be talked
through by hand.

The comment above the group is rewritten so it no longer describes the
confirmation as something that exists elsewhere.

## Found on the way, and fixed

**A test was asserting a value that would have re-broken notification links.**
`notify.test.ts` expected `entityType` to be `'Order'`; the seed writes `'order'`.
Lowercase is correct and load-bearing: `entityType` is the key `routeForEntity`
looks up in `@wizeworks/links` to decide where a notification LEADS, and all 28
entity keys there are lowercase (`order`, `gift_card`, `cms_page`). `'Order'`
resolves to nothing, which would turn the notification bell back into the dead
end its own code comments say it used to be. The assertion is corrected, with the
reason written beside it.

**And a test that had quietly started failing for everyone.** The reconcile
idempotence test was timing out at the default 30 seconds. It was not my change —
measured both ways, with the new seed (48.5s) and with it temporarily
unregistered (51.0s), the same test failed identically. `reconcileSystemSeeds` is
global by design (it discovers every tenant with each owning module active and
upserts the whole catalog into all of them), so a test of it is O(the entire
development database) and this one runs it twice. On a dev database grown to 111
tenants and 2,230 automations that is about 30 seconds a pass. Raised to two
minutes with the reasoning written beside it; narrowing the scan to the test
tenant would stop the test proving the thing it exists for. All 54 tests in the
package now pass, including the two that were already red on arrival.

## Left open, and named rather than parked

**She still cannot ask a customer for money.** The order pane can record a
payment that arrived and can send the goods; there is no "request payment". An
invoice is the obvious vehicle and `BillingDocument` has `customerId` and
`companyId` but **no `orderId`**, so an invoice cannot be tied to an order and
paying one would not settle it. That is a capability with schema, email and
shopper-facing surface behind it, not a defect to patch — named here so it is not
mistaken for an oversight. The confirmation email fixed above is the first half
of the promise her checkout makes; the second half is unbuilt.

## Rating effect

None yet — the order pane is scored elsewhere and the shop-side email was never
a console pane.
