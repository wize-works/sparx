# 420 — A translation she had barely started looked exactly like a finished one

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 86 · scoring Translations
**Surface:** mypiggles › Content › **Translations** — the Languages column
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

The Translations list has one job: tell her what still needs translating. Eight
products, and the Languages column read:

    Marlow Knit          Spanish        (green)
    The Ash Overshirt    French         (green)
    The Everyday Tee     Spanish        (green)
    …five others         Not translated

Three green badges. Three products she would take as done.

They were not the same. Measured on the screen, by adding Spanish to The Everyday
Tee and filling in **only the name**:

| Product           | Badge     | Actually written         |
| ----------------- | --------- | ------------------------ |
| Marlow Knit       | `Spanish` | name **and** description |
| The Ash Overshirt | `French`  | name **and** description |
| The Everyday Tee  | `Spanish` | **name only**            |

Identical badges. A Spanish shopper opening The Everyday Tee reads a Spanish
title and then an English paragraph.

## Why it happens every time, not occasionally

The name is the **only field a translation cannot be saved without** — the editor
says so under the box: _"Required — a language with no name for the product cannot
be saved."_ So a translation row existing means exactly one thing: the name is
done. Nothing more.

And the badge was built from the row's existence:

```ts
byProduct.set(id, result.data.map((row) => row.locale).sort(…));
```

One `.map` to the locale tag, and every other field on the row thrown away. The
list then rendered a `success` badge for any non-empty list.

So the worst case is not a rare one, it is the ORDINARY one: an owner working
through eight products types eight names in one sitting, comes back to eight green
badges, and reasonably concludes her shop is in Spanish.

## What made it invisible

A started translation and a finished one produce the same pixels, so nothing that
only looks at this screen can tell them apart — and the console never shows her
the shopper's view. She would have to open her own site in Spanish, product by
product, to find out.

## The fix

Everything needed was already in the response. `ProductTranslation` carries
`description`, `seoTitle`, `seoDescription` and `updatedAt`; only the `.map` was
discarding them.

**`translations-data.ts`** — `useCoverage` now returns the whole row per language
instead of just its tag, plus three small helpers: `unfinishedLanguages`,
`unfinishedNote` and `lastTranslatedAt`.

**`translations-list.tsx`** — two colors, because there are two states worth
telling apart:

- **green** — a reader gets this product in their language;
- **amber**, with a line under it saying what is missing — a reader gets its name
  and then your own words.

> **Spanish**
> Spanish has no description yet

The two SEO fields are deliberately not counted. They fall back too, but to words
a shopper only meets on a results page, and flagging them would mark nearly every
row unfinished — which would make the mark mean nothing.

No new endpoint and no extra request: the same query, read properly.

## Proved, on the screen that produced it

Added Spanish to The Everyday Tee and saved with only the name filled in, exactly
as an owner working at speed would. The list now reads:

    Marlow Knit          Spanish                       (green)
    The Ash Overshirt    French                        (green)
    The Everyday Tee     Spanish                       (amber)
                         Spanish has no description yet

Checked in dark, in light, and at 360px in an injected iframe.

## Rating effect

Feeds `cms.translations` — see [rating.md](../rating.md).
