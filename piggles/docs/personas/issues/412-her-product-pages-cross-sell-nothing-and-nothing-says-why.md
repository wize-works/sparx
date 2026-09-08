# 412 — Her product pages cross-sell nothing, and nothing says why

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 83 · split out of [411](411-the-console-promises-customer-questions-that-her-website-cannot-take.md)
**Surface:** Juniper Row › any product page · and mypiggles › My Site › Page › Each product
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

A customer who reads all the way down The Ash Overshirt — the description, the
fabric, the fit, the care, the reviews — reaches the bottom and is offered
nothing. No "you might also like", no other garment, no way onward except the
browser's Back button. Juniper Row has **eight** products.

Issue 411 recorded this as a missing rail. It is not missing. Her product page has
a cross-sell carousel on it, it is published, and it renders **nothing at all** —
not an empty heading, not a placeholder, nothing. The section is on the page and
occupies no space.

## The cause

The rail is bound to **`commerce.featured`**, and `commerce.featured` means _the
products the merchant tagged `featured`_, and nothing else. Devi has tagged none.

That source is behaving correctly and deliberately. Its fallback to the whole
catalog was removed on purpose (issue 187) because it put the catalog on the page
twice, the second time under a heading claiming a curation nobody had made. And
the heading now sits inside the visibility gate, so an empty curation hides its
heading along with itself rather than shouting "Featured" over nothing.

Every one of those decisions is right. The mistake is upstream of all of them:
**`productDetailPage()` composed the page with `featuredCarousel()`**, so the
shipped default bound a _product_ page's cross-sell to the _shop's window
display_.

That is wrong twice.

- **It is the wrong idea.** A shopper at the bottom of one garment wants others
  **like it**. What the merchant chose to lead with belongs on a home page, where
  a merchant is deciding what to put in the window. `commerce.related` is the
  source for this slot and always was.
- **It is empty by construction for a new shop.** Nobody has tagged anything
  `featured` on day one, or on day thirty. So the rail hides itself, and the
  product page ships with no cross-sell — silently. Nothing on the page says a rail
  was there, and nothing in the studio does either: the canvas draws the block, so
  an owner looking at the editor sees a cross-sell she does not have.

## What made it hard to see

All three parts read as working. The block is on the page. The studio shows it.
The source picker says "The ones you have featured", which is true. Only the live
page disagrees, and it disagrees by rendering nothing, which looks exactly like a
page that was never given a rail.

This is the shape where absence behaves like fine: an empty result and a correct
result are the same pixels, so nothing that only looks at the screen can tell them
apart.

## The fix

**`wizeworks/packages/silica-catalog/src/commerce.ts`** — a new `relatedCarousel()`
preset (`commerce.related`, carousel layout, heading "You might also like"), and
`productDetailPage()` now composes that instead of `featuredCarousel()`.

`commerce.related` is bounded, excludes the product being viewed, and is never
empty for a shop with more than one thing in it. `featuredCarousel()` stays — it is
the right preset for a home page and remains choosable in the editor — and the
block's own source picker still lets an author repoint the rail at Featured, a
category, or the whole catalog.

A test locks it: the composed PDP body must carry
`data-sui-repeat="commerce.related"` and must not mention `commerce.featured`.

**One registry, both consoles.** The default product page is shared, so sparx gets
the same correction with no second change.

## What this does NOT do

It fixes the default for every page composed from here on. It does **not** rewrite
a tenant's already-published tree — a stored tree is the tenant's, and a migration
that silently repointed a binding an owner may have set on purpose would be worse
than the bug. Devi's own page was repointed **by hand, in the studio, as her**,
which is the same one-control change any owner can make:

> Select the rail's product group → Settings → **What this shows → Products** →
> _Others from the same group_.

## Proved, on her live page

Repointed her rail and renamed its heading to her own words ("Others from the same
run"), saved, published. Her page now ends:

    … Made in | Others from the same run | Reviews | Questions

and the rail carries six real garments with photographs, names and prices, plus
working Previous/Next controls:

    /products/leather-covered-belt      Leather-covered belt   $72.00
    /products/silk-twill-scarf          Silk twill scarf       $58.00
    /products/linen-shirtdress          Linen Shirtdress      $145.00
    /products/the-everyday-tee          The Everyday Tee       $42.00
    /products/marlow-knit
    /products/sunday-trouser-wide-leg

The Ash Overshirt itself is correctly absent from its own rail.

## One thing measured on the way, recorded rather than filed

A publish took **noticeably longer to reach the site than the previous one**: the
questions block appeared after two reloads, this change after roughly six, with the
storefront serving a template that still had the deleted duplicate section in it.
The console says "Your site catches up within a few minutes", so this is inside
what it promises and is not filed as a defect. It is written down because it made
a correct fix look like a broken one for several minutes, and because "did my
change land" is a question an owner will ask.

## Rating effect

Was holding `commerce.product.reviews` down on Ease via 411 — see
[rating.md](../rating.md).
