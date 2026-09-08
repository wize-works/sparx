# 422 — She typed a customer's name and Enter opened a policy page

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 87 · looking up a customer while re-checking [409]
**Surface:** mypiggles › the search box in the top bar (⌘K) — every screen
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi typed **Priya** — a customer's name — and pressed Enter, which is the
contract the panel prints along its own foot (`↵ open`).

The console opened the **Content** list, because the highlighted first row was
**Privacy Policy**.

    Pages
      Privacy Policy            privacy-policy     ← highlighted
    Segments
      B2B Fleet                 b2b-fleet
    Customers
      Priya Nandakumar          Loom & Larder
      Priya Anand
      Priya Anand               priya.anand@example.com

Three customers literally named Priya, all below a page whose name is two edits
away from what she typed.

Reproduced on a second name straight away. Typing **Marguerite**:

    Reviews
      Sized down and it still swallows me…     ← highlighted
    Customers
      Marguerite Adeyemi
    Orders
      #O-000014, #O-000012, #O-000011, #O-000007

The top row was the opening line of a review. The woman who wrote it was second.

## The cause

Two halves of this panel, and only one of them was ranked.

```ts
return [...rankEntries(navEntries, q), ...recordEntries];
```

Surfaces go through a careful ladder — exact name, name-starts-with, name-contains
as a word, tagged words, and a group match last, with its own comment explaining
why a group match must never outrank a real name. **Records were appended
untouched, in the search server's order.**

That order is typo-tolerant on purpose, and typo tolerance is exactly right for
FINDING things: a mistyped "privicy" should still reach the Privacy Policy. It is
the wrong thing to decide what **Enter** opens, because the highlight starts on
row 0 and Enter takes it. So the server's willingness to be generous became the
console opening something the person did not ask for.

## Why it is worse with a keyboard

With a mouse she reads the list and clicks the right row; the bad ranking costs
her a second. With the keyboard — which this project checks deliberately, and
which the panel advertises in its own footer — she types a name and presses
Enter, and the wrong pane opens with no warning and nothing to undo. Same panel,
same query, two different outcomes depending on how she reached for it.

## The fix

**`launcher-match.ts`** gains `rankRecords`, and `launcher.tsx` ranks both halves:

```ts
return [...rankEntries(navEntries, q), ...rankRecords(recordEntries, q)];
```

The record ladder is its own, deliberately not `score`:

- the row's own **name** — exact, starts-with, starts-a-word, contains;
- then the **line under it** — a customer's email, an order's buyer;
- then **0**, which keeps the row in the server's own order at the end.

**The group is ignored**, which is the one place this differs from the surface
ladder. For a surface a group match is weak but real evidence ("typing customers
should reach the Customers app"); on a record the group is the entity's own name,
so "orders" would score every order in the shop identically and say nothing about
which one was meant.

**Nothing is filtered out.** A row the client can see no reason for is demoted,
never dropped — that is what preserves the typo tolerance the server exists to
give. `sort` is stable, so rows the client cannot tell apart never shuffle
between keystrokes.

Phrases use the same weakest-word rule `scoreQuery` already uses for surfaces, so
a two-word query behaves the same in both halves of the panel.

## Proved, on the screen that produced it

**"Priya"** now returns Priya Nandakumar, Priya Anand and Priya Anand under
**Customers** first, with Privacy Policy and B2B Fleet still present below.
Pressed **Enter**: her record opened, with the note about her wholesale enquiry on
it.

**"Marguerite"** now returns Marguerite Adeyemi first, then her four orders (they
match on their subtitle), then the review she wrote — the person, then what she
did, then what she said.

Seven tests in `launcher-match.test.ts` lock it, including that an unscoreable row
keeps its server position rather than disappearing.

## Both consoles, one test seat

The file is duplicated across piggles and sparx and both carried the same gap;
both are fixed. The test lives only in piggles, because `sparx/apps/workbench`
declares no `test` script and no vitest config — a copy there would never run, and
a test that never runs reads as coverage that does not exist. `check:console-parity`
is what keeps the two files in step.

## Rating effect

Feeds every pane, since the launcher is how a pane gets opened — recorded against
`builder.piece` alongside [414], where the launcher was first scored.
