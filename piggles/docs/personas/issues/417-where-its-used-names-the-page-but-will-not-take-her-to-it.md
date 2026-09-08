# 417 — "Where it's used" names the page but will not take her to it

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 84 · scoring the Saved pieces pane
**Surface:** mypiggles › My Site › Saved pieces › a piece › **Where it's used**
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

The piece pane has a card called **Where it's used**:

> Every page and layout this piece appears on. Change it here or in the editor and
> all of these update together.

Under it, one row: a page icon, the word **Contact**, and a badge reading
**Page**.

Devi clicked Contact. Nothing happened. She clicked it again. Still nothing.

The row is plain text. There is no link on it and no button under it.

## Why it matters

The card exists to answer one question — _where does this live_ — and there is
exactly one thing anyone does with that answer, which is go and look. So the card
delivers its answer and then stops one step short of the only move it sets up.

The row looks like every other openable row in the console: icon on the left, name
in the middle, badge on the right, sitting in a list with dividers. Everything
about it says "click me". A row that looks clickable and is not teaches an owner
that clicking things in this console sometimes does nothing, which is a lesson
that spreads well beyond this card.

It is filed minor because nothing breaks and nothing is lost. She can find the
page herself. It is a dead end, not a wrong turn.

## The fix

**`piggles/apps/workbench/surfaces/builder/saved-piece-detail.tsx`** — the row is
a button that opens what it names. `builder.page` for a page, `builder.layout` for
a layout, with the same modifier contract as every list in the app: plain opens a
tab, Shift docks it alongside, Alt tears it into its own window. The card's own
sentence now says so: "Click one to open it."

**And the badge stopped being grey by name.** It was `<Badge color="neutral">`,
which is not a color anyone chooses here without asking — and "Page" and "Layout"
are two different kinds of thing rendering identically. A colorless badge (no
`color` prop at all) takes the surface's own ink, stays correct in both themes,
and needs no approval. The words and the two different icons carry the
distinction.

## Proved, on the same screen

Closed the open Contact tab first, so the click had to do the work. Opened the
piece, clicked **Contact** in Where it's used: a **Contact** tab opened on the
page editor, showing the Contact page with "Send me a message" in its Layers list
— the piece the pane was about, on the page the row named.

Checked in dark, in light, and at 360px in an injected iframe: no horizontal
overflow (`scrollWidth` equals the viewport), the row and its badge stack cleanly,
and Delete is still reachable at the bottom.

## Rating effect

Feeds `builder.piece` — see [rating.md](../rating.md).
