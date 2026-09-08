# 410 — She reloaded, and the panel told her to choose a product that was already open

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 83 · pressing F5 while reading a customer review
**Surface:** mypiggles › Sell › Reviews & questions, and every other product panel
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** pressed F5 with the panel open; it came back on The Ash Overshirt with the review still there

## What happened

Devi had a four-star review open in **Reviews & questions**, deciding whether to
put it on her website. She pressed F5.

The workspace came back exactly as she left it — same five tabs, same order,
**The Ash Overshirt open two tabs to the left**. And the panel said:

> **Choose a product first**
> This panel shows reviews & questions for one product at a time. Open a product
> and it will follow along.

She had opened a product. It was on the screen.

## What should have happened

A workspace that restores should restore what each panel was looking at. If the
layout is worth keeping across a reload, so is the one thing that makes the
panel mean anything.

## Why it matters

Nothing was lost, which is why this is minor. But the sentence is wrong in a way
that costs her time: it describes a state she is not in, and the way out — click
the product tab, then come back — is not something the sentence suggests. It also
lands at the worst moment, on a panel that exists to hold a decision she has not
made yet.

The same shape applies to every following panel: Stock, Fitment, Trade pricing,
Listings, Dropshipping. Anyone who docks one as an inspector and leaves it there
gets an empty panel every morning.

## Where it lived

`surfaces/commerce/product-scope.tsx`. The design is deliberate and well
documented in that file's own header: a panel is **pinned** when it carries a
`productId`, and **following** when it does not. A following panel reads a
selection that a product panel announces while it holds focus.

The announcement lived only in a module variable. The layout is persisted to
`localStorage` per site; the selection was not persisted at all, so a reload
restored the panels and dropped the one value that told them what they were for.

## The fix

The selection is one id, so it is kept **beside the layout it belongs to** — same
`localStorage`, same per-site key, same lifetime. The module seeds itself from it
on load, and every announcement writes it.

Per SITE, deliberately: a product id means nothing under a different site, and
seeding a stale one would land the panel on "that product does not exist", which
reads as a deletion rather than a switch. A message arriving over the broadcast
channel from another tab is NOT persisted, because that tab has already stored it
under its own site's key.

Reads and writes are both wrapped: a private window, cleared site data, or a
browser refusing storage falls back to the state this panel already handles well.

**sparx's console got its own copy**, not an import — neither brand tree may
depend on the other.

## Confirmed by

Driven as Devi:

> Opened The Ash Overshirt so the panel announced, and read the key back:
> `piggles-console-product-selection:primary = {"productId":"e6d5e1f0-…","title":"The Ash Overshirt"}`.
>
> Pressed F5. The dock tab came back reading **"Reviews & questions · The Ash
> Overshirt"**, and opening it showed Marguerite's review still waiting, still
> badged **Waiting for you**.
>
> Before the change, the same sequence gave "Choose a product first".

## Still open

- **sparx's copy is not driven on screen.** It typechecks and it is the same
  code doing the same thing, but nobody has reloaded a sparx workspace and
  looked. Recorded, not dressed up.

## Rating effect

Folded into `commerce.product.reviews` in [rating.md](../rating.md).
