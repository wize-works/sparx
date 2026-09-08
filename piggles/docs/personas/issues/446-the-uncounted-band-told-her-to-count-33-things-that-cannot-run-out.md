# 446 — The uncounted band told her to count 33 things that cannot run out

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 108, looking at the screen [444] shipped on
**Surface:** Stock › Stock, and Sell › a product › How many you have
**Filed:** 2026-09-08
**Fixed:** 2026-09-08
**Confirmed by:** P03 · Juniper Row · act 108

## What happened

The band shipped by [444] read, on Devi's Stock screen, cold:

> **33 versions you sell have never been counted**
> This list only holds what you have counted, so they are not below. Until
> somebody counts them, your website sells them without limit.
> FRQ-BOOK-SIGNAL, FRQ-MEM-ANNUAL, FRQ-REP-AI26 and 30 more.

Those are **Frequency Membership — annual**, **The State of AI Infrastructure
2026**, and **The Signal — a field guide to hype**. A subscription and two
reports. Behind them: four perfumes made to order, a discovery set, two tote
bags and a sticker pack.

Every one of them is set to **keep selling when it runs out**. Unlimited is what
was asked for. There was nothing to count and nothing wrong.

## What was wrong

The right number on that screen was **zero**, and the band said thirty-three.

A band that names things that do not need doing is worse than no band. It is
thirty-three items of homework in front of the five that matter, and the next
time it says five she will already have learned to ignore it.

## This is my own regression, one day old

The audit written into [444] and into the platform memory reads, in so many
words:

> `deny` is the sharp filter: `continue` versions are uncounted on purpose all
> the time, because that policy means unbounded anyway.

The SQL in that document carries `AND v.inventory_policy = 'deny'`. **The query
that shipped does not.** I measured with a filter I did not implement, then
reported the measured number as if the shipped code produced it.

The row payload even carries `inventoryPolicy`, and 444's own text says why:

> The row carries `inventoryPolicy`, which is the setting that is NOT being
> honoured.

Carried, documented, and never read.

## The size of it

| policy     | posted | uncounted, on sale |
| ---------- | ------ | ------------------ |
| `continue` | yes    | **1,664**          |
| `deny`     | yes    | **55**             |

**1,664 against 55.** The band was thirty times noise.

`continue` is never an accident, either: the column defaults to `deny`, so every
one of those rows was written that way by somebody.

## The fix

One rule, in one place, asked by all three renderers.

**`countingMatters(variant)`** in
`{piggles,sparx}/apps/workbench/surfaces/inventory/data.ts`:

- `deny` — "stop selling it when it runs out". It cannot fire while nothing has
  ever been counted, so the shop is promising something it cannot keep. **This
  is the news.**
- `continue` — "keep selling when out". Unlimited as asked. Nothing to report.
- Not posted — a download or a service has no shelf, so it cannot be counted at
  all and naming it sends somebody to look for a box that does not exist.

The same two conditions are in `listUncounted`'s where clause, so the server
never sends what the screen would not show.

### Where the code changed

- `wizeworks/packages/inventory/src/services/public-api.ts` — `inventoryPolicy:
'deny'` and `requiresShipping: true` in `listUncounted`
- `{piggles,sparx}/apps/workbench/surfaces/inventory/data.ts` —
  `countingMatters`
- `{piggles,sparx}/apps/workbench/surfaces/commerce/product-stock.tsx` — the
  pane's own uncounted set asks the same rule
- Tests: `wizeworks/packages/inventory/test/integration/uncounted.test.ts`
  (2 new, 7 total), `{piggles,sparx}/apps/workbench/surfaces/inventory/data.test.ts`
  (3 new each, 8 total)

Guards run red separately: breaking the policy filter reddens the `continue`
test and leaves the not-posted one green; breaking the shipping filter does the
reverse. Two conditions, two dedicated tests, each with the other as its green
twin.

## Confirmed by

P03 · Juniper Row · act 108.

Devi's Stock screen went **33 → nothing**, which is the correct answer for a
shop whose only uncounted versions are unlimited on purpose. Adding an **Ink**
colorway to The Ash Overshirt then produced five real ones, and the band came
back reading **5 versions you sell have never been counted** with **Count them**,
naming ASH-OVERSHIRT-L-INK, ASH-OVERSHIRT-M-INK and ASH-OVERSHIRT-S-INK.

The product pane agreed: **5 versions have never been counted**, not 38.

## What this is an instance of

"A fix leaves its neighbour behind", in a shape I had not recorded: **the
measurement and the implementation disagreed, and the measurement was the one
written down.** The audit query is part of the fix, not a note beside it. If the
shipped `where` clause and the SQL in the issue do not match line for line, one
of them is wrong and the document will not be the one that gets caught.

## Rating effect

`Stock › Stock` and `Sell › Product › How many you have` — recorded in
[rating.md](../rating.md).
