# 407 — A clothing label cannot be told when somebody buys something

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 82 · reading the list of things she can be notified about
**Surface:** mypiggles › Content › Tell other software › "What should trigger a notification?"
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** ticked **Order paid** as Devi and saved; the picker now leads with Selling in both consoles

## What happened

The picker offered **35 events in seven groups**: Content, Files, Redirects,
Stock, Warehouse, Supply, Stock feeds.

There was nothing about an order. Nothing about a payment. Nothing about a
customer filling in a form. Devi sells clothes; the single most obvious thing to
tell another system is **somebody bought something**, and the screen whose whole
job is telling other software could not do it.

## What should have happened

The events that are already published and already useful should be on the list,
and the one a shop owner is looking for should not be seventh.

## Why it mattered

The surface read as complete — seven headings, thirty-five well-written
descriptions — so nothing suggested a gap. Somebody wiring up an accounts package
or a fulfilment tool would scroll the whole list, find "Stock changed", and
settle for inferring a sale from a stock movement. That is a worse integration
built on the assumption that a better one was not offered because it does not
exist.

## What was actually available

Verified by grepping the publish sites, not by reading the event registry — the
registry declares 170 events and publishing is what matters (the route's own
header makes this rule explicit, and `inventory.levels.updated` is the standing
example of a declared-but-never-published key):

| Event              | Published at                           | Added                                |
| ------------------ | -------------------------------------- | ------------------------------------ |
| `order.paid`       | `lib/payment-webhook-reconcile.ts:429` | yes                                  |
| `payment.captured` | `lib/payment-webhook-reconcile.ts:411` | yes                                  |
| `payment.failed`   | `lib/payment-webhook-reconcile.ts:503` | yes                                  |
| `form.submitted`   | `routes/v1/public/forms.ts:335`        | yes                                  |
| `redirect.changed` | `routes/v1/redirects/index.ts:291`     | yes                                  |
| `order.placed`     | nowhere (a test only)                  | **no** — it would sit silent forever |

## The fix

**Five keys, in three places, moved together** — which is exactly what
`check:webhooks` exists to enforce:

1. `EVENT_KEYS` in api-rest's `webhooks/subscriptions.ts`, 35 → 40.
2. Piggles' picker — a new `webhook-events/selling.ts`, plus `redirect.changed`
   in `content.ts`.
3. sparx's picker — the same five, written into its own file. **Copied, not
   imported.** Neither brand tree may depend on the other, so each console keeps
   its own catalogue; `check:deletability` and `check:boundaries` both still
   pass.

**Selling leads the list.** The heading order was Content-first because the pane
lives under Content. A shop owner scanning this list is looking for "somebody
bought something" before anything else, so Selling is now the first group in both
consoles and `order.paid` the first row in it.

**`redirect.changed` came with it.** The route carried a note saying it could not
be allowed because the picker it is checked against lived under a tree Piggles
may not edit. That note is gone; the event repoints the storefront cache
(issue 396) and is now subscribable.

**`order.placed` stays out**, and the reason is written where the next person
will look: it is declared in the registry and published by nothing, so a
subscription to it would sit silent and read as a broken endpoint.

## Confirmed by

Driven as Devi, and by the check that would have caught a half-applied change:

> Opened "Tell our stock page". The first heading is now **Selling**, with
> **Order paid** at the top of it: "Somebody has paid for an order. The money is
> on its way to you and the order is ready to be filled." Ticked it, pressed
> Save, green **Saved** toast — so the server accepts the key too, not just the
> picker.
>
> `check:webhooks`: **40 allowed keys, 2 pickers (piggles:40, sparx:40), 170
> declared events; every picker carries every allowed event.**

The nine structural checks all pass, including `check:deletability` and
`check:boundaries` — the two that would fail if one brand had started importing
from the other.

## Still open

- **Nothing about customers.** `customer.created` is declared and published by
  nothing, so it is correctly absent — but a CRM integration wanting "a new
  customer appeared" still has nowhere to hook. That is a missing publish, not a
  missing picker entry.
- **Order events are not scoped to a site.** A tenant with seven sites gets every
  site's paid order on the one subscription. The same is already true of the
  other 35, so it is not new here, but a multi-site business will notice it on
  this group first.

## Rating effect

Raises `cms.webhooks.detail` — re-scored in [rating.md](../rating.md).
