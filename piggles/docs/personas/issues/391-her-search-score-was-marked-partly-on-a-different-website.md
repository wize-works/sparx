# 391 — Her search score was marked partly on a different website

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · opening How people find you, an unrated pane
**Surface:** mypiggles › Get Found › How people find you
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** two of her sites, each now reading its own numbers

## What happened

Devi opened **How people find you** on her shop and read:

> **Average score 76 → shown as 77**, across **42 pages → shown as 51**

Nine of those pages are not her shop's. They belong to **Juniper Row Archive**, a
different website with different content on a different address — and their
scores were in her shop's average, moving the one number the screen exists to
give her.

Every site of hers showed the identical **51 / 77**, the same way [[385]] showed
every site the same labels and [[387]] the same bylines. Fifth of the family.

## Why it happened

`seo_audits` carries a `property_id`. The table has **four indexes and not one of
them mentions it**, which is the tell: nothing had ever queried by it. Both SEO
routes — the stored-scorecard list behind the four tiles, and the checklist and
activity roll-ups beside them — read the table with no site predicate at all.

## The predicate had to be two-tier, and getting that wrong would have been worse

Her 51 audits split by what kind of thing they score:

| Kind                                  | Carries a site? | Count              |
| ------------------------------------- | --------------- | ------------------ |
| `builder_page`                        | yes             | 22 shop, 9 archive |
| `cms_page` / `product` / `collection` | **no**          | 20                 |

The second row is not a bug. Those entities express their site visibility through
**junction tables** rather than a column, so a null on the audit row means "not
pinned by this row" — not "belongs nowhere". Filtering on `property_id = <site>`
alone would have removed **20 of her 42 pages** to fix a 9-page error, and the
score would have moved again for a new wrong reason.

So the predicate is the platform's usual two tiers: this site's rows, plus the
unpinned ones. Applied to all three reads behind the one screen — the tiles, the
"What to work on" roll-up, and "Recently checked" — because scoping one and not
the others is a screen that disagrees with itself.

## Confirming it

Driven as Devi on two of her sites, each checked against the database first:

| Standing on         | Was     | Now         | The truth |
| ------------------- | ------- | ----------- | --------- |
| Juniper Row         | 51 · 77 | **42 · 76** | 42 · 76   |
| Juniper Row Archive | 51 · 77 | **29 · 81** | 29 · 81   |

And "Pages to improve" now reads **14** on her shop and **0** on Archive — where
it correctly says "all pages in good shape" rather than a bare zero.

**Three integration tests.** Proved red: with the scope predicate returning `{}`,
all three fail.

## Still open

- **The residual, stated rather than hidden.** An entity pinned to ANOTHER site
  still counts here, because its audit row does not carry the pin — only the
  junction does. On her account that residual is **zero** (the five pinned
  collections are pinned to both sites), but it is real. Closing it means the
  indexer stamping `property_id` for those three entity types, which changes what
  is WRITTEN rather than what is read, and would want a backfill.
- **Nothing re-scores when a page moves sites.** The stored scorecard keeps
  whatever `property_id` it was written with.
- **`seo_audits` still has no index on `property_id`.** Every read now filters on
  it, so the four indexes are all missing the column the queries use. Fine at her
  volume (51 rows); a migration, so not run here.
- **Rescan the site** was not driven. The button is there and the reindex route
  is unchanged by this fix, but I did not press it, so what it does to the numbers
  is not checked (RULE #4).
