# 414 — The search panel moves under her finger and opens the wrong thing

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 84 · opening Saved pieces from the search box
**Surface:** mypiggles › the search box in the top bar (⌘K) — every screen
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi wanted her saved pieces. She typed "pieces" into the box at the top of the
console. One result came back under the heading **My Site**:

    My Site
      Saved pieces
    Looking through your records…

She clicked **Saved pieces**. The console opened **"As composed by the founder"**
— one of her journal posts.

She did not click a journal post. She clicked the only row on the screen.

## What actually happened, in order

1. She typed. The panel showed the one screen that matched, plus the line
   "Looking through your records…" — the record half of the search still running.
2. Her eye found the row and her hand started moving.
3. The records came back: a photo, two journal posts, three collections. Six new
   rows.
4. The panel grew to hold them **and rose by 115 pixels**, because it is
   centred. Every row rose with it.
5. Her click landed on the pixel she had aimed at. "Saved pieces" was no longer
   there. "As composed by the founder" was.

Measured on the screen, same query, twice: the search field itself sits at y=411
before the records land and y=296 after. "Saved pieces" moves from y=500 to
y=347. The rows do not slide — they teleport, in one frame, roughly a second
after the panel first draws.

## Why it is centred, and why that is the whole bug

Silica's dialog popup is positioned by `top: 50%` and `translate(-50%, -50%)`.
Its height and the position of its top edge are therefore the same number: grow
the box by 230px and everything inside it moves up by 115.

That is correct for a dialog whose contents are known when it opens. This panel's
contents are not. It changes height **three times in one search**:

- it opens tall, on the whole navigation list;
- it collapses the moment you type, to the few screens that match;
- it grows again a beat later, when the record results arrive.

Three jumps, one of which lands squarely in the window between reading a row and
clicking it.

## Why it matters more than it looks

It is not a cosmetic wobble. **The console does something she did not ask for**,
and it does it silently — the wrong screen simply opens, with no error and
nothing to undo. The rows in this panel are not all harmless navigation either:
the same list carries records, and the same click contract carries
Shift and Alt to open in a split or a new window.

And it is unfalsifiable from the inside. She cannot tell she mis-clicked. From
where she is sitting, she clicked "Saved pieces" and the console opened a blog
post, so the console is broken in some way she cannot describe — which is
exactly the kind of thing that stops someone using a feature at all.

## The fix

**`piggles/apps/workbench/components/launcher.tsx`** and
**`sparx/apps/workbench/components/launcher.tsx`** — the panel now has a fixed
height rather than a maximum:

```diff
-<DialogContent className="flex max-h-[70dvh] w-full max-w-xl flex-col overflow-hidden p-0">
+<DialogContent className="flex h-[70dvh] w-full max-w-xl flex-col overflow-hidden p-0">
```

A pinned height pins the top edge, so the panel opens in one place and stays
there for the whole interaction. Results now appear **in place**: the list is
top-anchored inside the panel and takes the leftover space, so a row that is on
screen stays where it is when more rows arrive below it.

It costs nothing. The resting panel — no query typed, whole navigation list
showing — already filled 70dvh, so the only change to what she sees is that short
result lists no longer shrink the box.

## Why here and not in silicaui

The ladder was walked. `Dialog` has no positioning prop; this is not a token; and
`.dialog-popup`'s centring lives in the published `@wizeworks/silicaui` package,
which is a dependency of this repo rather than part of it. Centring is also right
for the dialogs it was written for — a confirm, a short form — so the general
change would be wrong even if it were available.

The launcher is already an approved bespoke composition over silica's Dialog
(noted at the top of the file), and its geometry is a property of THIS panel: it
is the one dialog on the platform whose contents arrive asynchronously by design.
A sizing utility on a composed dialog is layout, not a re-skin — no fill, no
foreground color, nothing a token would have carried.

## Both consoles

The file is duplicated by design across piggles and sparx, and both carried the
same line. Both are fixed, so `check:console-parity` stays green and a sparx
operator does not keep the bug piggles just lost.

## Proved, on the screen that produced it

**The jump is gone.** Opened the box, typed "belt", screenshotted immediately and
again three seconds later once the records had landed. The search field is at
y=177 in both. The footer bar is at y=813 in both. The four record rows appear
below the products heading without moving anything.

**The mis-click is gone.** Re-ran the exact failing step — open, type "pieces",
click the first row immediately, while "Looking through your records…" was still
showing. The **Saved pieces** tab opened, on `/builder/saved-pieces`, showing her
one piece ("Send me a message").

## Rating effect

Feeds every pane, since the launcher is how a pane gets opened — recorded against
`builder.piece`, where it was found. See [rating.md](../rating.md).
