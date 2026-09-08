# 415 — The Insert list cuts every name at the point where they differ

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 84 · looking for her saved piece in the editor
**Surface:** mypiggles › My Site › Page › the editor › **Insert** — the search results
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi opened her Contact page in the editor, went to **Insert**, and searched
"opening". Three results:

    Opening (wor...     Page structure
    A centred headli...

    Opening ho...       Where and when
    A real table of ...

    Opening over a f... Big pictures
    A photograph filling

Three blocks, three names, and every name is cut off **at the exact word where
they start to differ**. One of them is "Opening hours", a real table of times.
One is "Opening (words only)", a headline band. Nothing on the screen says which
is which.

The list she has to choose from cannot be used to choose.

## Why

The row put the group name in a **second column on the same line**, right-aligned.
The Insert rail is about 215 pixels wide; "Page structure" and "Where and when"
take roughly half of that. What is left after the icon, the gaps and the group
label is around 70 pixels, and the name and the description both have to fit in
it.

Worse, the group labels are different lengths, so the space left for the name
changes from row to row — a ragged column where every row is cut at a different
place.

Her own saved piece got it worst of all:

    Send me a ...       Your saved pieces
    Your saved pi...

Two lines that both read "Your saved pi…" and a name she could not read. See
[416](416-the-note-she-wrote-about-her-piece-never-reached-the-place-the-console-promised.md)
for the second line; this issue is the geometry.

## The fix

**`wizeworks/packages/studio/src/react/palette/palette.tsx`** — the name gets the
whole row. The group moves to the second line, where it **leads** the sentence:

```
Opening hours
Where and when · A real table of ...
```

The group is still said, because it is what tells "Opening hours" from "Opening
(words only)". It just costs one short word at the start of a line instead of
half the row's width. The description follows it and takes whatever is left, which
is the same deal every hint had before.

The text column also gained `flex-1`, so it claims the row rather than sizing to
its content.

## Why the group is worth keeping at all

It was tempting to drop it: fewer words, more room. But the group is exactly the
disambiguator in the failing case — "Opening hours" and "Opening (words only)"
are told apart by "Where and when" versus "Page structure", not by their
descriptions. Removing it would have fixed the truncation and left her with the
same problem in a different shape.

## Both consoles

`@wizeworks/studio` is the shared editor, so piggles and sparx get this together.

## Proved, on the same screen

Reloaded the Contact page editor and searched "opening" again:

    Opening (words only)
    Page structure · A centred headli...

    Opening hours
    Where and when · A real table of ...

    Opening over a full picture
    Big pictures · A photograph filling...

Three full names. And "send me":

    Send me a message
    Your saved pieces · The contact ...

## Rating effect

Feeds `builder.page` on Ease — see [rating.md](../rating.md).
