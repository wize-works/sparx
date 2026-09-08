# 394 — She saved a piece, watched it confirm, and the screen that holds them said she had none

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · saving her contact form as a reusable piece
**Surface:** mypiggles › My Site › Saved pieces
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** a second piece saved with the pane open appeared without a refresh, and a rename reached the editor live

## What happened

Devi selected the section holding her enquiry form, pressed **Save as piece**,
typed **"Send me a message"**, and pressed Enter. A toast confirmed it:

> "Send me a message" saved as a piece

She switched to **Saved pieces** to see it and read:

> **0 pieces**
> **No saved pieces yet** — A saved piece is a part of a page you build once and
> reuse. Open the editor, build something, select it, and choose "Save as a
> piece"…

The row was already in the database. The screen was telling her to go and do the
thing she had just done. Pressing the refresh button — which she had no reason to
press — showed it immediately.

## Why it happened

**The same library was cached under three keys across two files, and nothing
cleared across the split.**

| Key                               | Declared in                                                   | Read by                   |
| --------------------------------- | ------------------------------------------------------------- | ------------------------- |
| `['builder','silica-pieces']`     | `lib/studio/piece-data.ts`                                    | the editor's Add panel    |
| `['builder','silica-pieces']`     | `lib/studio/site-data.ts` — **the same array, written twice** | the same query            |
| `['studio','site-symbols']`       | `lib/studio/piece-data.ts`                                    | the canvas                |
| `['builder','components','list']` | `surfaces/builder/saved-pieces-data.ts`                       | **the Saved pieces pane** |

Saving cleared the first three. The pane's key was never touched.

It broke in both directions, which is what makes it structural rather than a
missed line:

- Save in the editor → the pane says "No saved pieces yet".
- Rename or delete in the pane → the editor's Add panel keeps offering the old
  name, and a deleted piece stays in the list you can place from.

The second direction is the worse one: placing a piece that no longer exists
draws "This saved design is no longer available" where she expected her work.

## The fix

Not another invalidate line at each call site — that is the same bug deferred.
**One file owns every key**, `lib/studio/piece-keys.ts`, and one call clears them
all:

```ts
invalidatePieceLibrary(queryClient);
```

Every mutation on either side uses it, so a new one cannot clear half the caches.
Delete keeps its one exception, named rather than implied: it skips its own
detail key, because the pane closes itself and refetching a just-deleted,
still-mounted detail while dockview commits the close lands a `flushSync` inside
a lifecycle method. Everything else still refreshes.

The duplicate `SILICA_PIECES_KEY` declaration in `site-data.ts` is now a
re-export of the one definition.

## Confirming it

Driven as Devi, both directions, on the screen:

1. **Save with the pane already open.** Selected her intro section, saved it as
   "Talk to me", switched to the Saved pieces tab: **2 pieces**, both listed, no
   refresh pressed.
2. **Rename in the pane.** Renamed "Talk to me" to "Come and say hello" and
   saved. Back in the editor with no reload: the Insert panel's **Your saved
   pieces** group read "Come and say hello", and so did the right rail heading on
   the placed copy.
3. **Delete in the pane.** The piece left the editor's Add panel too.

## Still open

- **No test covers the bridge.** The console's vitest suite has no query-client
  harness, so this is proved by driving it rather than by a test that would catch
  a fourth key being added elsewhere. The one file is what makes that unlikely; a
  test would make it impossible.
- **The pane's empty state is right and was reached wrongly.** "No saved pieces
  yet" is well written and tells her exactly how to make one. Nothing about the
  copy needed changing — it was being shown at the wrong moment.
