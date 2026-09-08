# 378 — Searching her own site could not find a single thing she wrote

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · searching her site for the word her own footer links
**Surface:** juniper-row.piggles.site › /search
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** the same searches, now returning her Return Policy and her articles

## What happened

A customer wants to know what happens if a shirtdress does not fit. Her footer
links **Return Policy**, **Returns** and **Shipping and returns**, so they type
"returns" into her search box:

> **No results for "returns"**
> Check your spelling or loosen the filters.
> [ Browse all products ]

Same for everything she has ever written:

| Searched for | What she has                      | What search said |
| ------------ | --------------------------------- | ---------------- |
| returns      | a Return Policy, in her footer    | nothing          |
| privacy      | a Privacy Policy, in her footer   | nothing          |
| knitwear     | "Caring for knitwear so it lasts" | nothing          |
| fabric       | "How to read a fabric"            | nothing          |

Products were found perfectly. The `entities` index that everything else is
supposed to come from held **30 documents platform-wide and not one of them was
a page or an article** — 16 products, 6 categories, 4 collections, and a handful
of warehouses and discounts.

## Why it happened

The page already had a "Pages & collections" strip, already called the right API,
and already rendered a result list. The strip could simply never be non-empty,
for two independent reasons that each hid the other.

**1. The `cms_page` projector read a table with no rows in it.**

```ts
const rows = await tx.page.findMany({ select: { id: true } });
```

`Page` is the deprecated model; the live one is `content_entries`. `select count(*)
from pages` returns **0** across the whole database. So the projector produced no
document for any tenant, ever. The SEO audit had always resolved `cms_page` against
`contentEntry` — this one file never moved.

The public search's URL lookup read the same dead table, so even a hit that somehow
existed would have been dropped for having no address.

**2. Articles were indexed under a name public search excluded.**

`contentEntryProjector` covers every content type EXCEPT `page`, and files them as
`cms_entry` — deliberately, because it believed `cmsPageProjector` handled the rest.
But:

```ts
const PUBLIC_ENTITY_TYPES = ['product', 'collection', 'cms_page'];
```

`cms_entry` is not in the list. So every blog post, case study, event and help
article a tenant writes was indexed and then filtered out of the search its own
visitors run.

Between the two, a shop's content was covered by a projector pointed at nothing and
a type name nobody let through.

## The fix

- **`cmsPageProjector` reads `ContentEntry` where `typeKey = 'page'`** — the rows it
  was always meant to cover, and the ones its sibling deliberately skips. The two
  now partition the content between them instead of leaving a hole.
- **`cms_entry` joins `PUBLIC_ENTITY_TYPES`**, so a shop's articles are findable.
- **Both resolve their address from the content type's own `urlPattern`** —
  `/{slug}` for a page, `/blog/{slug}` for a post, `/careers/{slug}` for a job.
  A type with NO pattern (an FAQ, a testimonial, a recipe) is skipped: those are
  composed into other pages, so a hit on one must never be offered as a link to a
  page that does not exist.
- **Each hit carries the tenant's own name for its type** — "Blog post", "Page",
  "Event". One `cms_entry` can be any of ten kinds, and the entity type alone can
  only label them all "Result".

### And the page then contradicted itself

With pages findable, the search page said two opposite things at once: **Return
Policy** at the top, and **"No results for 'returns'"** filling the middle. The
count and the empty state were both about products and both phrased as if about the
whole search, which was invisible for exactly as long as the strip was always empty.

Both now say what they count — "0 products for 'returns'", "No products match
'returns'" — and the empty state points at the strip when the strip has something:
_"Nothing in the shop, but the pages above matched."_

The strip's markup was rebuilt while it was open: it painted with five inline
`style` props including a 12px label at `opacity: 0.6`, which is faded ink on text a
shopper is meant to read. It is utilities and a real badge now.

## Confirming it

On her live site, after one **Put them back** from her own products screen:

| Searched | Before  | After                                                     |
| -------- | ------- | --------------------------------------------------------- |
| returns  | nothing | **Return Policy** · Page → `/returns-policy`              |
| privacy  | nothing | **Privacy Policy** · Page → `/privacy-policy`             |
| knitwear | nothing | the collection, **and** "Caring for knitwear" · Blog post |
| fabric   | nothing | "How to read a fabric" · Blog post                        |

The index went from **30 documents with no content in it** to 238, including
**6 `cms_page`** (her six policies) and **21 `cms_entry`**. Every returned address
loads (200 on all five checked). Nine tests on the type list and the address
builder.

## Still open

- **Builder pages are in no index at all.** Searching "Larimer" — her studio
  address, printed on her About page and her Contact page — still returns nothing,
  because those are `builder_pages` and there is no projector for them. It is the
  same shape as this issue and the larger half of it: most of what a visitor reads
  on a site lives in builder pages, not CMS entries.
- **The console's "searching won't find N of your products" notice counts only
  products.** It is the one place that would have said this out loud, and it cannot:
  a shop whose every page and article is missing from search is told nothing. It
  also counts across ALL sites while sitting on a site-scoped list — hers read
  "won't find 15 of your products" above a list of seven.
- **The strip is titled "Pages & collections"** and can now also carry blog posts,
  events and job postings. It wants a name that covers them.
