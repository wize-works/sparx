# 398 — On a phone, the button squeezed the message to seven pixels

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 79 · the 360px pass on Old links (RULE #6)
**Surface:** every Alert in the console that carries an action — 15 files
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** measured 7px → 213px at 360px, and 211px unchanged on the desktop dialog

## What happened

The duplicate-redirect refusal from [396] reads correctly on a laptop. At 360px
it fell apart:

> **Could**
> **not**
> **add**
> **that**
> **redirect**
> A
> redirect
> from
> "/sale"
> already
> exists.

One word per line, with the **Change the existing one** button drawn on top of
the title. The message and the button overlapped; neither could be read properly.

## What should have happened

RULE #6 — every pane holds at 360px, in dark. A notice that offers an action has
to be legible next to it, and if there is no room for both on one line the action
takes its own line.

## How to reproduce

Every time, before the fix. Do not resize the window; inject a 360px iframe:

1. `/content/redirects?site=primary` in a 360px-wide iframe.
2. `+` › `/sale` › anything › Add redirect.
3. The alert renders as a column of single words underneath the button.

## Why it matters

It is the phone rendering of a message whose entire job is to explain a refusal
and offer the fix. And it is not one screen: **15 files** in the console put a
control in an alert, and the labels are Piggles-voice sentences, not "OK" —
"Change how it is sold", "Yes, file them there", "See what changed", "Sort them
out". Every one is at risk; several are certainly broken.

## Where it lives

Silica, not the call site. Measured in the running page:

| Part             | Before  |
| ---------------- | ------- |
| `.alert` width   | 253px   |
| `.alert-content` | **7px** |
| `.alert-actions` | 194px   |

`.alert` is `display: flex` with no `flex-wrap`, and `.alert-actions` is
`flex-shrink: 0`. So a wide action does not give: it keeps its width and the
message column takes whatever is left.

## The fix

`wizeworks/packages/silica-corrections/src/silica-gaps.css` — one shared rule,
brand-blind, reaching all 15 sites and both brands from one copy:

    .alert { flex-wrap: wrap; }
    .alert-content { flex-basis: 12rem; }

**The second line is the one that took the work.** `flex-wrap` alone fixes the
phone, and it was very nearly shipped that way — but a flex line breaks on each
item's HYPOTHETICAL size, which for silica's `flex: 1 1 auto` is the message's
whole sentence (416px in a 417px alert). So wrapping alone ALSO drops the button
below the message on a full-width desktop alert, where nothing was wrong.
Verified on screen before it went anywhere: the desktop dialog changed. Changing
how every Alert on both brands looks is a redesign, not a correction, and not
mine to make.

Restating the basis as the width the message actually needs keeps it to the
broken case. This is the only rule in that file that redeclares a property silica
sets, and its comment says so and says why: `auto` is what makes the line break
in the wrong place. Nothing else changes — `flex-grow: 1` still fills the row, and
silica's `min-width: 0` still lets a long word wrap rather than overflow.

The call-site alternative was two Tailwind utilities repeated in 15 files, which
is the deferred fix root RULE #1 warns about. Raise it upstream against silicaui;
delete both rules the day it wraps its own alert.

## Confirmed by

Measured either side of the change, in the running page rather than by eye:

> **360px:** message 7px → **213px**, alert height 241px → 140px, button on its
> own line under the message. Screenshot read back: title on one line,
> description on two, nothing overlapping.
>
> **Desktop dialog (417px inner):** 192 + 194 still fits, so still one row with
> the message at **211px** — identical to before the change, checked by reading
> `getBoundingClientRect()` and the computed `flex-basis` both ways.

## Still open

- **Only the redirects alert was driven.** The rule is global and measured, but
  the other 14 files were listed rather than opened one by one. The two-button
  ones (`commerce/product-options-consequence.tsx`,
  `crm/customer-overview.tsx`) are the most likely to have been broken and are
  worth a look when a persona reaches them.
- **A dismissible alert narrower than about 216px** would now drop its × onto its
  own line. Not reachable at 360px, where the sum is 228 against 253 available.
