# 386 — Fifty-six refusals all said somebody else had changed it

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · naming a tag that another of her sites already had
**Surface:** mypiggles › every screen that writes
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** the same refusal appearing in the toast and inline, saying the same thing

## What happened

Typing a tag whose web address another of her sites already used, Devi got two
answers at once. Inline, in red, the true one:

> "Craft" on Juniper Row Sample Sale already uses the web address "craft", and a
> label's address has to be unique across your whole business. Give this one a
> different one.

And in the corner, a toast:

> **That didn't save**
> Someone else changed this while you had it open, so it was not saved over.
> **Reopen it to see their version, then make your change again.**

Nobody else had changed anything. Devi runs her business alone. Following that
advice — reopen the page, retype the tag — produces the same refusal, because the
cause is a name clash and reopening cannot touch it.

## Why it happened

`describeWriteFailure` mapped **every 409** to that sentence. Its own header
carries the rule it was breaking:

> One rule earned the hard way: where one OUTCOME has two causes with different
> remedies, it gets two messages. Advice is part of the contract — a sentence
> that sends somebody to fix a connection that was never broken has cost them
> more than saying nothing would have.

There are **56 `conflict()` call sites** in api-rest and every one of them is a
refusal whose message was already written for the reader:

| What the server said                                         | What she read             |
| ------------------------------------------------------------ | ------------------------- |
| "That domain is already connected to a site."                | someone else changed this |
| "Verify this domain before making it canonical."             | someone else changed this |
| "The address that came with this site is its permanent one…" | someone else changed this |
| "This account is already a partner."                         | someone else changed this |
| "This product is already imported into your catalog"         | someone else changed this |

**And the failure it was describing cannot arrive as a 409 at all.** A genuine
stale write raises **412** (`assertIfMatch`), which had no branch and fell through
to the generic 4xx one — so the real concurrent edit put the raw server sentence
on screen: _"If-Match precondition failed — entry was modified by someone else.
Reload before retrying."_ The two were exactly swapped, and the module had **no
tests at all**.

### A third one, found by writing those tests

Every test failed with "You're not connected to the internet." The guard read:

```ts
return typeof navigator !== 'undefined' && !navigator.onLine;
```

Node ships a global `navigator` with no `onLine`, and `!undefined` is `true`.
Anywhere the property is absent rather than false, **every failed write claimed
the connection was down** — sending the reader to fix a network that was never
broken, which is the precise example the header rule uses. An unmeasured value
must not render as a measurement ([[feedback_never_present_absence_as_measurement]]).

## The fix

- **409 shows the server's own sentence**, which is the entire reason
  `conflict()` takes one. The two named cases that carry their own remedy
  (`SLOT_UNAVAILABLE`, `INVALID_BOOKING_STATE`) are unchanged.
- **412 gets the "someone else changed this" message**, in plain words rather
  than the header's, which is where it always belonged.
- **Offline requires the browser to have SAID so** — `navigator.onLine === false`,
  never the absence of an answer.

## Confirming it

Re-typed **Craft** on Juniper Row. The toast and the inline message now say the
same thing, and it is the thing that is true.

**Twelve tests**, the module's first. Proved red: with the old 409 branch and the
old offline guard restored, ten of the twelve fail.

## Still open

- **Two places say it.** The pane's own inline message and this reporter's toast
  now agree, which is a large improvement on contradicting each other, but a
  refusal shown twice is still shown twice.
- **`conflict()` is one code for many refusals.** Passing the message through is
  right, but it means the quality of every one of those 56 sentences is now load
  bearing — and they have never been read as a set.
- **Nothing else tests `write-failure.ts`'s callers.** The mapping is covered now;
  which panes actually route their errors through it is not.
