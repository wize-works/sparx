# 429 — Her Denver studio was told it had staff in California, Texas and New York

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 92
**Surface:** mypiggles › Sell › Tax
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Juniper Row is cut and sewn in Denver, in a rented studio on Larimer Street. It
is the only place Devi has ever been.

**Sell › Tax** listed four places. Three of them:

> **California** — United States · **You have a presence here** — 1 rate — **Collecting**
> **New York** — United States · **You have a presence here** — 1 rate — **Collecting**
> **Texas** — United States · **You have a presence here** — 1 rate — **Collecting**

She never typed any of them. They were created 28 minutes after she signed up,
by the **clothing store** starter she picked in onboarding, which installs the
`tax-us-sales` preset — three state zones at 7.25%, 6.25% and 8.00%, each with
`nexusType: 'physical'` and `isActive: true`.

`physical` is what the screen renders as "You have a shop, office, or staff
here". So the console asserted, three times, a fact about her business that
nobody had asked her — and switched her to collecting on it.

The starter did tell her it included "US sales tax". "US sales tax" and "you are
registered in California, Texas and New York and are now charging there" are not
the same sentence.

## What should have happened

A starter may set up the SHAPE of tax — the places, the rates, ready to go. It
may not decide that a business is registered somewhere and start taking money
from its customers on that basis.

## How to reproduce

Every time, on any new tenant.

1. Sign up and pick a starter that includes tax — clothing, food, electronics,
   parts, or flowers.
2. Open **Sell › Tax**.
3. Three states are listed, each claiming a presence, each collecting.

## Why it matters

Collecting sales tax in a state you are not registered in is not a cosmetic
mistake — in most US states it is illegal, and the money is not hers to hold or
to hand back. She would be taking 7.25% off Californian customers on behalf of a
state she has never dealt with.

It stayed invisible because **nothing charged tax at all** ([428]). Fixing that
one made this one live: the same afternoon, a California basket at her checkout
went from no tax line to **$45.97**, taken under a claim of presence she never
made. One fix turned a dormant wrong statement into money.

This is the same shape as [031], where the activation bootstrap set a
collection-only bakery up to deliver worldwide, and Brandon's call there was
"remove it? it needs to be right."

## Where it lives

`wizeworks/packages/commerce/src/presets/tax.ts` — all three packs.
`wizeworks/services/api-rest/src/lib/industry-starters.ts` refers to
`tax-us-sales` from five starters.
`piggles/apps/workbench/surfaces/commerce/tax.tsx` and its sparx twin — the row.

## The fix

**Every tax pack installs switched off.** US, Canada and the German VAT pack all
move to `isActive: false`, and each description now says so in the merchant's
own words:

> California, Texas and New York set up with their state rates, SWITCHED OFF.
> Turn on the states you are actually registered in, and add your own — nothing
> is charged anywhere until you do.

The scaffolding is still there — she does not have to look up California's rate —
and no money moves until she says it should. The trap is written into the file's
header so the next person does not undo it.

**A place that is switched off no longer states a reason.** The list said
"You have a shop, office, or staff here" regardless, because it printed the
nexus type whatever the place was doing. It now reads
"United States · **Nothing is charged here yet**" until the place is on, at
which point the reason she chose is worth showing.

## Confirmed by

> **Sell › Tax** now reads "United States · The whole country · Nothing is
> charged here yet" on her switched-off place, instead of asserting a presence.
> Her three seeded states still say "You have a presence here" — correctly,
> because they are switched ON, which is the pre-existing data this fix does not
> reach.

## The second fix: the rule, not the instance

The first fix stopped new shops being set up wrong. It left the ones already
wrong, and it left the hole they came through open for the next thing that
writes a tax zone. Asked how this should be handled properly rather than
patched, the answer turned out to be one sentence:

> **A machine may set tax up. Only a person may switch it on.**

`is_active` could not carry that, because it held two different facts in one
boolean: "the owner decided this shop must collect here" and "something set this
up". Nothing could tell them apart, and something had been writing them.

So the two facts are now two columns. `commerce_tax_zones.activated_at` records
the moment a signed-in person switched collection on. It is separate from
`registered_at`, which is when the business registered with the tax authority
out in the world; both are true and neither implies the other.

Four places enforce it, each one covering the paths the others miss:

1. **`CreateTaxZoneInput.isActive` now defaults to `false`.** It defaulted to
   `true`, so a caller that never mentioned collection got a shop charging. That
   default is the root of this whole issue, and flipping it makes every future
   preset, importer, blueprint and API client safe without knowing the rule
   exists.
2. **`taxService.createZone` refuses to create a collecting place at all.** A
   tax place is always created switched off; starting to collect is a separate
   later act, and `updateZone` stamps `activatedAt` when a person performs it.
   The obvious guard — "does this caller have a user id?" — does NOT work on its
   own, because an industry starter installs during onboarding under the new
   owner's own session, so her actor id is on the write either way. What tells
   the two apart is the SHAPE of the request: no starter, blueprint, import or
   template ever makes a second call whose whole content is "start collecting
   here", and a person clicking a switch makes exactly that call. It is also the
   honest order of work, and it removes a state that never made sense, a place
   switched on before it has a rate. Refused out loud rather than quietly
   downgraded to off: a caller asking to collect and silently not collecting is
   the same mistake facing the other way.
3. **A database CHECK, `tax_zones_active_needs_a_person`**, makes an active zone
   with no activation record impossible for ANY writer: a hand-run script, a
   seed, a future service, anything that never goes through the service.
4. **`taxService.calculate` matches only zones that have one.** Money is taken
   at exactly one place in the code, so the rule is enforced at exactly that
   place too. `zoneIsCollecting` in `@wizeworks/commerce-schemas` is that same
   rule as one exported function, and both consoles draw their Collecting badge
   from it, so no screen can say "Collecting" about a place that takes nothing.

## The backfill, and why it needed nobody's permission after all

Filed above as a deploy decision that should not land without Brandon seeing it.
That was the wrong read, and the database said so:

```
 country | region | nexus_type | is_active | registration_number | never_touched | count
---------+--------+------------+-----------+---------------------+---------------+-------
 US      | US-CA  | physical   | t         |                     | t             |     9
 US      | US-NY  | economic   | t         |                     | t             |     1
 US      | US-NY  | physical   | t         |                     | t             |     9
 US      | US-TX  | economic   | t         |                     | t             |     1
 US      | US-TX  | physical   | t         |                     | t             |     8
 US      |        | physical   | f         |                     | t             |    36
```

**Every switched-on zone has no permit number, no registration date, and
`created_at = updated_at` — not one has ever been opened by a human.** There was
no merchant decision in there to protect. There never was a trade-off.

And the safety of switching them off does not rest on that count, which is one
dev database. It rests on something true of the code everywhere: **`calculate`
had no callers until [428]**, so no shop on this platform has ever charged a cent
of sales tax. There is no collection in progress for a backfill to interrupt,
and no merchant has ever seen what their tax settings produce at a till.

The migration therefore switches every unclaimed zone off, unconditionally, and
is written as "has nobody claimed this?" rather than as a one-off sweep — so it
states the rule and a re-run leaves alone a place a person has since turned on.
Nothing is lost: the place, its rate, its nexus type and its permit number all
stay exactly as they are. Only the switch moves.

## What the shop owner sees

She would otherwise open Sell › Tax and find everything off with no explanation,
so the screen explains itself. When she has a place that carries a rate and is
charging nothing:

> **Set up, but charging nothing**
> Tax is worked out and added at checkout. Every place starts switched off, so
> nothing is charged before you have looked at it. Open each place you are
> registered to collect in, check its rate, then switch it on. If you are not
> sure where you have to collect, ask an accountant.

Deliberately keyed on the place HAVING A RATE. Every new shop is seeded one
empty country place, switched off, and warning that owner their tax is not
working would be a warning about nothing.

Two smaller things fell out of the same rule:

- **A new tax place now starts switched OFF, and the form no longer offers the
  switch at all.** The line above it has always said "Nothing is charged until
  you switch the place on", and with the switch pre-set to on it was not true.
  Add the place, put the rate in, look at it, then switch it on.
- **The demo seed writes a permit number and a registration date** on the zones
  it activates. A demo shop that has been trading for a year IS registered where
  it collects; seeding a collecting place without them writes the same untrue row
  the starters did, and the CHECK now refuses it.

## Confirmed, as her, with money

Migration applied, then driven through the console and the shop.

**Sell › Tax** now opens on the notice and four silent places:

> **Set up, but charging nothing**
>
> California · United States · **Nothing is charged here yet** · 1 rate · **Off**
> New York · United States · **Nothing is charged here yet** · 1 rate · **Off**
> Texas · United States · **Nothing is charged here yet** · 1 rate · **Off**

Then, as the owner: **Add a place → Colorado.** The form offers no collect
switch, and says so ("It starts switched off, so nothing is charged here until
you come back and switch it on yourself"). Added, rate set to 2.9%, then switched
on, which is when the switch's own line changes to:

> **Charging here since September 6, 2026.**

The database agrees: `US-CO  is_active t  activated_at 2026-09-06 07:35:55+00`,
and CA / NY / TX still `f` with no stamp.

Three baskets on her shop, same Ash Overshirt at $128.00 with $9.00 delivery:

| Ship to          | The place                               | Charged                 |
| ---------------- | --------------------------------------- | ----------------------- |
| Portland, Oregon | none exists                             | $137.00, no tax line    |
| Denver, Colorado | on, switched on by her, 2.9%            | **$140.71 — tax $3.71** |
| California       | has a 7.25% rate, **nobody claimed it** | **$137.00, no tax**     |

$3.71 is 2.9% of $128.00 and correctly leaves the $9.00 delivery out, because
"Also charge this tax on delivery" was left off. The California basket is the one
that matters: the rate is sitting right there and **not a cent was taken**, where
before this it would have been **$9.28** for a state she has never dealt with.

Design checked in dark, light and at 360px in an injected iframe. No horizontal
overflow (`scrollWidth 356 = clientWidth 356`); the notice wraps intact and
Colorado's green **Collecting** badge reads clearly against the grey **Off** ones.

## Found while confirming, and fixed

**The DETAIL pane still asserted a presence on a place charging nothing.** The
list row was fixed above; its twin was missed, and a Colorado place created
seconds earlier and switched OFF still read "United States · You have a presence
here". Same defect as the one this issue is named for, one screen along. It now
reads "Nothing is charged here yet" until the place collects, from the SAVED
zone rather than the draft, so it says what is true now rather than what an
unsaved switch intends. Both consoles.

## Rating effect

Folded into Sell › Tax — Ease 2 → 8 in [rating.md](../rating.md), with [428].
