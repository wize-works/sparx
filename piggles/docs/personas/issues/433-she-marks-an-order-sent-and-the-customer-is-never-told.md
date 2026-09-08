# 433 — She marks an order sent and the customer is never told

**Status:** fixed
**Severity:** blocker
**Found by:** P03 · Juniper Row · act 98
**Surface:** the order-lifecycle emails, platform-wide
**Filed:** 2026-09-07
**Fixed:** 2026-09-07

## What happened

Issue 432 fixed the order confirmation. It fixed **one** of the emails nothing
sent. Sweeping the whole set found the next one, and it is the one Devi was about
to need.

**The shipping confirmation has never been sent either.**

Asking the database which of the 43 provisioned email templates any automation
actually names:

| Template                                                | Shops that have it |                    Automations that send it |
| ------------------------------------------------------- | -----------------: | ------------------------------------------: |
| `shipping-confirmation`                                 |                 25 |                                       **0** |
| `appointment-confirmation` / `-reminder` / `-cancelled` |                  7 |                                       **0** |
| the 5 `booking-*`                                       |                 25 |   0 — sent by the scheduling ledger instead |
| `waitlist-offer`                                        |                 25 | 0 — sent by the waitlist offer path instead |
| everything else (33)                                    |                 25 |                                    18 to 56 |

The `booking-*` and `waitlist-offer` rows are fine: they have a real sender that
is not an automation. `shipping-confirmation` has no sender at all.

## What the customer actually experienced

`order.fulfilled` does fire. It is published by `order-fulfillments-service.ts`
the moment a parcel is marked shipped or handed over, and **55 automations listen
to it**. Every one of them is the post-purchase review request.

So the sequence a shopper lived through was:

1. Buys something. (Until 432, silence.)
2. Devi marks it sent. **Silence.** No tracking number, no carrier, no note.
3. Three days later: _"How did we do? Leave a review."_

Asked to review a parcel nobody ever told them was coming.

## The second half, underneath

The `shipping-confirmation` template declares the data it needs:

```
refs: ['customerId', 'orderId', 'fulfillmentId'],
```

The event carries the parcel too — `payload: { orderId, fulfillmentId, ... }`.

But the trigger resolver for `order.fulfilled` was `hydrateOrder(orderId)`, which
drops everything else in the payload, and `entityRefsFromFields` in the email
action had no `fulfillmentId` line. So the parcel id could not reach the render
by any route.

The render survives that, but by guessing: `resolveShipping` falls back to _"the
latest fulfillment on this order"_. For an order that ships in one box, right. For
an order that ships in two, **the first box's email carries the second box's
tracking number.**

Same shape as the tax defect and the site-audit defect before it: a rule present
on one path and missing on its twin.

## A third, found on the way

`entityRefsFromFields` was dropping `bookingId` for the same reason. The console
offers "Somebody books an appointment" as an automation trigger, and the resolver
does hydrate the booking, so conditions on it work. But every booking email source
resolves from `ref.bookingId` alone, with no fallback. An owner who built their own
"when someone books, email them" automation would have sent a confirmation with the
date, the time, the service and the place all blank.

## The fix

Three edits, each following a pattern the files already used.

1. **`automation/src/resolvers/builtins.ts`** — `order.fulfilled` and
   `order.delivered` move out of `ORDER_EVENTS` into their own group that hydrates
   the order and then merges `fulfillment.id` from the payload, exactly the way
   `SUBSCRIPTION_LINK_EVENTS` merges the facts that ride in theirs.
2. **`automation-actions/src/email.ts`** — `entityRefsFromFields` gains
   `fulfillmentId` and `bookingId`.
3. **`automation-actions/src/seeds/commerce.ts`** — a
   `COMMERCE_SHIPPING_CONFIRMATION_EMAIL` seed on `order.fulfilled`, no delay,
   registered between the confirmation and the delivered notice so the catalog
   reads in the order the customer lives it.

**No migration.** `reconcileSystemSeeds` runs daily off the automation worker and
idempotently upserts the catalog into every tenant whose commerce module is
active.

## Proof

A new integration test ships two parcels on one order and fires `order.fulfilled`
for the second. It asserts that **both** sends leave — because the review request
always did fire here, and that is precisely how the missing confirmation stayed
hidden — and that the shipping confirmation's refs name the parcel that actually
shipped, not the latest one on the order.

## Left standing, deliberately

Three `appointment-*` templates sit published on 7 shops with nothing able to send
them. They are the previous generation of the five working `booking-*` templates,
which superseded them; no code anywhere references the appointment keys. Juniper
Row is not one of the 7. Clearing them means deleting rows on other people's
tenants, which is not mine to do unasked — recorded here instead.
