# 430 — She could issue a gift card and nobody could ever spend it

**Status:** fixed
**Severity:** blocker
**Found by:** P03 · Juniper Row · act 93
**Surface:** mypiggles › Sell › Gift cards — and her shop's basket
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

**Sell › Gift cards** is a complete screen. Its empty state says what a gift card
is, in her words:

> A gift card lets someone pre-pay an amount **for another person to spend with
> you**. Issue your first one to get started.

The issue form repeats the promise:

> Load an amount onto a new card and, if you like, say who it is for. A unique
> code is created for you. Share it with the recipient so they **can spend it at
> checkout**.

So I issued one. $150, for Nadia Ashcombe, with a birthday message. The card
came back **QM44-2DTN-6HM4-6RA9**, balance $150.00, and a green badge reading
**Ready to spend**.

Then I went to her shop, filled a basket, and typed the code into the only code
box on the page:

> **No active discount for code "QM44-2DTN-6HM4-6RA9"**

**A gift card could not be spent anywhere.** Not in the basket, not at the
checkout, not by any route:

- `applyGiftCardToCart` — **zero callers in the entire repo.**
- `redeemGiftCard`, which takes the money off the card — **zero callers.**
- No API route to apply one. The gift-card routes are list, create, lookup, get
  and adjust; there is nothing to spend against.
- The word "gift" does not appear anywhere on the checkout page.
- `cartSnapshot.appliedGiftCardCodes` was hardcoded `[]`.

The money went one way. She could load a card, hand a customer the code, and
that customer had no way on earth to use it — while her books carried the
liability.

## What should have happened

A code she is told to share is a code a customer can spend.

## How to reproduce

Every time, before the fix.

1. Sell › Gift cards › Issue a gift card. Load any amount.
2. Copy the code.
3. On the shop, fill a basket and type the code into the code box on the basket.
4. "No active discount for code …". There is nowhere else to try it.

## Why it matters

This is money she has taken and cannot honor. A shopper who buys a $150 card as
a birthday present has paid; the recipient turns up and the shop refuses the
code. Devi finds out from a stranger, opens the pane, sees **Ready to spend** and
**$150.00**, and has nothing to tell them.

It is the same shape as [428] (tax) and [427] (delivery groups) and the third one
today: a finished, well-worded screen sitting on a service function nothing ever
called. See [[feedback_screen_over_a_function_nobody_calls]].

## Where it lives

- `wizeworks/packages/commerce/src/services/discount-service.ts` — apply/redeem
- `wizeworks/packages/commerce/src/services/gift-card-reservation.ts` (new)
- `wizeworks/packages/commerce/src/services/checkout-service.ts` — placement
- `wizeworks/packages/commerce/src/services/cart-service.ts` — the snapshot
- `wizeworks/services/api-rest/src/routes/v1/public/cart.ts` and `checkout.ts`
- `wizeworks/apps/site/components/code-field.tsx` (new), `cart-view.tsx`,
  `cart-provider.tsx`, `checkout/order-summary.tsx`

## The fix

**One box, either kind of code.** A shopper is holding a code. She does not know,
and should not have to know, whether the shop filed it as a discount or as a gift
card — so the basket's box is now **"Discount or gift card code"**, and the
server tries a discount first and then the cards. The discount goes first
deliberately: an unknown discount code costs the shopper nothing, while reserving
the wrong gift card takes money off somebody's balance. `POST …/cart/:id/code` is
the new endpoint; `…/discount` is kept as an older name for the SAME handler, so
the two can never answer differently.

**Applying reserves; placing the order debits.** The card is held against the
basket and the balance only moves when the order is written, so an abandoned
basket leaves the card whole and there is no reversal step to get wrong. A chip
with the code sits under the total, with an × that takes it back off.

**A card is money, not a discount — so it is recorded as a payment.** The order's
own total stays the value of what was sold ($67.00 for a scarf and its postage);
the $40 that came off the card is an `OrderPayment` with processor `gift_card`
and the code as its reference. That is what makes "Still owed" right. Booking it
as a discount instead would understate revenue and the tax base with it.

**Three things were quietly wrong on the way through, and all three are fixed:**

- The reservation capped against the RAW line prices, ignoring every discount on
  the basket — so a $150 card on a $200 basket with $80 off reserved $150 against
  a $120 bill and reported that inflated figure to its caller.
- Applying a card never recomputed the basket, so the total would not have moved
  on screen.
- A checkout session never re-read the card from its basket, so a code applied
  after checkout began would have shown in the cart and vanished at the till.

**The code is now on its own pane.** Piggles showed it NOWHERE: the toast that
announced it faded, the browser tab truncated it, and the pane she opens to give
a customer their code did not contain it. It is now the identity heading, in
mono, with a copy button — the one thing on that screen that has to leave it
character-perfect. (sparx already had the heading; it gains the copy button.)

29 new tests in commerce.

## Confirmed by

Ran it end to end, twice, as the shopper and then as Devi.

> **$40 card, typed in lower case**, on a $58 scarf: Subtotal $58.00, **Gift card
> −$40.00**, chip `969G-HVUS-BCAT-7PW2` with an ×, Estimated total **$18.00**.
> Through checkout: Shipping $9.00, **Total $27.00**, and the button read
> "Place order — $27.00 to pay".
>
> **The database, after:** card balance **0**, status **spent**, ledger showing
> `+15000 issue` then `-4000 redeem` against the order. Order **O-000016**: total
> **$67.00**, amount paid **$40.00**, status **partially_paid**.
>
> **Her order pane:** "**$27.00 still owed** — $40.00 of $67.00 has come in so
> far", and under **Money in**: "**$40.00 · Gift card** · 969G-HVUS-BCAT-7PW2 ·
> Taken".

## Left open, and named rather than parked

**A gift card cannot be taken at the counter.** Record payment offers Cash,
Check and Wire transfer, and the till's payment methods are the same list. Adding
"Gift card" as another WAY there would be worse than the gap — it would write
money in against an order without taking anything off a card, which is a new way
to get the books wrong. Taking one in person needs the code, a balance check and
the debit, exactly as the basket now does. That is a capability to add, not a
defect to patch, so it is named here.

**One order carries the debit without the credit.** O-000015 was placed while
this fix was half-built: $150 came off card QM44-2DTN-6HM4-6RA9 and the order was
still written asking for the full $659. It is test data made by this session, not
a shop's real order, and it is recorded here rather than quietly repaired.

## Rating effect

Sell › Gift cards — Design 8, Ease 2 → 8. Gift card — Design 7 → 8, Ease 3 → 8.
Recorded in [rating.md](../rating.md).
