# 399 — One line she already had threw away the whole import

**Status:** fixed
**Severity:** critical
**Found by:** P03 · Juniper Row · act 80 · the first real use of Bulk import
**Surface:** mypiggles › Content › Old links › Bulk import (`POST /v1/redirects/bulk`)
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** the same paste that returned 500 with 0 rows now imports the rest and names the one it left out

## What happened

Devi rebuilt Juniper Row and pasted six moved pages in. The preview checked
them, found five it was happy with, and offered **Import 5**. She pressed it:

> **Could not import those redirects**
> Nothing was changed — try again in a moment.

Nothing was changed, and trying again in a moment did the same thing, forever.
Four of those five lines were perfectly good and had nothing wrong with them.
The fifth was `/sale`, which she already had a rule for — the single most likely
line to be on a re-exported list.

Measured rather than inferred: `POST /v1/redirects/bulk` answered **500**, and
the table held the same two rows afterwards as before.

## What should have happened

What the screen itself promises, twice: "the rest will still import without
them", and "Fix those lines and import them again — the rest are already in."

## How to reproduce

Every time, before the fix:

1. Content › Old links › Bulk import.
2. Paste four new redirects and one whose old address already has a rule.
3. Import. Everything fails; nothing is added.

## Why it matters

Bulk import exists for one moment — the day a business moves its website — and
that is the day her list overlaps what is already there. So the failure was not
an edge case, it was the main case, and it destroyed the good rows to report the
bad one. A merchant with 200 redirects to bring over gets a red message and an
unchanged screen, with no way to tell which line caused it.

Worse than the loss is what it teaches. The pane insists in three places that a
refused line does not affect the others. Every one of those sentences was false.

## Where it lives

`wizeworks/services/api-rest/src/routes/v1/redirects/index.ts`. The loop ran
inside ONE `withRequestTenant` transaction with a try/catch around each row and a
`skipped` array for the failures. That reads correctly and cannot work: a
unique-constraint violation aborts the whole POSTGRES transaction, and catching
the error in JavaScript does not revive it.

Measured on the real database rather than argued:

    BEGIN;
    CREATE TEMP TABLE t(a int UNIQUE);
    INSERT INTO t VALUES (1);        -- INSERT 0 1
    INSERT INTO t VALUES (1);        -- ERROR: duplicate key value
    SELECT 'after the caught failure';
    -- ERROR: current transaction is aborted, commands ignored until end of
    --        transaction block

So after the first refused row, every later row AND the audit write failed, the
error escaped the handler, and the transaction rolled back — taking the good rows
with it. `inserted` and `skipped` were both discarded. The per-row report the
surface renders was **unreachable for any database-level refusal**.

It only ever worked for refusals raised in JavaScript. `assertNoChain` throws
`conflict()` before touching the database, so loops and self-redirects reported
correctly — which is why this looked fine until someone imported a list that
overlapped their own.

## The fix

`routes/v1/redirects/import-rows.ts`, new, and two things in it:

- **A SAVEPOINT per row.** Postgres' own answer to "carry on after a failed
  statement": the failure rolls back to the savepoint and the transaction is
  healthy again. This is what makes the promise structurally true rather than
  true for the failure modes someone happened to think of. One savepoint name,
  established and ended every iteration, so the stack never grows past depth 1
  even at the 5000-row cap.
- **The duplicate pre-check the single create already did.** `findFirst` before
  `create`, so the commonest refusal never reaches the constraint and can be
  explained in a sentence that names where the existing rule points.

A skip reason is now the sentence an `ApiError` already carries; anything else
gets a plain line rather than a driver dump, because that text was going onto her
screen.

**And the bulk route now publishes `redirect.added` per imported row.** It
published nothing at all, while adding one rule by hand published one — so a
migration of 200 rules told the storefront cache purge nothing (it subscribes to
`redirect.*`) and fired no webhook, and `redirect.added` is offered as a
subscribable event in the console.

## Confirmed by

Driven as Devi, twice, because two different paths had to be shown.

> **The refusal that used to poison it.** With the client's own duplicate check
> temporarily blinded so a duplicate reached the server — the exact input that
> returned 500 with zero rows — the pane read: **"2 redirects imported. One line
> was left out, for this reason: /sale — A redirect from "/sale" already exists
> — it goes to "/collections/autumn". Everything else on your list is in."**
> `/gift-cards` and `/size-guide` are in the table; `/sale` still points at
> `/collections/autumn` with its 3 hits.
>
> **A refusal raised in code.** `/press → /press-2024` against an existing
> `/press-2024 → /press`: **"2 redirects imported … /press — Redirect would
> create a loop via /press-2024 → /press."** `/journal-old` and `/team` landed.

**RULE #7** — a shared route changed, so a real job elsewhere: Sell › Add a
product → **Ridge Wool Coat, $265, RIDGE-WOOL-COAT-1**. Saved first time, the
pane swapped to its record, "Not on sale — saved but hidden".

## Still open

- **The cache purge worker is not deployed**, so an imported redirect still takes
  up to five minutes to reach visitors. Now at least the event is published.
- **A 5000-row import publishes 5000 events**, each opening its own short
  transaction to enqueue webhook deliveries. Correct but not cheap; a batch
  enqueue in `@wizeworks/api-core`'s `publish` would be the shared fix, and it
  belongs there rather than here.
