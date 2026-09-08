# 445 — The count form opens on a building she does not use

**Status:** fixed
**Severity:** moderate
**Found by:** P03 · Juniper Row · act 107, filed and fixed in act 108
**Surface:** Sell › a product › How many you have, and Stock › a version
**Filed:** 2026-09-08
**Fixed:** 2026-09-08
**Confirmed by:** P03 · Juniper Row · act 108

## What happened

Counting five new versions of one shirt, Devi opened **Record a count** five
times. Every time, **Where you counted it** said **Fulfillment Center**. Every
unit of stock Juniper Row owns is in the **Main Warehouse**: 67 count rows
there, 0 at the Fulfillment Center.

So she changed it five times, on five identical forms, one after the other. The
form did not remember the change she had just made either, so the fifth
correction was as necessary as the first.

## What was actually happening

`locations[0]`. The first location in the list, and the list is sorted by name.
**Fulfillment Center** beats **Main Warehouse** because F comes before M.

That is not a guess about her business. It is a fact about the alphabet.

## Why it matters

A count is a statement about a real shelf. Putting it against the wrong building
does not fail loudly:

- The units land somewhere she never looks.
- The Main Warehouse still reads as empty, so the version stays sold out on her
  website while the shirts are on the shelf.
- Nothing tells her, because both numbers are true of the place they are
  recorded against.

Five forms in a row is also exactly the moment attention drops. The one that
matters is the one you stopped reading.

## What was NOT the answer

**The site's "default location" setting looked like the answer and is not.**
`commerce_site_settings.defaultWarehouseId` exists, and on 2026-09-08 all 35
rows on the platform carried a value. But nothing in the console edits it, and
`bootstrapDefaults` writes it once by picking the OLDEST warehouse — **34 of the
35 had never been updated by anybody.**

Treating a machine-written guess as somebody's answer is how the wrong building
gets authority. So this reads evidence instead.

## The fix

A ladder, most specific first, in
`{piggles,sparx}/apps/workbench/surfaces/inventory/count-location.ts`:

1. **Where this exact version is already counted.** Unarguable.
2. **Where this person last recorded a count.** They are still standing there,
   and a place chosen on purpose must not be overruled on the next form.
3. **Where the rest of this product is counted.** Adding a color makes new
   versions of a thing that is already sitting somewhere. This is the case the
   whole file exists for.
4. **The first place offered.** Today's behavior, now the last resort.

2 sits above 3 deliberately: somebody counting a delivery at the Fulfillment
Center must not be sent back to the Main Warehouse on the next version.

The remembered place is written on SUCCESS only — a count that failed to save is
not somewhere anybody counted — and it is never trusted on its own: it is used
only when the id is still one of the places on offer, which makes a leftover id
from a closed location or a different business harmless rather than wrong.

`initialWarehouseId` survives as an explicit override for the case where
somebody pressed **Count** on one location's card. An explicit ask beats every
guess below it.

### Where the code changed

- `{piggles,sparx}/apps/workbench/surfaces/inventory/count-location.ts` (new)
- `{piggles,sparx}/apps/workbench/surfaces/inventory/stock-item.tsx`
- `{piggles,sparx}/apps/workbench/surfaces/commerce/product-stock.tsx` — the
  pane derives `nearby` from the levels it already holds and passes it down
- Tests: `{piggles,sparx}/apps/workbench/surfaces/inventory/count-location.test.ts`
  (8 each)

Guards run red one rung at a time: breaking the this-version rung reddens only
its own test, and so do the remembered rung, the sibling tally, and the
still-on-offer check. Four breaks, four different single failures.

## Confirmed by

P03 · Juniper Row · act 108, on her own screen.

With nothing remembered, **ASH-OVERSHIRT-XS-INK** opened on **Main Warehouse** —
rung 3, from its 20 counted siblings. With the Fulfillment Center remembered, the
next version opened on the **Fulfillment Center** despite all 21 siblings being
in the Main Warehouse — rung 2 beating rung 3, on screen, in the direction that
protects her choice.

Then the real work: five Ink versions counted in a row at the Main Warehouse
without touching the location picker once after the first.

## Rating effect

`Sell › Product › How many you have` and `Stock › a version` — recorded in
[rating.md](../rating.md).
