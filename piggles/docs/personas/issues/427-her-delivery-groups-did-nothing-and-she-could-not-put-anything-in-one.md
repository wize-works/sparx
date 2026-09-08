# 427 — Her delivery groups did nothing, and she could not put anything in one

**Status:** fixed
**Severity:** blocker
**Found by:** P03 · Juniper Row · act 91
**Surface:** mypiggles › Sell › Postage and delivery — and every checkout on the platform
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi ships flat rate, free over $150, US only. That part was already set up. What
she wanted next is the ordinary next thing for someone who sells coats and
scarves out of the same studio: **coats cost more to send.**

**Sell › Postage and delivery** says she can do exactly that:

> **Product groups.** Most shops need just one. Add another only if some products
> ship differently — bulky freight, or anything that needs a signature — **so
> they can be priced on their own.**

So she did it. New group, "Coats and heavy knits". Back to her US domestic
region, **Add a delivery option**, and the form now offered a control that was
hidden before — **"Which products it applies to"** — set to her new group. Coat
delivery, $25.

Then she looked at her own checkout, with a scarf, a shirt and a knit in the
basket. **Nothing in it was in the coats group.** Checkout offered:

> Delivery · 4 days — Free
> **Coat delivery — $25.00**

**Delivery groups were ignored completely.** `rateShipment` walked every rate in
every matching zone and never once looked at which group the rate belonged to.
Every group's price was offered to every basket.

Then the second half, which is worse: **there was no way to put a product in a
group at all.** Not on the product's seven tabs, not anywhere in the console —
and no API route either. `assignProductsToProfile` exists in the commerce
service and nothing has ever called it. The group screen's own promise —
"You add products to the group from each product later" — had no later.

So the feature was three-quarters built and shipped: create a group, price a
group, and then either leak that price onto everybody or leave the group empty
forever.

Two more, on the same screens, found on the way:

- The shipping list labelled **any** group with no members "All other products".
  A brand-new empty group therefore claimed the whole catalog on the one screen
  an owner checks her delivery prices on.
- The group's own pane said **"No products yet"** for the very group the list
  called "All other products". One of them had to be wrong.

## What should have happened

A group's delivery options reach the baskets that group covers, and no others.
And a product can be put in a group, because the screen says it can.

## How to reproduce

Every time, before the fix.

1. Sell › Postage and delivery › **Add a group**, name it anything.
2. Open the **US domestic** region › **Add a delivery option**, choose the new
   group, price it $25, add it.
3. On the shop, put ANY product in the basket and reach the delivery step.
4. The $25 option is offered, for a basket with nothing in that group.

## Why it matters

Wrong money, in both directions, on the screen a customer sees.

A coats surcharge offered on a basket of scarves is a shopper being asked for
$25 they do not owe — and Devi never sees it, because she is not the one at the
checkout. The other direction is worse for her: a group priced CHEAPER than
standard (a small-parcel rate for jewellery, say) would have been offered on
every order in the shop, and she would find out from her postage bill.

It is also a promise made in writing on two screens and kept on neither.

## Where it lives

- `wizeworks/packages/commerce/src/services/shipping-service.ts` — `rateShipment`
- `wizeworks/packages/commerce/src/services/product-service.ts` — the product read + update
- `wizeworks/packages/commerce-schemas/src/products.ts` — `UpdateProductInput`
- `piggles/apps/workbench/surfaces/commerce/product-attributes.tsx` — and its sparx twin
- `piggles/apps/workbench/surfaces/commerce/shipping.tsx`, `shipping-profile-detail.tsx`

## The fix

**The rule is a pure module with its own tests**, because it decides money and
because a rule about money needs a test that can go red:
`shipping-profile-match.ts`, 20 tests, mirrored nowhere — it lives in the shared
commerce package, so both brands get it.

1. Each item resolves to ONE group: its own, else its product's, else its
   collection's, else no group.
2. The shop's **oldest** group is the fallback — everything not filed elsewhere
   ships under it. That is what the list means by "All other products", and every
   shop is created with one, which is why an ordinary shop never has to think
   about groups.
3. An option is offered only if its group is present in the basket.
4. A basket that MIXES groups is priced by the group that costs the most to
   send, because one parcel has to satisfy the strictest thing in it. A coat and
   a scarf in one box is still a coat-sized box.

**Rule 4 is a decision, not a discovery, and it is worth saying so.** The other
answer is to split the order into one parcel per group and add the prices up.
That is split fulfilment, it changes the checkout UI, and it is not something to
infer from a basket — so this takes the safe direction, which never
under-charges her.

`rateShipment` now takes what is in the parcel, and all three callers say:
`quoteForCart` (the shopper), `quoteOutboundRates` (staff buying a label) and the
market quote. A caller that cannot say gets the fallback group only — an unknown
parcel is priced as ordinary goods rather than being offered every group's price.

**Putting a product in a group** is a new field on the product: `shippingProfileId`
on the product PATCH, at most one per product (the join table allows several and
pricing cannot answer for a product in two), `null` to clear it. The control is
**Details › How this one is delivered**, and it hides itself when the shop has
only its standard group — a picker with one option is a question with one answer.

**One definition of the default.** `defaultProfileId()` is the single function;
the rate matcher and both screens read it. The list now says "All other
products" for that group and "Nothing in it yet" / "N products" for the rest, and
the group's own pane says the same thing.

**While in these files** (root RULE #4): three `color="neutral"` uses removed —
a member-count badge, a Try again, and the unpicked half of a chip. All three
now render colorless, which is the right ink and needs no approval.

### The rule was wrong once, and the screen caught it

The first version made the fallback "the group with no members". That is right
for a shop with one group and wrong the second an owner makes another: there are
then TWO empty groups, and an empty group is the same shape whether it is the
shop's default or one made a minute ago. It made **Coats** the fallback for a
basket of scarves, and rule 4 then priced the scarves as coats — the same defect
turned around. Twenty tests were green when that happened; **looking at the
checkout is what found it.** Age is unambiguous, needs no column, and does not
move under her.

## Confirmed by

Re-ran act 91 as the shopper, on her own site, twice:

> **Basket of scarf + shirt + knit, none in a group** — checkout offers
> "Delivery · 4 days — Free" and nothing else. The $25 coat option is gone.
>
> **Then, as Devi:** the Marlow Knit ("heavyweight British lambswool") →
> Details › How this one is delivered → **Coats and heavy knits** → Save, "Saved
> just now". Back to the same basket, which now contains that knit: checkout
> offers **"Coat delivery — $25.00"** and nothing else. Mixed basket, dearer
> group, one price.
>
> **Sell › Postage and delivery** now reads "Coats and heavy knits — 1 product"
> and "US domestic — standard goods — All other products". The group's own pane
> agrees: "1 product" on the coats group, "All other products" on the default.
> Checked in dark, in light, and at 356px, where the pane keeps Save and the
> overflow on one row.

commerce 153 tests, piggles 128, sparx 53; commerce, commerce-schemas, api-rest
and both consoles clean on tsc and lint.

## Rating effect

Sell › Delivery profile — Design 8, Ease 3 → 8 in [rating.md](../rating.md).
