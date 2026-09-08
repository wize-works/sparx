# 384 — The console spoke British English to a shop in Denver

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · reading the field label under a number box
**Surface:** mypiggles › 38 files across Shop, Stock, Content, Customers, Staff, Money, Partner
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** the Categories pane, reading "Order among its neighbors"

## What happened

Devi cuts and sews in Denver. Opening a category to reorder it, she read:

> **Order among its neighbours**
>
> Categories at the same level are shown lowest number first. Leave it at 0
> unless you want this one to jump ahead of its neighbours.

Once seen, it was everywhere. **52 lines across 38 files** used British
spellings — in field labels, placeholders, help text, empty states, and one
screen-reader label:

| What it said                              | Where                        |
| ----------------------------------------- | ---------------------------- |
| "Order among its neighbours"              | a category                   |
| "Left with a neighbour…"                  | recording a handover         |
| "Nothing in your catalogue is coded …"    | building a bill of materials |
| "when their tickets and licences run out" | staff                        |
| "A name you will recognise on your list"  | a stock source               |
| "The grey summary shown under the link"   | a page's search preview      |
| "used to personalise the emails"          | an email sequence            |
| "part of the partner programme"           | the partner gate             |
| "Invoice number, cheque number…"          | recording an expense         |
| `Add {title} to favourites`               | a pane tab, read aloud       |

The worst of them is the last two.

**Money.** `paymentMethodLabel` is the single place the console names how money
moved, and it rendered the stored value `check` as **"Cheque"**. So a shop owner
who had just been handed a check, recording it, watched the console call it
something else. That file's own header says it exists because four panes
disagreed and one of them "spelled a cheque 'Check'" — the disagreement was
settled, and settled on the wrong side of the Atlantic while the stored value
stayed American.

**Screen readers.** On a pane tab the visible tooltip said "Add to favorites"
while the `aria-label` beside it said "Add to favourites" — the same control
telling a sighted person and a blind person two different words.

## Why it happened

There is no lint rule for it, and nothing else would catch it: every one of these
files passes typecheck, ESLint and Prettier, because a spelling is a valid string.
It is the plainest form of [[feedback_absent_behaves_like_fine]] — wrong copy
renders exactly as well as right copy.

## The fix

Every sentence a person reads, and every label a screen reader speaks, now uses
American spelling: neighbors, catalog, license, recognize, gray, personalize,
program, summarize, authorized, fulfillment, traveling, favorites, **check**.

Two decisions worth writing down:

- **Search keywords got the American spelling ADDED, not swapped.** Keywords are
  match terms, not display text: an owner typing "organizations" has to find the
  same screen as one typing "organisations". Both are now listed, which is what
  `dropship.ts` already did for "fulfilment"/"fulfillment". This closed a real
  findability hole — before, the CRM Companies screen could only be found by the
  British spelling.
- **Identifiers and code comments were left alone.** 529 more occurrences live
  in variable names (`FAVOURITES_LIST`, `normalise`, `summariseScopes`) and in
  comments about grey buttons and centred columns, across 293 files. None of them
  is read by a person using the product, and a 293-file rename would bury this
  and every other change in the same tree. It is a mechanical cleanup, and it is
  written down below rather than done here.

## Confirming it

Opened Knitwear as Devi: **"Order among its neighbors"**, and underneath,
"…jump ahead of its neighbors." Swept the whole console afterwards for the same
words in anything that renders; nothing left but identifiers and comments.

## Still open

- **529 occurrences in identifiers and comments** across 293 files. Swept and
  checked: not one of them renders. But the house rule covers code too, and doing
  it in one pass on a quiet tree is the right way rather than piecemeal.
- **Nothing enforces it.** This will come back the next time somebody types
  "colour", and the only thing that caught it this time was a persona reading a
  field label. A word list in the lint config would cost little and hold.
- **`surfaces/partner/gate.tsx` still carries sparx wording in its fallbacks**
  ("This account isn't a sparx partner"). Harmless today — the Piggles lexicon
  defines both keys, so the fallback never renders — but it is one deleted
  lexicon entry away from naming the other product to a Piggles tenant, and the
  boundary check does not look for that word inside this console.
