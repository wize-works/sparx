# 416 — The note she wrote about her piece never reached the place the console promised

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 84 · scoring the Saved pieces pane
**Surface:** mypiggles › My Site › Saved pieces › a piece — and the editor's Insert rail
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi opened her one saved piece, "Send me a message", and found a field called
**What it's for** under a card that says, in as many words:

> The name and note are how you recognize this piece — in this list and in the
> editor's Add panel.

So she wrote one:

> The contact form. Lives at the bottom of Contact; reuse it on Trade if we open
> wholesale.

Saved. It appeared in the Saved pieces list under the name, exactly as promised.

Then she opened the editor's Add panel — Insert — and searched for it:

    Send me a ...     Your saved pieces
    Your saved pi...

Her note is not there. What is there is a fixed sentence the platform says about
**every** piece, "Your saved piece — edit it once and every copy follows",
truncated to "Your saved pi…" — which on that narrow rail is visually the same
words as the group label beside it. So the row says the same thing twice and
tells her nothing about her own piece.

Half a promise kept is what makes this worth filing rather than shrugging at. The
card names two places. One of them works. Nothing suggests the other does not, so
the only way to find out is to go and look, notice the absence, and know the
system well enough to be sure it is absence rather than something she did wrong.

## Why

The note was being dropped in transit, twice.

1. `SilicaPieceDto.description` carries it from the server. The console's studio
   provider built a `ComponentDoc` from that DTO and **did not copy it** — the
   document that reaches the editor had a name and a tree and nothing else.
2. Even had it survived, the palette would not have looked: `piecesGroup` built
   every row's hint from a hard-coded string.

Neither is a bug in the sense of something breaking. They are both a field simply
not being carried, which is why everything reads as working. This is the shape where a
missing field renders exactly like a correct one.

## The fix

Four small changes, one per hop:

- **`wizeworks/packages/studio/src/documents/types.ts`** — `ComponentDoc` gains
  `note?: string | null`.
- **`piggles/apps/workbench/lib/studio/provider.tsx`** — `note: piece.description`
  when loading the library. Site-owned pieces carry none: their store keeps a name
  and a tree, and there is nowhere to put one.
- **`wizeworks/packages/studio/src/session/session.ts`** — `pieceNote(id)`, with
  the same live-first rule as `symbols()`, so a piece opened after the library
  loaded wins over the copy loaded with it. A blank or whitespace-only note reads
  as no note.
- **`wizeworks/packages/studio/src/react/palette/pieces.ts`** — the hint is her
  note when she wrote one, and the original sentence when she did not. A piece
  she has never annotated still needs the one fact a first-timer is missing.

`symbols()` was deliberately left alone. It narrows a piece to what the CANVAS
needs — id, name, tree — and widening it to carry authoring words would put a
label in the render path for no reason. The Insert rail is the other reader, and
it asks its own question.

## Proved, on the same screen

Reloaded the editor on Contact and searched "send me":

    Send me a message
    Your saved pieces · The contact ...

Her name in full (that is [415](415-the-insert-list-cuts-every-name-at-the-point-where-they-differ.md))
and her own words after the group.

Two tests in `session.test.ts` lock it: the note comes back, a blank one does not,
an unloaded piece does not, and an open piece beats the loaded library copy.

## Rating effect

Feeds `builder.piece` — see [rating.md](../rating.md).
