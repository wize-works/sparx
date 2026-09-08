# 444 — She added a color and five shirts went on sale with no count behind them

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 107 (re-running act 3 to prove [172])
**Surface:** mypiggles › Stock › Stock, and Sell › a product › How many you have
**Filed:** 2026-09-08
**Fixed:** 2026-09-08
**Confirmed by:** P03 · Juniper Row · act 107

## What happened

Devi added a fourth colorway to The Ash Overshirt for the autumn drop. Options
tab, **Add a color**, `Moss`, `#6E7B4F`, **Change how it is sold**. The console
was precise about the consequence:

> 20 combinations can be sold in all. 15 versions keep their price and code.
> 5 combinations will have no price, so they cannot be bought until you set them
> on the Variants tab.

She set them: **Give them all the same price** → **Create them**.

> 5 combinations now have a price

At that moment five shirts went on sale on her website that she has not made,
has never counted, and that her shop will sell **without limit**. Their own
setting says `Stop selling it` when they run out. It does not fire, because
there is nothing to run out of: a version that has never been counted is
UNTRACKED, not zero, and untracked means unbounded (`availability.ts`). Nothing
told her.

Then she went to check, the way she would:

| Where she looked                           | What it said                                 |
| ------------------------------------------ | -------------------------------------------- |
| **Stock → Stock**, search `Ash Overshirt`  | **Showing 1-15 of 15**                       |
| **Stock → Stock**, search `ASH-OVERSHIRT-` | _"Nothing matches that."_                    |
| **Sell → Products**                        | The Ash Overshirt · **20** versions          |
| **Sell → the product → Variants**          | XS · Moss · $128.00, like every other row    |
| **Set up your stock**                      | A five-step onboarding wizard. Not for this. |

Fifteen and twenty on two screens about the same shirt, and no screen anywhere
said which five were missing or why.

**The one screen that says it plainly is one she has to know to open.**
`Stock → How many you have`, the product-scoped panel, gets it exactly right per
version:

> **ASH-OVERSHIRT-XS-MOSS** — Not counted anywhere yet
> Nobody has said how many of this version you have, so your website sells it
> without limit. Count it once and it starts keeping track.
> **[ Record a count ]**

That sentence is the whole answer. But it is the twentieth card down a pane, and
the pane's own summary at the top — the part written so that "the question 'do I
have any' is settled before anyone reads a single row" — does not mention it:

> **78** To sell · **80** On the shelf · **2** Spoken for
> **1 place has nothing left** — Your website shows it as sold out and will not
> take an order for it.

78 is the total of the fifteen counted ones. The five that sell without limit
are not in it, and the red band is about the milder problem.

## What should have happened

Two things, and the software already knows both.

1. **The summary should name the mixed case.** The pane already has a dedicated
   message for the all-uncounted case ("Nothing has been counted yet — until you
   count it, your website sells this one without limit"). SOME counted and some
   not is the same news about part of the product, and it gets nothing.
2. **The Stock list should say what it is not showing.** "Showing 1-15 of 15" is
   true of stock positions and false of the question a person asks it.

## How to reproduce

Every time.

1. Console → **Sell → Products → The Ash Overshirt → Options**.
2. **Add a color** → `Moss` → pick `#6E7B4F` → **Change how it is sold**.
3. **Variants** → **Give them all the same price** → **Create them**.
4. **Stock → Stock**, search `Ash Overshirt`. Read the footer: 15, not 20.
5. Open her live shop's product page. `XS · Moss` is selectable and buyable;
   `XS · Bone`, which HAS a count and is at zero, is struck through and disabled.

## Why it matters

Devi's whole premise is that stock is finite: **"12 of a size, then it is gone."**
Returns are already 22% of her orders, and getting a return wrong loses her money
twice. Selling a Moss overshirt she has never cut loses her money three ways — the
refund, the apology, and the customer.

It is not a corner. Every version created by the bulk fill lands this way, on
every tenant, because nothing in the product-creation path writes a count.
Asking the database for versions that are on sale, must be posted, say
"stop selling it when out", and have never been counted:

```
              tenant              | buyable_but_uncounted
----------------------------------+-----------------------
 WizeWorks LLC                    |                    30
 Northwind Studio                 |                     7
 Juniper Row                      |                     5
 Thistle & Rye                    |                     4
 … eleven more tenants at 1 each
```

**60 versions across 15 businesses**, each one on sale with no number behind it.

## What is NOT wrong here

Worth saying, because the obvious fix is the wrong one and the code says so in
capitals. **A missing count must not be turned into a count of zero.**
`availability.ts` and `reservations.ts` both carry the rule and the scar:

> the first customer to press Add to cart on a product that had never been
> counted got OUT_OF_STOCK — and left behind a level row that made the variant
> genuinely, permanently sold out. One click silently converted "nobody has
> counted this" into "there are none".

And before that: a bakery typed in ten products, saw all ten On sale in her
console, and her live shop told every visitor all ten were **Sold out**. She had
bread on the counter.

So the storefront selling `XS · Moss` is correct, and writing a 0 row when a
variant is created would be a regression, not a fix. What is missing is that
nobody TELLS HER. This is a reporting defect, not an availability one.

## Where it lives

The rule is right in one renderer and absent in the other two.

| Renderer                                             | Mixed case         |
| ---------------------------------------------------- | ------------------ |
| the shop (`availability.ts`)                         | correct, by design |
| `commerce/product-stock.tsx` — the per-version card  | correct            |
| `commerce/product-stock.tsx` — the summary alert     | **silent**         |
| `inventory/stock-list.tsx` — the list and its footer | **silent**         |

Both silences are the same shape: the EMPTY case is handled and the PARTIAL case
is not.

- `product-stock.tsx` — the alert ladder starts `levels.length === 0 ? null`, and
  a separate info Alert covers the all-uncounted product. Nothing covers "twelve
  counted, five not". Both facts are already in hand: `variants` and `byVariant`.
- `stock-list.tsx` — its own header comment names the gap: _"This list can only
  see what has a level row … so a real product typed by its real name can come
  back empty. `searchOnly` below is what lets us ask the catalog instead."_ That
  fallback is gated on `rowCount === 0`. Devi's search returned fifteen rows, so
  it never fired.

## The fix

Both silences closed, and nothing touched on the availability side.

**1. The product pane names the mixed case.** The alert slot already carried a
message for a product where NOTHING is counted; it now also covers some counted
and some not, in the same voice as the card below it:

> **5 versions have never been counted**
> Nobody has said how many of these you have, so your website sells them without
> limit and the numbers above leave them out. ASH-OVERSHIRT-XS-MOSS,
> ASH-OVERSHIRT-S-MOSS, ASH-OVERSHIRT-M-MOSS and 2 more. Record a count against
> each below and it starts keeping track.

It sits beside the counted-stock band rather than competing with it, because they
are different news: "nothing left" is a sale you will not make, "not counted" is
a sale you will make and cannot fill. `soft` rather than solid so a blue box does
not out-shout the red one above it.

**2. The stock list says what it is not showing**, in a band above the table:

> **5 versions you sell have never been counted** · **[ Count them ]**
> Your search matched them, but this list only holds what you have counted, so
> they are not below. Until somebody counts them, your website sells them without
> limit. ASH-OVERSHIRT-L-MOSS, ASH-OVERSHIRT-M-MOSS, ASH-OVERSHIRT-S-MOSS and
> 2 more.

**A band and not a filter chip, deliberately.** A chip is something you have to
know to press, and not knowing is the entire defect. **Count them** appears only
when one product accounts for all of them — the ordinary case, since this arrives
by adding a color to a shirt that already sells — and opens that product's stock
pane. Across products there is no one place to send somebody, so the sentence
says where to look rather than a button that guesses.

The band is held back while a location is chosen: an uncounted version is at no
location, so answering it under "Main Warehouse" would answer a question nobody
asked.

**3. A question nobody could ask.** `GET /v1/inventory/uncounted` →
`listUncounted`. It could not be a filter on the level list, which starts
`FROM inventory_levels` — a version with no level row is not a row that query can
return however it is narrowed. It reads the catalog side instead: on sale, not
deleted, `inventoryLevels: { none: {} }`, with the same `q` needle the stock list
already uses so one search box asks both. Draft products are excluded, because an
uncounted version of something not on sale is not a promise anybody can take up
and listing it would bury the ones that are.

The row carries `inventoryPolicy`, which is the setting that is NOT being
honoured: `deny` means "stop selling it", and it never fires while there is
nothing to run out of.

**What was NOT changed:** anything about availability. No level row is written on
variant creation, and `computeAvailability` still treats never-counted as
untracked. See the section above — that is the rule, and the two comments in
`availability.ts` and `reservations.ts` are the record of what happens when it is
broken.

### Where the code changed

- `wizeworks/packages/inventory/src/services/public-api.ts` — `listUncounted`,
  `UncountedVariantRow`, `ListUncountedFilter`
- `wizeworks/packages/inventory/src/services/inventory-service.ts` — re-export
- `wizeworks/services/api-rest/src/routes/v1/inventory/api.ts` —
  `GET /v1/inventory/uncounted`, registered before the `:variant_id` route
- `{piggles,sparx}/apps/workbench/surfaces/inventory/data.ts` —
  `useUncountedVariants`, `UncountedVariant`, `listCodes`
- `{piggles,sparx}/apps/workbench/surfaces/inventory/stock-uncounted-band.tsx`
  (new) + `stock-list.tsx`
- `{piggles,sparx}/apps/workbench/surfaces/commerce/product-stock.tsx` — the
  mixed-case alert + `listNames`
- Tests: `wizeworks/packages/inventory/test/integration/uncounted.test.ts` (5),
  `{piggles,sparx}/apps/workbench/surfaces/inventory/data.test.ts` (5 each)

Guards run red: removing the "no level row" condition reddens four of the five,
leaving the draft/removed case green — the green twin, since it turns on a
different condition — and breaking the on-sale condition reddens all five.

## Confirmed by

P03 · Juniper Row · act 107, closed end to end on her own screen.

The band appeared on **Stock → Stock** cold, reading **38 versions you sell have
never been counted**; searching `Ash Overshirt` narrowed it to **5** and offered
**Count them**, which opened The Ash Overshirt's stock pane. Six of each Moss
size went in through **Record a count** — "ASH-OVERSHIRT-XS-MOSS counted · Now
recorded as 6 units at Main Warehouse" — and the pane's summary went **78 → 108
to sell** with the "never been counted" band gone, which is the fix's own
opposite state.

Her live shop then read correctly: `XS · Moss` buyable with six behind it, beside
`XS · Bone` struck through as **sold out** at a counted zero. The five that had
been selling without limit are now the finite run she actually cut.

## Rating effect

`Sell › Product › How many you have` and `Stock › Stock` — recorded in
[rating.md](../rating.md).
