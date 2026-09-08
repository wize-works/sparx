# 389 — One screen said she had 21 posts, and the next said 3

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · opening Kinds of content, an unrated pane
**Surface:** mypiggles › Content › Kinds of content
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** the same two screens now agreeing, on two of her sites

## What happened

Standing in her shop, Devi opened **Kinds of content** and read:

> **Blog post** · `blog_post` · **21 entries**

Then **Content**, two clicks away on the same site:

> Showing 1–9 of 9 — three blog posts, six pages

Three posts, not twenty-one. The other 18 were written for her Press and Sample
Sale sites, which are different websites with different readers.

The number is the fourth of its family in three days ([[382]] counted filing rows,
[[385]] counted every site's labels, [[387]] listed every site's bylines) and the
shape is identical: **a count that describes the whole business, printed on a
screen that is scoped to one site.**

## Why it happened

`/v1/content/reports/summary` computed six aggregates and every one of them read
`where: { deletedAt: null }` — no site scope anywhere in the endpoint.

The platform already had the rule, named and shared:

```ts
// @wizeworks/db — contentSiteVisibilityWhere
{
  OR: [{ propertyLinks: { none: {} } }, { propertyLinks: { some: { propertyId } } }];
}
```

An entry linked to no site belongs to every site; one linked to sites belongs
only to those. Four other reads use it. This one never did.

Her **Page · 6** was right by accident — all six legal pages are linked to no
site, so "every site" and "this site" happen to agree.

## The count had to come in TWO, and that is the whole design

The same number feeds the **delete warning**, and there it must NOT be scoped:

```ts
// content-types-service.ts — the server's guard
const inUse = await tx.contentEntry.count({ where: { typeKey: key, deletedAt: null } });
if (inUse > 0) throw conflict(`Cannot delete "${key}" — ${inUse} entries still use it.`);
```

That guard is tenant-wide and correct. So scoping the count on its own would have
produced the exact hazard [[385]] produced pointing the other way: on a site
holding none of a type's entries the pane would say **"No entries yet"** above a
Delete button, and the server would refuse it with nothing on screen to explain
why.

So the endpoint now serves both — `count` for the site, `allSitesCount` for the
business — and `byType` is keyed off the **unscoped** groups, so a type whose
entries all live elsewhere still gets a row rather than vanishing from the very
screen that would explain its refusal.

The pane says both, in her words:

| Where           | Reads                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| the list column | **3 entries** / _18 on your other sites_                                              |
| the Delete row  | "21 entries use it, so it cannot be deleted yet. 18 of them are on your other sites." |

The second line only appears when the two numbers differ, so a single-site
business never sees it.

## Confirming it

Driven as Devi on two of her sites, each checked against the database:

| Standing on             | Was | Now                               | The truth |
| ----------------------- | --- | --------------------------------- | --------- |
| Juniper Row (her shop)  | 21  | **3** + "18 on your other sites"  | 3 of 21   |
| Juniper Row Sample Sale | 21  | **10** + "11 on your other sites" | 10 of 21  |

3 + 18 and 10 + 11 both reconcile to the 21 the business holds. And the shop's
number now agrees with the Content list beside it, which was the contradiction
that started this.

**Four integration tests.** Proved red: with the scope predicate returning `{}`,
three of the four fail. (The fourth covers the empty-means-all rule, which holds
either way and is meant to.)

## Still open

- **The same idea has three names across two panes in this section.** This list's
  column says **Key**, its own editor one click away says **Id**, and [[385]]
  settled the twin pane on **Reference** (because the taxonomy editor already used
  that word). All three sit under Content. Not changed here — this issue is about
  the number, and picking one word is a decision about the whole section rather
  than a rename in passing.
- **The summary's other four aggregates are now scoped and nothing reads them.**
  `total`, `byStatus`, `publishedLast30d` and `scheduledUpcoming` are served
  correctly per site, but the only consumer is this pane's per-type column. If a
  Content overview is built on them later it will be right; today that is
  untested by use.
- **A built-in type with entries on another site shows a bare row here.** Correct,
  and it is what explains a refused delete — but the row itself says nothing about
  which site, only how many.
