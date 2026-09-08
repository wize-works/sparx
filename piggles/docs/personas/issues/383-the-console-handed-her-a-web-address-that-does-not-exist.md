# 383 — The console handed her a web address that does not exist

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · reading the line under the Web address box and then trying it
**Surface:** mypiggles › Shop › Categories › any category › Web address
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** `/category/knitwear` served, and the console now printing that

## What happened

Under the Web address box on every category, the console told her where that
category lives:

> The end of this category's page address — **yoursite.com/c/knitwear**. Changing
> it breaks any link already shared to this page.

That address is not served. Measured against her own site:

| Address              | Result  |
| -------------------- | ------- |
| `/c/knitwear`        | **404** |
| `/c/tops`            | **404** |
| `/c/goods`           | **404** |
| `/category/knitwear` | 200     |
| `/category/tops`     | 200     |

There is no redirect from one to the other. A shop owner who did the obvious
thing with a line the console offered her — put it in an Instagram bio, a
newsletter, a printed card at a market stall — sent every single person who
tapped it to a Not Found page, and nothing anywhere would have told her.

## Why it happened

`/category/<handle>` is the real address, and it is the real address in every
place that matters:

| What                     | Where                                             |
| ------------------------ | ------------------------------------------------- |
| the page itself          | `apps/site/app/category/[handle]/page.tsx`        |
| the shop's breadcrumbs   | `components/category/category-detail.tsx`         |
| the sitemap given Google | `api-rest/routes/v1/sitemap.ts`                   |
| the redirect table       | `applyRedirect(site.slug, '/category/${handle}')` |
| the record template      | `record-templates.ts` → `prefix: '/category/'`    |

`/c/` appears **once in the entire repository**: in this sentence.

The three sibling screens all print theirs correctly — a page says
`yoursite.com/about`, a group says `yoursite.com/collections/new-in`, a product
says `yoursite.com/products/marlow-knit`, and all three are served. Only the
category screen printed an address the platform does not answer.

It is the small end of [[feedback_verify_capability_in_code_not_docs]]: the
sentence is documentation living inside a component, and nothing checks
documentation against the router.

## The fix

One line, and a comment beside it recording why the address is what it is.

> The end of this category's page address — **yoursite.com/category/knitwear**.

## Confirming it

Opened Knitwear as Devi. The line reads `yoursite.com/category/knitwear`, and
that address returns her real category page: the Knitwear banner, its description,
the size and color filters, and the Marlow Knit.

## Still open

- **The address is still a guess at her domain.** It says `yoursite.com` while
  the product SEO pane on the next screen over resolves her actual canonical
  domain and prints that. The category screen should do the same rather than
  showing a placeholder host beside a real path.
- **Nothing checks a printed address against the router.** Three screens were
  right and one was wrong for the same reason: each sentence was written by hand
  and none is derived from the route table. `record-templates.ts` already holds
  the prefixes; a printed address ought to come from there.
