# 380 — Every photograph in her library said it weighed nothing

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · opening Photos and files, a pane nobody had rated
**Surface:** mypiggles › Content › Photos and files, and any file opened from it
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** her own library, where nothing now claims a size nobody measured

## What happened

Devi opens her photo library. Under every single thumbnail:

> **0 bytes**

Seventy-four of her eighty-seven pictures said it. Across the whole database,
**2,947 of 3,161**.

## Why it happened

`formatBytes` folds "unknown" into "empty":

```ts
if (!Number.isFinite(bytes) || bytes <= 0) return '0 bytes';
```

**No file is zero bytes.** That column never means "weighs nothing"; it means
nobody measured it, and the split is almost exactly by where the file lives:

| Key                | Unmeasured | Measured |
| ------------------ | ---------- | -------- |
| an `http(s)` URL   | 2,863      | 7        |
| a real storage key | 84         | 207      |

A picture registered by URL was never downloaded here, so there was never
anything of ours to weigh. Rendering that as a measurement is
[[feedback_never_present_absence_as_measurement]] — the same rule
[330](330-every-photograph-on-her-site-was-measured-as-weighing-nothing.md)
settled for the publish weight report six days earlier. That fix was scoped to
`site-lint`'s budget; the library screen, where the number is under every
thumbnail, was never touched.

## The fix

`sizeLabel(asset)` decides what goes where a size goes, and `formatBytes` is left
to do arithmetic on real numbers:

- a measured file → its size
- a linked file → **Stored somewhere else**
- a stored file with no size → **Size not recorded**

The last two are separated on purpose. A linked picture is working as designed;
a stored one with no size is a gap in our own record, and telling an owner they
are the same thing would hide the second behind the first.

The console can tell them apart without asking the API anything: the wire already
carries `key`, and api-rest already uses `/^(?:https?:|data:)/i` on it to decide
whether a key needs resolving through storage. Same test, same answer.

The detail pane adds a line saying **why**, next to where the size would be:

> **Where it lives** — Linked from another website, so it was never copied here
> and there is nothing of yours to measure.

Without it, "Stored somewhere else" reads as a fault in her library rather than
as what a linked picture is.

## Confirming it

Her library, first fifty cards:

| Check                                 | Result                                         |
| ------------------------------------- | ---------------------------------------------- |
| Cards still reading **0 bytes**       | **0**                                          |
| Cards with a real size                | 4 — her own uploads, 212 KB to 372 KB          |
| Cards reading "Stored somewhere else" | 46                                             |
| A stored file's detail                | `Picture · 372 KB`, Size 372 KB, no extra line |
| A linked file's detail                | `Picture · Stored somewhere else` + the reason |

Nine tests, including that the two reasons never produce the same sentence.

## Still open

- **Nothing weighs a linked picture, deliberately.** 330 settled that: the site
  check is pure by contract and a tool that made 2,863 outbound requests would be
  worse than one that says plainly what it could not weigh. So an owner whose
  site is mostly hot-linked photographs still has no total.
- **The 84 stored files with no size are a real gap**, separate from the linked
  ones. A console upload records `file.size`, so these predate that or came in
  through a path that does not. Worth a backfill from storage, which can measure
  them without leaving the building.
- **The blueprint stock photography includes other companies' products** —
  Prada, Versace, Chanel and Zara bottles are all in her library now, from two
  designs added today. That is a content and licensing question about the
  blueprint catalog rather than a defect, and it is Brandon's call, but a shop
  installing a design should probably not end up hosting a rival's packaging.
