# 401 — She could translate her shop, and no visitor could ever see it

**Status:** fixed
**Severity:** critical
**Found by:** P03 · Juniper Row · act 81 · scoring Translations, then checking her own site as a shopper
**Surface:** mypiggles › Content › Translations, and every product page on the tenant site
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** her Spanish and French wording now render on the live site, with a switcher and hreflang

## What happened

Devi opened Translations, added Spanish to the Marlow Knit, typed a Spanish name
and description, and saved. The pane confirmed it — **"Spanish saved"** — and
told her, three times, what that meant:

> Add another and shoppers reading your site in it will see your words, not a
> machine translation.

> Shown to anyone reading your site in Spanish.

> Anyone reading your site in Spanish will see it in your own language instead.
> _(the delete confirmation)_

Then she opened her own product page. It said **Marlow Knit**, in English, with
`<html lang="en">` and no hreflang. Measured every way a visitor could ask:

| Asked for                            | Got                      |
| ------------------------------------ | ------------------------ |
| `/products/marlow-knit`              | English                  |
| `?lang=es`                           | English                  |
| `/es/products/marlow-knit`           | **404 — page not found** |
| `Accept-Language: es-ES`             | English                  |
| a language switcher anywhere on site | none                     |

There was no route to it, because there was nothing to route to.

## What should have happened

What the pane says. A shopper reading in Spanish sees the Spanish words.

## Why it matters

This is a whole feature that costs a merchant real hours and returns nothing,
while telling her it worked. Devi has eight products of four fields each: an
evening of careful writing, saved, confirmed, and invisible. She would only find
out by opening her own site in Spanish — and she has no way to do that either,
because there was no switcher.

It is also the widest form of the shape this run keeps hitting: not a value
fetched and never rendered, but one **written and never read**.

## Where it lives

Everywhere except the writing. `ProductTranslation` shipped with a table, a
service, five REST routes, two MCP tools and a polished console pane. Measured
across the repository, the readers were: **none**.

- No public API route mentioned a locale (`grep locale` over
  `routes/v1/public/**` returned one comment).
- `product-service` never joined translations; nor did the universal projection.
- `wizeworks/apps/site` never referenced them at all.
- `commerce.defaultLocale` existed and was used only to format numbers and
  dates — never to choose words.

## The fix

Four parts, each in the one place that makes it propagate.

**api-rest reads them.** A new `routes/v1/public/product-locale.ts`: an optional
`?locale=` on every public product read, a select that fetches the candidate
rows for that LANGUAGE, and an overlay that picks the best one. Matching is exact
tag → bare language → any regional variant, so a shop that wrote `es` serves a
reader asking for `es-MX` rather than making the merchant write every variant
first. The overlay is **per field**, because the editor promises exactly that:
"Anything you leave empty falls back to your own words." A blank translated field
means cleared, not blank on the page.

**The site knows which languages exist.** `languages` on the public tenant
payload, derived from the translations that actually exist rather than
configured — a language is offered because a real product carries words in it,
which is the only definition that cannot go stale.

**The reader gets to choose, and the choice is shareable.** `?lang=es`, turned
into a cookie by `proxy.ts` so it sticks for the visit, with `Accept-Language`
honored when nobody has chosen. `?lang=` with no value goes back to the shop's
own words. The locale is injected into `publicGet` — **one place**, the same
place `property` is injected, for the same reason: every catalogue read has to
carry it or the shop is half translated, and thirty call sites each remembering
is thirty chances to forget. It rides in the URL, which is also the fetch cache
key, so Spanish and English are separate cached entries for free.

**And it is findable.** `<html lang>` follows the reader; `hreflang` +
`x-default` on the product page; and a plain-link switcher under the merchant's
own footer naming each language **in itself** — Español, not Spanish, because
someone who cannot read this page cannot read the English name of their own
language. It renders nothing at all for a shop that has translated nothing,
which is almost all of them, so no site gains a bar it has no use for.

## Confirmed by

Driven as Devi, and as her shopper.

> **Spanish.** `/products/marlow-knit?lang=es` → heading **Jersey Marlow**, the
> Spanish description, `<html lang="es">`, title "Jersey Marlow · Juniper Row",
> hreflang `es` + `x-default`. The shop grid shows the Spanish card too — the
> single injection point reached every catalogue read without a call site
> knowing.
>
> **French.** Added French to The Ash Overshirt through the new picker ([402]),
> saved, and `/products?lang=fr` reads **La surchemise Ash** with the switcher
> showing **American English · Español · Français**, Français marked current.
>
> **Back out.** Clicking "American English" (`?lang=`) returns the English
> heading, `lang="en-US"`, the cookie cleared, and NO translated string anywhere
> on the page.
>
> **Per product.** In French, the six untranslated products keep their English
> names beside the translated one — the fallback is per product and per field,
> not all-or-nothing.

Twelve unit tests on the overlay and matching, thirteen on the reader's language
— both files proved red by breaking one line each.

## Still open

- **Only PRODUCTS have translations.** There is no table for a page, a
  collection, a category or a journal post, so a translated shop is a translated
  CATALOGUE inside otherwise-English chrome. That is a capability question, not
  a defect, and it is named here rather than implied.
- **Locale path prefixes (`/es/…`) were deliberately not built.** `?lang=` is
  shareable and needs no route restructure across 41 route files; a prefix is a
  URL-strategy decision with hreflang and canonical consequences.
- **The switcher's placement is platform chrome**, under the merchant's footer.
  A merchant cannot move it or restyle it yet.
- **Locally, a new language takes up to five minutes to be offered**, because
  the cache-revalidation worker is not running on this machine. The chain is
  complete in production: the translation write publishes `product.updated`, the
  worker maps that to the `commerce` scope, and the storefront's revalidate
  route purges `tenant:<slug>` alongside it — which is the tag the `languages`
  list rides on. Verified by waiting the TTL out rather than assumed.
