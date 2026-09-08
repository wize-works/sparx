# 397 — The same failure was announced twice, and the red one never went away

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 79 · adding a redirect that already existed
**Surface:** mypiggles › every create-or-change dialog in the console (59 call sites, 41 files)
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** the duplicate refusal now appears once, in the dialog, and the corner stays clear

## What happened

Devi tried to add a redirect for an address that already had one. The dialog said
so, in the right place, with a button offering the way out. At the same moment a
red toast appeared in the bottom corner saying the same sentence with no button:

> **That didn't save**
> A redirect from "/sale" already exists.

She pressed **Change the existing one**, repointed the rule, and saved. A green
toast confirmed it:

> **Redirect changed** — Anyone visiting /sale now lands on /collections/new-in.

And the red one was still sitting directly above it. Two messages about the same
redirect, one saying it did not save and one saying it did, with nothing on
screen to say which was current. The red one never left, because the failed-write
toast is deliberately given `timeout: 0`.

## What should have happened

One message, in one place, and it stops being shown once it stops being true.

## How to reproduce

Every time, before the fix:

1. Content › Old links › Add redirect.
2. Old address that already has a rule. Add redirect.
3. Two messages appear. Press **Change the existing one**, save.
4. The red "That didn't save" is still there, beside the green success.

## Why it matters

The failed-write net exists so no failed save is ever silent — a real and
important floor, and its own file says the second half of the rule is "announce
it ONLY if nobody else did". It was breaking its own rule 59 times.

The cost is worse than noise. A permanent red message that outlives the failure
teaches people that red messages are wrong, which is the exact instinct the net
is built to protect. And beside a success message for the same record it is not
merely stale, it is contradictory: a person reasonably concludes something is
half-saved.

## Where it lives

`piggles/apps/workbench/components/write-failure-reporter.tsx`. It suppresses its
toast when the mutation has an `onError` — on the hook, or passed to `mutate()`.
It has no way to see a THIRD form: a surface that renders `mutation.error` in an
Alert. That is a render, and a mutation-cache watcher cannot see a render, so
those call sites looked exactly like ones that had said nothing.

Measured rather than guessed: **59 call sites across 41 files** bind a mutation
hook with no `onError` anywhere and read its `.error` to display it. The scan is
kept at `scratchpad/scan3.mjs`.

## The fix

Two halves, both in shared code so neither is a call-site patch.

**`shownInPlace`**, exported from `@wizeworks/query`. A named no-op passed where
an `onError` goes:

    create.mutate(input, { onSuccess: close, onError: shownInPlace });

It needs no new machinery — the hook already records whether a per-call `onError`
was passed, which is precisely the fact the reporter reads. A no-op is the honest
implementation: the signal is not what it does, it is that the caller claimed the
conversation. Applied at all 59 sites.

**Withdrawal.** The reporter now closes a write's failure message when a later
write from the same hook succeeds, and replaces rather than stacks when the same
write fails twice. The key is `writeIdentity(meta)` — also new in
`@wizeworks/query` — because every `mutate()` call is a different `Mutation` with
a different id, and the only thing a failure and the retry that fixed it share is
the hook they came from. The bookkeeping is `createWriteAnnouncements()`, in the
same package: both consoles' reporters need it and neither owns the other.

The reporter's own header comment now states all three rules, because it stated
two and behaved as though that were the whole list.

## Confirmed by

Driven as Devi:

> Add redirect › `/sale` › `/collections/winter` › Add. The refusal appears **in
> the dialog only** — the corner is empty. Pressed **Change the existing one**,
> saved, and the single toast on screen was the green "Redirect changed".

**RULE #7, the sweep touched 41 files across nine modules**, so a real job was done on one of them: Customers › Add a customer → **Priya Nandakumar / Loom & Larder / priya@loomandlarder.co.uk** saved first time, the pane swapped to her record, one green toast, nothing in the corner. `useCreateCustomer` is one of the 59.

The withdrawal half is covered by six unit tests on `createWriteAnnouncements`,
**proved red** by breaking `take()` (3 of 6 failed). It was not driven on screen:
after the sweep, reaching a net toast at all needs a pane that shows nothing
itself, and no safe way to force a server failure from one presented itself
without damaging Devi's data. That is a real gap in the confirmation, recorded
rather than dressed up.

## Rating effect

None on its own — it removes noise rather than adding capability. Folded into
`cms.redirects.list`, scored under [396].
