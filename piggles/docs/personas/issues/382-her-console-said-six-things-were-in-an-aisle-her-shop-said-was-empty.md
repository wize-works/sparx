# 382 — Her console said six things were in an aisle her shop said was empty

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · opening Categories, then opening the same category on her own website
**Surface:** mypiggles › Shop › Categories (and the category's own pane)
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** all eight of her stocked aisles, each now printing the number her shop page prints

## What happened

The Categories screen has three columns: the aisle, whether it is featured, and
**Products**. Devi read hers:

| Category  | Console said |
| --------- | ------------ |
| Apparel   | 9            |
| Goods     | **6**        |
| Knitwear  | 3            |
| Tops      | 4            |
| Trousers  | 3            |
| Outerwear | 2            |

Then opened the same aisles on her own website:

| Her shop page        | What a customer sees                                      |
| -------------------- | --------------------------------------------------------- |
| `/category/goods`    | **"0 products"** · _Nothing here yet_ · [Browse the shop] |
| `/category/knitwear` | **"1 product"** — the Marlow Knit, alone                  |

**Seven of her eight stocked aisles overstated.** Only Belts was right. Her
console added up to 32 products across her categories; a shopper walking the same
categories finds **15**.

Goods is the worst shape of it. Six products are filed there, **every one of them
archived**, so the aisle is an empty room with a sign on the door — and the one
screen that exists to tell her that said six.

## Why it happened

`categoryService` reported the count as `_count.products`: the number of rows in
the `commerce_category_products` join table.

A filing row records _"this product belongs under this heading."_ It is not
touched by any of the four things that take a product off the website:

| What she did                             | Filing row | On the website |
| ---------------------------------------- | ---------- | -------------- |
| archived last season's Fisherman Knit    | stays      | gone           |
| saved a new piece back to draft          | stays      | gone           |
| deleted a product (soft-delete)          | stays      | gone           |
| kept a product for her Archive site only | stays      | gone from here |

So the column answered _"how many filing rows point here"_ while every person
reading it asked _"how many things are in this part of my shop"_. Two different
questions, one number, and the number was the one nobody asked.

The site dimension matters more here than it looks: Devi runs **seven** sites off
one business. Apparel read 9 because nine products are filed there; seven are on
Juniper Row and two are kept for the Archive.

This is the same shape as [[381]] one screen over — a number that describes the
bookkeeping rather than the thing, read by a person as if it described the thing.
And `site-visibility.ts` had already written the diagnosis in its own header
about a different reader:

> three readers, one of them implementing the rule, and nothing making them
> agree.

The product count was a fourth reader implementing none of it.

**Nothing caught it because nothing asserted on it.** The field shipped, two
surfaces read it, and there was not one test on its value.

## The fix

**Count the products, not the filing rows.** `visibleProductCounts` groups over
`categoryProduct` joined to the product, using the same predicate the storefront
itself uses (`status: 'active'`, `deletedAt: null`, plus per-site visibility when
a site is in scope). One grouped query for the whole tree, because that endpoint
returns every category in a single response.

Two fields now, because there really are two questions:

- **`productCount`** — what a shopper finds there. This kept the plain name on
  purpose: it is what any screen beside a category should print, and a future
  caller who reaches for the obvious field now gets a true statement.
- **`hiddenProductCount`** — filed here but not on the website. The two add up to
  what is filed, which is what a **delete** detaches, so the delete confirmation
  asks for the sum rather than promising to keep only the visible ones.

A truthful `0` on its own would read as _"my products have disappeared"_, so
where anything is filed-but-unshown the row says so and the tooltip says why:

> **0** · `6 not shown`
>
> _6 more products are filed under this heading but not on your website —
> archived, still a draft, or kept for one of your other sites._

The category's own pane now resolves the same site scope as the list, so the two
screens cannot answer different questions about one aisle.

## Confirming it

On her real account, every number now matches her shop:

| Category    | Was | Now                 | Her shop page |
| ----------- | --- | ------------------- | ------------- |
| Apparel     | 9   | 7 · 2 not shown     | 7             |
| Accessories | 4   | 2 · 2 not shown     | 2             |
| **Goods**   | 6   | **0 · 6 not shown** | **0**         |
| Knitwear    | 3   | 1 · 2 not shown     | 1             |
| Outerwear   | 2   | 1 · 1 not shown     | 1             |
| Tops        | 4   | 2 · 2 not shown     | 2             |
| Trousers    | 3   | 1 · 2 not shown     | 1             |
| Belts       | 1   | 1                   | 1             |

**The shared reader still works where it is not the subject.** `useCategoryTree`
is one query feeding four places, so the product editor's filing picker was
re-opened as Devi: The Ash Overshirt still reads _Filed in: Apparel, Outerwear_,
the tree renders, and Apparel is ticked.

**RULE #7, a fix travelling backwards.** `categoryService` is a shared surface, so
the earliest business it could touch was checked: Wildroot Flowers (P02) has six
stocked categories and `filed == live` on every one of them, so both the old and
the new count print the same numbers there. Checked in the database rather than
driven, because reaching her console needs her own sign-in.

**Five tests** drive the service against real rows: one product of each kind
(live, archived, draft, deleted) in one category; six archived products reading
zero; the per-site split from both sides plus unscoped; a category with nothing
filed reporting real zeroes rather than dropping out of the map; and the detail
read agreeing with the list. Proved red: with `_count.products` put back, **four
of the five fail**.

## Still open

- **The list does not roll up children.** A shopper on `/category/apparel` sees
  that aisle and everything under it; the console row counts only what is filed
  directly. It happens to make no difference on her account (measured: 9 either
  way, because her sub-category products are filed in the parent too), so this is
  a latent disagreement rather than a live one. Closing it wants a de-duplicating
  rollup, since a product filed in both a parent and its child must not count
  twice.
- **Ten empty aisles she never made.** Her tree carries `Clothing › Men / Women /
Kids`, `Footwear › Sneakers / Boots / Sandals` and `Accessories › Bags / Hats`
  from the blueprint, all at zero, on all seven of her sites. They are now
  honestly zero rather than wrongly zero, which is progress, but a womenswear
  maker should probably not have to delete somebody's guess at a shoe department.
  That is a blueprint question, not a defect in this screen.
- **The list still cannot say which sites an aisle is on.** The detail pane has
  the checkboxes; the list has no column for it, so on a seven-site business the
  one screen that shows every category shows nothing about where each one appears.
