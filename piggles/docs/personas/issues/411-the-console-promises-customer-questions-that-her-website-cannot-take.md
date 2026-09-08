# 411 — The console promises customer questions her website cannot take

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 83 · reading the Questions tab beside her first review
**Surface:** mypiggles › Sell › Reviews & questions — Questions tab · and her product pages
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi opened **Reviews & questions** on The Ash Overshirt and looked at the
**Questions** tab. It said:

> **No questions yet**
> Nobody has asked anything about The Ash Overshirt. **When they do, the question
> appears here for you to answer before it goes on the page.**

They cannot. Her product page has a **Reviews** block with a working
**Write a review** button, and nothing anywhere that lets a customer ask
anything. Read as the owner, that sentence is a promise about a thing that will
never happen, and she will wait for it.

## What should have happened

Either customers can ask, or the screen says they cannot and how to turn it on.
A tab that describes an inbox nobody can post to is worse than no tab.

## Why it matters

For a clothing label this is the question that sells the piece — "is the S going
to be too boxy on me?" — and Devi's own product copy is written to answer exactly
that kind of thing. She would answer them all day. She has been given a screen
for it and no way for anyone to reach it.

It also quietly costs her the follow-on sale: **there is no "you may also like"
rail on her product pages either** (see below), so a customer who reads all the
way down the Ash Overshirt is offered nothing else.

## What was measured, on her live page

Loaded `/products/the-ash-overshirt` and read the rendered document, not the
source:

    headings:  Fabric & construction · Fit · Care · Materials · Made in · Reviews
    "Questions" anywhere in the text:   false
    "may also like" anywhere:            false
    elements carrying data-section-type: 0

## What is known about the cause, and what is not

**Known.** The capability is fully built. `product-questions` is a real section
with a schema (`ProductQuestionsConfig`, heading + `showForm` + empty text), a
renderer (`ProductQuestionsSection`), a working ask form posting to the public
questions endpoint, and a case in the section renderer's switch. It is also in
the **shipped default** composition:

    PRODUCT_DEFAULT = buy-box · description · fitment · reviews · questions · related

and her tenant has **no page layout rows at all** — checked in the database —
which is exactly the case that default exists to cover.

**NOT known, and not to be guessed at.** Her page carries **zero**
`data-section-type` wrappers, and the section renderer puts one on every section
it draws. So the page she is looking at did not come through that renderer, and
the route actually serving it has not been identified. Every explanation offered
so far — a stale build, a layout key resolving away from `default`, a section
returning null — is contradicted by that one measurement.

Recorded as unknown rather than filled in with the most plausible story. Chasing
it further was out of proportion to the pane under test, so it is filed with the
measurements rather than a diagnosis.

## Fixed 2026-09-05 — the cause, and it was not what this file guessed

**The first diagnosis in this file was wrong, and is left standing above** because
the wrong guess is why the right one took as long as it did. The measurement was
right — zero `data-section-type` wrappers — and the conclusion drawn from it
("the route serving her page has not been identified") was not: the route IS
`app/products/[handle]/page.tsx`. It simply takes a **different branch** than the
one this file was reading.

That route has two paths. The legacy `SectionRenderer` path, which is where
`PRODUCT_DEFAULT` and its `product-questions` section live, and which stamps a
`data-section-type` on every section it draws. And above it, taken FIRST, the
**silica** path: when a `commerce.product` collection template is published, the
page renders through the silica walker instead, and that walker stamps no such
attribute. Juniper Row has a published one. So the default composition this file
cited was real, correct, and never consulted — which is exactly what a zero-wrapper
page looks like.

**The actual gap: `commerce.product-questions` did not exist.** Every other half
was built — the moderation queue, `moderate_question`, `answer_question`, the
public GET and POST endpoints, the `QuestionForm`, the legacy bound section — but
the silica path can only render what is in the host-core registry, and reviews had
an entry there while questions had none. There was no block to place, so no product
page built the silica way could take a question. The console's queue was a doorbell
with no button fitted.

### What changed

- **`wizeworks/packages/silica-catalog/src/host-nodes.ts`** — a new
  `commerce.product-questions` host core, registered beside reviews and unpinned for
  the same reason (a shop that would rather answer by email must be able to take the
  section off the page). Author-tunable heading, empty line, and a switch for the
  form.
- **`wizeworks/apps/site/components/products/product-questions-view.tsx`** — new. The
  markup, shared on purpose with the legacy bound section, exactly as
  `product-reviews-view.tsx` already is for reviews. The two differ only in where the
  questions come from and must not differ in what a shopper sees.
- **`wizeworks/apps/site/components/products/product-questions-core.tsx`** — new. The
  host core, fetching its own questions from the handle the route puts in scope.
- **`wizeworks/apps/site/components/silica-host-cores.tsx`** — the case that mounts it.
  `host-cores-wired.test.ts` already fails a registered key with no case here, which
  is what stopped this from shipping as a placeable block that renders nothing.
- **`wizeworks/apps/site/components/sections/product-questions.tsx`** — rewritten to
  delegate to the shared view, so the two paths cannot drift.

One registry, both consoles: the block appeared in the sparx palette at the same
time and needed no second change.

### Proved, as Devi and as a shopper

1. **Devi**, in the studio: My Site → Page → Each product → Insert → typed
   "questions" → **Questions and answers** under _Your shop_. It landed directly
   under Reviews. Save, Publish.
2. **Her live page** now reads `… Reviews | Questions`, with "No questions yet —
   ask us anything." and an **Ask a question** button.
3. **A shopper**, Tomas Villalobos, asked a real one from the shop: sleeve length on
   the L at 6′2″, and whether the canvas shrinks in a warm wash. The form answered
   "Thanks for your question! It’ll appear once it’s answered."
4. **Devi’s console** showed **Questions (1)**, marked _Waiting for you_, with his
   words. She answered it (26 inches from the shoulder seam, preshrunk, and an offer
   to cut an extra inch) and pressed **Show it on the page** → _Question published_.
5. **Back on the shop**: his question with her answer beneath it, badged **Store**.
6. **At 360px**, in an injected iframe (the window was never resized): reads
   correctly, no horizontal overflow, section 292px inside the viewport.

### What this file asked for and did NOT need doing

Step 3 of the plan below — rewording the Questions empty state to stop promising —
is **withdrawn**. It was the right instinct against a gap that could not be closed,
and the gap is closed: questions now arrive exactly as that sentence says they do.
Softening it would have been a truthful screen describing a broken product; the
product is what was broken.

## The related rail is a separate thing, and is now issue 412

The "you may also like" half of this report has been split out. It is not the same
defect: the rail was never missing. She already had one on the page, bound to
`commerce.featured`, and it renders nothing because she has tagged nothing
`featured` — which is correct, documented behavior (issue 187). Repointing it is a
one-control change in the studio and is tracked separately.

## What it would take

1. Identify which route renders a product page on the tenant site, since it is
   demonstrably not `app/products/[handle]/page.tsx`'s `SectionRenderer` path.
2. Give that path the questions block and the related-products rail, matching the
   default composition.
3. Until (1) and (2) land, **the Questions tab must stop promising.** Its empty
   state should say questions are not on her pages yet and point at the way to
   add them, rather than describing an arrival that cannot occur.

Step 3 is the console-side half and is small; it is deliberately NOT done ahead
of (1), because the honest wording depends on what the answer to (1) makes
possible.

## Rating effect

Holds `commerce.product.reviews` down on Ease — see [rating.md](../rating.md).
