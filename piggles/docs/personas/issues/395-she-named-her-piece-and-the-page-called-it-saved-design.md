# 395 — She named her piece, and the page called it "Saved design"

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · saving her contact form as a reusable piece
**Surface:** mypiggles › My Site › page editor › Layers, and the panel beside it
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** her Contact page's layer now reads "Send me a message", and two pieces on one page read as two different names

## What happened

Devi typed **"Send me a message"** into the name box, pressed Enter, and watched
the section she had just named collapse in the Layers list into a single row
reading:

> **Saved design**

The name she had chosen a second earlier was gone from the screen. The panel on
the right said "Saved design" too. Every saved piece on every page said the same
thing, so a page carrying her contact form, her opening hours and her studio
address would have shown three identical rows and no way to tell which was which
except by clicking each one.

The name was not lost — the Saved pieces list had it, and so did the editor's
Add panel. Only the two places she was actually looking did not.

## Why it happened

`rowLabel` is a pure function of one node, and the node carries the master's
**id**, not its name:

```ts
if (node.instanceOf) return 'Saved design';
```

There was no way to ask. Meanwhile the name was already loaded twice over: the
editing session's `symbols()` map returns `{ id, name, root }` for every piece,
which is what the Add panel lists and what the canvas draws the design from. The
schema's own comment on that field says it is the _"human name shown in the
Components palette + instance chrome"_ — the intent was written down; the layer
tree just never read it.

## The fix

`rowLabel(node, symbolName?)` takes the master's name when there is one.
`LayerOptions` gained `symbolNames`, and one shared hook, `useSymbolNames()`,
supplies it to the two places that name a node — the Layers list and the panel
beside it — so they cannot disagree about what a thing is called.

Two things the fix had to get right:

- **It still falls back.** A master that has not loaded yet, or one that has been
  deleted, has no name to show, and "Saved design" is then the honest answer
  rather than a blank row.
- **A name the author put on the layer itself still wins.** `node.label` is her
  word for this copy, and it beats the master's name exactly as it beat the tag
  name before.

`useResolutionVersion()` is in the hook's dependency list deliberately: the
library lives on the session, `session` never changes identity, and a memo
without it would hold its first answer for the life of the pane — so a piece
saved or renamed mid-session would never reach the rows. That is the mistake the
hook it borrows from exists to prevent, and it is now the reason a rename shows
up live.

## Confirming it

Driven as Devi. Her Contact page's Layers list reads **Send me a message**, and
the panel heading with the section selected reads the same. Renaming the piece in
Saved pieces changed the heading in the editor with no reload.

**Three tests**, all proved red against the old code: an instance wears its
master's name; it falls back with no name to give; and a page holding three
pieces — two known, one not — reads as three different rows rather than three
identical ones.

## Still open

- **The row is still one row.** Collapsing an 18-child section into a single
  layer is correct (editing the master belongs to the piece's own pane, and rows
  here would offer edits that either detach the copy or silently change every
  other one), but nothing on the row says the insides are elsewhere. She watched
  her form fields disappear from the list with no explanation.
- **This is shared code.** The change is in `@wizeworks/studio`, so it reaches
  the other brand's editor too. That is right — neither brand wants "Saved
  design" over a named piece — but it was not driven there.
