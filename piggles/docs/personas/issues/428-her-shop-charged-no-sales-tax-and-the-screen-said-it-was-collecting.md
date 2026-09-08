# 428 — Her shop charged no sales tax at all, and the screen said it was collecting

**Status:** fixed
**Severity:** blocker
**Found by:** P03 · Juniper Row · act 92
**Surface:** mypiggles › Sell › Tax — and every checkout on the platform
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

**Sell › Tax** is a good screen. Plain words, no jargon: "A place is somewhere
you are registered to collect tax — usually because you have a shop, an office,
staff, or enough sales there." Devi had four places listed, three of them
carrying a rate and a green **Collecting** badge.

Then a customer in San Francisco filled her basket — a shirt, a knit and a
scarf, $634 — and the order summary read:

> Subtotal $634.00
> Shipping $25.00
> **Total $659.00**

No tax line. Not $0.00 — nothing at all.

**`taxService.calculate` had no callers.** Not checkout, not the cart, not the
B2B flow, not the market quote. The one mention of it anywhere outside its own
file is a comment in the Prisma schema saying it is "enforced at checkout",
which it was not. `taxTotalCents` was set to 0 when a cart was created and never
written again.

Measured three ways before touching anything:

1. `taxService.calculate` and `taxService.reverse`: **zero callers in the repo.**
2. A California basket at her own checkout: **no tax line**, on a shop with an
   active California place at 7.25%.
3. The database: **every order taken through the real checkout carries zero
   tax** — 17 of them across three persona shops. The only rows with tax on them
   are older demo tenants where the seed wrote a figure directly.

A second thing, found on the way in: `calculate` parses `customerExemptionIds`
and **never reads them**. A reseller with a certificate on file was in exactly
the same position as a walk-in shopper. Nobody could see it while no tax was
charged at all.

And a third, which is what would have broken the fix quietly: a delivery
address carries free text in State / Region — "CA", "California" — while a tax
place is filed as `US-CA`. Nothing translated between the two vocabularies.

## What should have happened

A shop with an active tax place charges that place's rate, shows it on the
summary, and stores what it charged.

## How to reproduce

Every time, before the fix.

1. Sell › Tax — confirm at least one place is switched on with a rate.
2. On the shop, fill a basket and check out to an address in that place.
3. The summary shows Subtotal, Shipping and Total, and no Tax.

## Why it matters

The shop under-collects on every order and still owes the money. Devi keeps 340
orders a year on roughly the thinnest margin in the roster, and sales tax is not
hers to absorb — it is the state's, and she is the one who has to hand it over
whether or not she took it. She would have found out from her first filing, by
which time it is a year of orders she cannot go back and re-charge.

It is also the console saying something false about money, in green, on the
screen built to answer this exact question — the same shape as [425].

## Where it lives

- `wizeworks/packages/commerce/src/services/checkout-service.ts` — `submitShipping`
- `wizeworks/packages/commerce/src/services/tax-service.ts` — `calculate`
- `wizeworks/packages/commerce/src/services/tax-region.ts` (new)
- `wizeworks/packages/commerce/src/services/tax-exemption.ts` (new)

## The fix

**Tax is priced where shipping is priced**, in `submitShipping`, and for the
same three reasons already written at that spot: it needs its own tenant-scoped
reads, it must not nest inside the write transaction, and it must never come
from the client. `quoteTaxForSession` gathers the basket, the destination, the
delivery charge and the customer's certificates, and the session stores
`taxTotalCents`, the provider slug, the breakdown ref and the breakdown itself.

Tax is swapped in the total exactly the way shipping already was — old value
out, new value in — so going back and changing the address or the delivery
option cannot stack charges.

Null comes back for the three honest cases, all of which mean "no tax line":
the order is being collected so there is no destination; the shop has no place
covering that destination; the basket is empty.

**The region vocabularies now meet.** `taxRegionCode` turns what a shopper types
into what a place is filed under — `CA`, `California`, `US-CA`, and the same for
Canadian provinces — and says **nothing** rather than guessing. An unrecognised
region then matches only the country-level place, which under-charges visibly
instead of charging a stranger the wrong state's rate. 8 tests.

**Certificates are honoured.** `calculate` now loads the ids it is given and
skips the tax when one covers this place today. A country certificate ("US")
covers a state inside it; a state certificate ("US-CA") never covers the country
zone, because a California resale certificate says nothing about Texas. 10 tests,
and `coveringExemption` returns WHICH certificate applied rather than a boolean,
because an order has to record that or the shop cannot answer an auditor.

**A line is taxed on what it actually cost.** `CartItem` carries no discount
column, so the per-line share comes from `apportionCartDiscounts` — the same
apportionment the order is written from, so tax and the invoice agree about what
was discounted.

## Confirmed by

Re-ran the act as the shopper, both directions:

> **To 912 Valencia St, San Francisco, California** — typed as the NAME, not the
> code — Subtotal $634.00, Shipping $25.00, **Tax $45.97**, Total $704.97.
> $634 × 7.25% is $45.965, and the shipping is untaxed because California's rate
> is set `appliesToShipping: false`. Both correct.
>
> **Back to 1184 SE Ash St, Portland OR** — Subtotal $634.00, Shipping $25.00,
> Total $659.00, and **no tax line**, because she has no Oregon place. Switching
> the address back also REMOVED the tax rather than leaving it stacked.

commerce is at 171 tests; commerce, commerce-schemas, api-rest and both consoles
clean on tsc and lint.

## Left open, and named rather than done

**A shop's own state is still not set up for it.** Devi's studio is in Denver
and she has no Colorado place, so she now collects nothing where she certainly
does have nexus. Onboarding knows her address; seeding her own state (switched
off, like every other) would be the honest next step. Recorded rather than
built, because picking which places a business is registered in is a question to
ask her, not one to answer for her.

## Rating effect

Sell › Tax — Design 8, Ease 2 → 8. Sell › Tax place — Design 8, Ease 7.
Recorded in [rating.md](../rating.md).
