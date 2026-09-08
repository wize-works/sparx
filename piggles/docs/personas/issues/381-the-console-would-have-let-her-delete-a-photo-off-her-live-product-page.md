# 381 — The console would have let her delete a photo off her live product page

**Status:** fixed
**Severity:** critical
**Found by:** P03 · Juniper Row · reading one line under a picture and not believing it
**Surface:** mypiggles › Content › Photos and files › any file
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** her own Ash Overshirt photograph, which now says what uses it and cannot be deleted

## What happened

`ash-overshirt-bone.jpg` is the photograph on The Ash Overshirt's product page.
Its file card said:

> **Used in** — Not used anywhere yet

And below it, enabled:

> **Delete this file** — Removes it from your library for good. This cannot be
> undone. **[ Delete ]**

She has 87 pictures. **37 of them are on live product pages**, and every one said
"Not used anywhere yet". Across the whole database: **3,161 assets, 3 claim to be
used, 2,409 actually are.**

## Why it happened

`media_assets.usage_count` is a denormalised column that **nothing has ever
written**. Not one increment anywhere in the repository — the only
`{ increment: 1 }` in the codebase is on discount usage. It defaults to 0 and has
stayed 0 since the table was created.

Three things trusted it:

| What                       | What it does with the number                                    |
| -------------------------- | --------------------------------------------------------------- |
| the library's "Used in"    | reads "Not used anywhere yet"                                   |
| **both delete guards**     | `if (usageCount > 0) refuse` — so they could never fire         |
| the media GC's eligibility | `deleted_at IS NOT NULL AND usage_count = 0` — always satisfied |

So the chain runs: the screen tells her the picture is unused → that is the fact
an owner uses to decide → the guard that exists to stop her is inert → she
deletes it → the product page loses its photograph → thirty days later the GC
hard-deletes the file and every rendition from storage, permanently.

The comment above the guard states the assumption in plain words, and it is
false:

> usage_count is denormalised but reflects the same data the dashboard's "used
> by" list shows.

**The tests passed the entire time**, because they mock the number:

```ts
findFirstResult.value = { usageCount: 3 }; // unit test
await tx.mediaAsset.update({ data: { usageCount: 2 } }); // integration test
```

Both proved the guard works when the count is right. Neither could ever have
shown that it never is. That is
[[feedback_absent_behaves_like_fine]] exactly: a never-written counter renders
identically to a correct zero, and a test that manufactures the value is blind to
the difference.

## The fix

**Count, do not remember.** `countAssetUsage` in `@wizeworks/media` groups over
the tables that actually hold the references:

| Source                             | What it means      |
| ---------------------------------- | ------------------ |
| `content_references`               | pages and articles |
| `commerce_variant_images`          | product photos     |
| `customers` + `customer_documents` | customer records   |
| `authors.avatar_asset_id`          | author profiles    |
| `staff_documents`                  | staff documents    |
| `finance_expense_attachments`      | expenses           |

Seven grouped queries for a whole page of the library, not one per row. A number
computed from the rows that hold the references cannot drift from them, which a
counter maintained by hand at seven call sites certainly would.

It feeds all three consumers: the serializer (so the screen is true), and both
delete guards (so the refusal fires). The refusal **names the kinds** —

> This file is still used by 3 product photos and 1 page or article. Detach it
> first.

because "still referenced by 4 entries" tells an owner nothing about which screen
to open.

### What it still cannot see, said out loud

A builder page keeps its asset ids inside the silica tree as plain JSON, with no
reference table beside it, so it cannot be counted without scanning every tree on
every read. Measured on her account: **1** of 87 assets appears in a builder tree,
against 40 in products and 17 in CMS bodies. So the total is a FLOOR, and the
screen says so rather than rounding it up to a certainty:

> **Used in** — Nothing we can see. A picture placed straight into a page in the
> site editor is not counted here, so check there before deleting it.

## Confirming it

On her real account:

| Check                                  | Before                | After                            |
| -------------------------------------- | --------------------- | -------------------------------- |
| `ash-overshirt-bone.jpg` → **Used in** | Not used anywhere yet | **1 product photo**              |
| Its Delete button                      | enabled               | **disabled**                     |
| Its delete explanation                 | "cannot be undone"    | names the product photo using it |
| A genuinely unused picture             | same as the above     | says what it cannot see, deletes |

**Sixteen tests** on the counter and the sentence it produces, and the two
existing delete tests rewritten to create a real reference instead of writing the
column. Proved red: with the guard reading `usageCount` again, three go red,
including **"refuses on a stale usage_count of zero when a reference really
exists"** — the defect itself, in one test.

## Still open

- **The column is still there and still never written.** Nothing reads it for a
  decision any more, but leaving a lying column in the schema is a trap for the
  next person. Dropping it is a migration plus a change to the GC's eligibility
  test, which is safe now for a different reason: the delete guard is real, so
  nothing in use can reach `deleted_at` in the first place.
- **Builder pages have no reference index**, which is what keeps the count a
  floor. Giving them one is the same work `syncReferences` already does for CMS
  entries, and would close this properly.
- **Nothing detaches for her.** The refusal tells her where the picture is used;
  she still has to go to each place and swap it herself. A "show me where" link
  from the file to its uses is the obvious next step.
