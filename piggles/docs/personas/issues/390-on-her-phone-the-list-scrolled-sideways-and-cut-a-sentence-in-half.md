# 390 — On her phone the list scrolled sideways and cut a sentence in half

**Status:** fixed
**Severity:** design
**Found by:** P03 · Juniper Row · scoring Kinds of content at 360px (RULE #6)
**Surface:** mypiggles › Content › Kinds of content
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** the same pane at 360px — 89px of overflow measured, then 0

## What happened

Scoring the pane at 360px, as RULE #6 requires, the types table had **its own
horizontal scrollbar**, and the one sentence describing each type ran off the
right-hand edge and stopped mid-word:

> Testimonial
> A customer quote with attribution and an optio▸

No ellipsis — just clipped, with a scrollbar under it. To read the rest of a
sentence a shop owner had to drag sideways inside a table on a phone.

Measured rather than eyeballed:

|                             |                      |
| --------------------------- | -------------------- |
| the pane's scroll container | **327px**            |
| the table                   | **416px**            |
| overflow                    | **89px**             |
| the description span        | clamped at **384px** |

## Why it happened

One class: `max-w-96` on the description — **384px**, which is wider than the
whole 327px pane. So `truncate` did fire, but at a width already 57px past the
right edge, and the table stretched to fit it.

**The house had already solved this exact problem, one size down.** The shared
`IDENTITY_CELL` constant in `components/table.tsx` carries the reasoning in its
own doc comment:

> Written as a single desktop number (`max-w-72`, 288px) the cap is itself wider
> than a 360px pane once a status badge is beside it, and the badge — the column
> the list exists to show — is what falls off. Here the cap widens with the
> container instead, from 160px on a phone to the 288px it always had at full
> width.

That is this defect, described in advance, with the fix already written and
exported. This cell used a fourth number instead of the constant — and a
hardcoded cap is exactly the thing RULE #1 exists to stop, because the day
somebody changes the cap, this one does not follow.

## The fix

The description uses `IDENTITY_CELL`. No new number.

```tsx
<span className={`mt-0.5 block truncate text-sm ${IDENTITY_CELL}`}>
```

It costs ~96px of width at full desktop size (288 rather than 384), which is the
right trade: the cap is the same one every other list in the app uses, so the
rows sit at a consistent width and a future change to it reaches here too.

## Confirming it

The same pane, same 360px frame, measured again:

|                 | Before        | After                                 |
| --------------- | ------------- | ------------------------------------- |
| overflow        | 89px          | **0px**                               |
| description box | 384px         | **160px**                             |
| truncating      | past the edge | **inside the cell, with an ellipsis** |

On screen: no scrollbar, and "A customer quote wit…" ending in a real ellipsis.

## Still open

- **Nothing checks a table cell against the pane it sits in.** This is the second
  find of the shape ([[379]] was an email address painted 11px over the next
  column) and both were invisible to typecheck, lint and every test — they need a
  width measured at a width. `IDENTITY_CELL` exists so the answer is shared; what
  is missing is anything that notices when a cell does not use it.
- **The description is still one line.** Truncated at 160px on a phone, a
  sentence like "A customer quote with attribution and an optional star rating"
  shows five words. The full text is in the editor one tap away, so this is a
  glance rather than a dead end — but a two-line clamp would show most of it.
