# 376 — Every shop on the platform started with three posts that had no date

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · reading her Journal, then reading everyone else's
**Surface:** any tenant site › the journal · and mypiggles › Content
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** a design installed on her Press site, whose five articles now carry real dates

## What happened

Devi's Journal lists three posts, each with a date over the title:

> 28 August 2026 · Caring for knitwear so it lasts

Wildroot Flowers' journal lists six, and the order is wrong. Her own three
articles — the ones about cut flowers, what is in season, and ordering for a
funeral — sit at the BOTTOM. Above them are the three the platform installed with
her design:

| Position | Post                                              | Whose          |
| -------- | ------------------------------------------------- | -------------- |
| 1        | Five ways to turn first-time buyers into regulars | the platform's |
| 2        | How to launch your online store in a weekend      | the platform's |
| 3        | Writing product descriptions that actually sell   | the platform's |
| 4        | Four things that actually make cut flowers last   | hers           |
| 5        | What is actually in season, month by month        | hers           |
| 6        | Ordering flowers for a funeral                    | hers           |

Not a one-off. Every tenant in the database has exactly three of these, and not
one of the three has a publish date:

```
Juniper Row|blog_post|13     Bella Salon|blog_post|3     Aster Bloom|blog_post|3
Atlas Supply Co|blog_post|3  Threadline|blog_post|3      Harvest Pantry|blog_post|3
… 19 tenants, 67 undated published entries
```

## Why it happened

`content_entries.status = 'published'` with `published_at IS NULL` — a row that
says it is live and cannot say since when. Three separate places wrote them:

| Where                                   | What it wrote                       |
| --------------------------------------- | ----------------------------------- |
| `blueprint-installer.ts` (entry create) | `status: entry.status`, and no date |
| `blueprint-updater.ts` (merged write)   | `status`, and no date               |
| `graphql.ts` (`createEntry`)            | `status: input.status`, and no date |

The CMS service's own create and publish transitions had it right, and one of them
carries a comment explaining exactly why. The three paths that bypass the service
inherited the status handling without the date.

**Every reader of an undated post fails quietly**, which is why this survived:

- The public listing orders by `published_at DESC`, and **Postgres sorts NULLs
  FIRST on a descending order**. So an undated post outranks every dated one,
  permanently, no matter what the shop writes next. That is Wildroot's ordering.
- The storefront's post card binds a pre-formatted `date`, which resolves to an
  empty string. A dated card design renders a blank line where the date belongs.
- The console's content list shows status, not date. All thirteen of Devi's wear
  the same green **Published** badge, and nothing on any screen separates the
  three that work from the ten that do not.

## The fix

One function, because the rule is one rule:

```ts
export function publishTimestamp(status, existing?, now = new Date()) {
  if (status !== 'published') return existing ?? null;
  return existing ?? now;
}
```

All four write paths use it. `existing` is what keeps a live post's ORIGINAL date
when a later write only touches its status or body — the day a post went live is a
fact about the post, not about the last edit. The deliberate re-dating on an
explicit publish stays where it was, in `publishEntryTx`, because that is a person
choosing to publish rather than a write that happens to carry a status.

**And the database enforces it**, so the next write path cannot quietly reintroduce
this:

```sql
ALTER TABLE "content_entries"
  ADD CONSTRAINT "content_entries_published_has_date"
  CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
```

The same migration backfills the 67 existing rows to their `created_at`, not to
the deploy time. Stamping them with now would say every historical post on the
platform went live the day this shipped, which is a worse answer than the null.

## Confirming it

On Devi's real account, adding the Brand Newsroom design to her Press site:

| Check                           | Before                | After                    |
| ------------------------------- | --------------------- | ------------------------ |
| The five articles it installed  | `published_at` NULL   | a real timestamp on each |
| What the public listing serves  | newest-first is wrong | newest first, correctly  |
| Rows that would break the CHECK | 67                    | 0                        |

**Seventeen tests** on the rule, seven of which go red against the exact bug
(a helper that returns `existing ?? null`), including the two blueprint paths and
the GraphQL one by name.

## Still open

- **A blueprint cannot say WHEN an article was written.** `ContentEntryDecl` has
  `typeKey`, `slug`, `status`, `body`, `seo`, `authorSlug`, `categories`, `tags`
  — and no date. So a design's five example articles all land at the same second,
  which reads as a dump rather than a journal. Adding a date to the manifest is a
  change to the authoring contract and is its own piece of work.
- **The console never shows a publish date on the content list.** It is what made
  this invisible for as long as it was. A "Published" badge that could say
  "Published 28 Aug" would have shown the gap immediately.
