# 404 — She pressed Save and the answer arrived 767px above the fold

**Status:** fixed (57 of 119 call sites swept; the rest listed below)
**Severity:** major
**Found by:** P03 · Juniper Row · act 82 · setting up a notification with the address typed the ordinary way
**Surface:** mypiggles › every pane that renders its own write failure — 98 files, 119 sites
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** scrolled 2000px down a form, pressed Save, and watched the refusal scroll itself into the middle of the screen

## What happened

Devi filled in the notification form, pressed **Create webhook** in the toolbar,
and **nothing happened.** No message, no toast, no change of any kind. The button
greyed out for an instant and the screen sat exactly as it was.

The request had gone. It came back **422**. The pane had rendered a refusal —
correctly, in the right place, with the right wording — at the very top of a
scrolling body, while she was looking at the middle of a 2000px form and the
button she had pressed was pinned in the toolbar.

Measured in the running page rather than guessed:

    document.querySelector('.alert').getBoundingClientRect().top  →  -767

## What should have happened

The answer to a button press has to be where the person who pressed it is
looking. If it cannot be, it has to come to them.

## Why it matters

It is worse than a missing message. A missing message teaches "something is
wrong". This teaches **"that button does nothing"**, and the next move is to
press it again, which sends the same doomed request again.

And it is not one screen. Measured: **119 sites across 98 files** render a
conditional `<Alert color="error">` at the top of a pane body. Every long form in
the console has this, in every module.

## Where it lived

Nowhere, which was the problem. Ninety-eight surfaces had each hand-written the
same six lines:

    {failure ? (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not save this deal</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </AlertContent>
      </Alert>
    ) : null}

There was no component, so there was no place to fix it once.

## The fix

**`components/save-failure.tsx`** — one component, two behaviours neither of the
119 had:

- **It brings itself into view** and takes focus the moment it has something to
  say. `scrollIntoView({ block: 'center' })` plus `focus({ preventScroll: true })`
  on a wrapper, so a screen reader announces it and the next Tab starts at the
  problem. It reveals on a CHANGE of message, never on every render, so it does
  not fight the person's own scrolling.
- **It withdraws when they start fixing it.** A mutation's `isError` is sticky
  until the next attempt, so the refusal used to sit there while she corrected
  the very field it named. It now listens for `input`/`change` inside its own
  container and hides. Same rule as [397], moved from the toast into the pane.

**A codemod swept 57 of the 119**, converting only the exact canonical shape and
reporting what it would not touch, because a codemod that guesses is worse than
one that says what it could not do. 83 imports left unused by the sweep were
removed from eslint's own JSON report, never by hand-editing.

**And the same in sparx's console**, which carried the identical defect at
identical scale — 59 sites in 53 files, swept the same way, with **its own copy**
of the component. Copied rather than imported: neither brand tree may depend on
the other, so `check:console-parity` holds the two level instead of joining them.
The exception this issue originally added to that check is gone, because there is
nothing left to excuse.

## Confirmed by

Driven as Devi, on the pane where it was found:

> Set the name to 217 characters (the server caps it at 120), scrolled to the
> bottom of the form — past Stock, Warehouse, Supply, Stock feeds — and pressed
> **Save** in the pinned toolbar. The pane scrolled itself back and the refusal
> landed centred: **"Could not save that · Nothing was changed. Please try
> again."**
>
> Before the change, the same sequence produced no visible change at all.

The withdrawal half was found by accident and is **not separately re-proven on
screen**: correcting the name left the red alert sitting beside a clean form,
which is what prompted it. It cannot be re-driven on that pane because [405] now
stops the same request reaching the server at all. Recorded as a gap rather than
dressed up.

## Still open

- **62 sites in 28 files here, and 60 in 30 files in sparx, were not the
  canonical shape** and are untouched. They carry an `AlertActions` button, a
  `variant`, a `className`, or a different condition. Each needs a person to look
  at it. Both lists are printed by the codemod at
  `scratchpad/savefailure-codemod.mjs`.
- **sparx's sweep is not driven on screen.** It typechecks, lints, formats and
  passes parity, and it is the same component doing the same thing — but nobody
  has scrolled a sparx form to the bottom and pressed Save. That console has no
  test files either. Recorded, not dressed up.

## Rating effect

Folded into `cms.webhooks.detail` in [rating.md](../rating.md); the sweep raises
no score on its own, it removes a trap from 57 screens.
