# 392 — The screen told her eight things to fix and gave her no way to fix any of them

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · opening Page check, an unrated pane
**Surface:** mypiggles › Get Found › Things worth fixing › Page check
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** all four kinds of page, each landing in its own editor

## What happened

Devi opened **How people find you**, pressed **See all pages**, and clicked the
page at the bottom of the list. The page check told her, in plain words, exactly
what was wrong with it:

> **Fix this first** — A very short title wastes the best chance you have of
> being found. Aim for 30 to 60 characters.

and then eight more findings under **Worth fixing**: no summary, no main heading,
nothing to read, no share picture.

Then it stopped. The entire pane had **two** buttons — Refresh, and Copy a link
to this panel. Nothing in the body was interactive at all. She had read nine
specific instructions on a screen that knew precisely which page it meant, and
her only way to act on any of them was to memorize the address `/book`, leave for
**My Site**, find the page again in a list, open it, open its settings, and hope
she was looking at the same page.

The screen diagnosed and could not dispatch. That is the moment her intent was
highest and the app's answer was to make her start over.

## Why it happened

The pane is deliberately read-only, and the file said so: _"A READ-ONLY detail
pane, not a form: there is nothing to save here."_ That part is right. Nothing
here should be edited in place; the score is computed, not typed.

But **read-only was treated as actionless**, and those are different things. The
pane already holds `entityType` and the entity's own id, because
`auditDetailParams` puts them in the address — which is the whole reason a page
check deep-links to a page rather than to a scoring run. It had everything needed
to open the one editor that can change what it was complaining about, and used
none of it.

## The fix

One action in the toolbar, next to the score: **Edit this page**.

It resolves per kind of page, checked against the real tables rather than assumed
from the names:

| What was scored | Where it goes      | Its id is a row in             |
| --------------- | ------------------ | ------------------------------ |
| Page            | the page editor    | `builder_pages`                |
| Article         | the writing editor | `content_entries`              |
| Product         | the product editor | `commerce_products`            |
| Collection      | the group editor   | `commerce_product_collections` |

**The button wears the hue of where it is going**, not of the screen it sits on:
Builder's for a page, Content's for an article, Sell's for a product. The jump
leaves this module, so it says so before it is taken. `ToolbarAction.module`
already existed for exactly this, so the action stays a value and still reads
correctly once the bar folds on a narrow pane.

**The label comes from `entityLabel`**, not from a second table of words. The
line above the score already says "Page" or "Article"; a hardcoded button label
would have been a second place for the same thing to be named, and a second place
to drift.

**It is gated on the module, not on the audit existing.** An audit is only
written for something that exists, so a product scorecard is usually proof Sell
is on — but a module switched OFF after its pages were scored leaves the rows
behind, and a button into a module the rail no longer shows would land nowhere.
It asks the same gate the rail and the command palette ask rather than inventing
a third answer.

## Confirming it

Driven as Devi, all four kinds, each one clicked and the destination read:

| From the check on | Landed on                                                    |
| ----------------- | ------------------------------------------------------------ |
| Book (a page)     | the page editor, **Title in search results** in its Settings |
| Privacy Policy    | the writing editor, Title and Body                           |
| Marlow Knit       | the product editor, which carries its own SEO tab            |
| New in (a group)  | the group editor, Name and Description                       |

The check stays open in its own tab beside the editor, which is the useful shape:
she can read the finding and change the field without either one hiding the
other.

**At 360px** the bar keeps the action as its icon, in its module's color, beside
the score — it does not fold into the popover and it does not disappear.

## What this did NOT do, and why

- **No "view the live page" link.** The page might not be published, and a link
  that sometimes 404s with nothing saying why is a new defect, not a feature.
  Previewing is already a considered flow that deliberately keeps its token
  inside a pane rather than in an address bar; a second, weaker version of it
  here would contradict that.
- **No per-row jump on the LIST.** The list's row opens the check, and the check
  now opens the editor. Two clicks with a reason in between is the right shape —
  she should see WHY before she changes anything. A row with two destinations is
  a row nobody can predict.

## Still open

- **The list's own gap note is now half-closed**, and `rating.md` says so. The
  chain works end to end; what remains is that the list itself carries no jump,
  which is deliberate (above) rather than unfinished.
- **The jump goes to the editor, not to the FIELD.** She lands on the page editor
  and still has to open Settings and scroll to "Title in search results". Closing
  that means the target surfaces accepting a "focus this field" parameter, which
  is four surfaces changing to serve one caller.
- **Nothing re-scores after she fixes it.** She has to come back and press
  Refresh, which does re-score. The check does not know an edit happened.
- **`/book` is scored at all.** So are `/account/login` and `/account/register`,
  and all three sit near the bottom of her list. A page a shopper signs in on is
  not something a clothing maker can meaningfully write a search title for, and
  three of her worst scores are pages she did not write and cannot usefully
  improve. Whether those belong in the list is a separate question from this one.
