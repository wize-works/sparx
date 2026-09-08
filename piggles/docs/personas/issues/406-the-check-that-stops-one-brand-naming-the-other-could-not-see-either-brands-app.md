# 406 — The check that stops one brand naming the other could not see either brand's app

**Status:** fixed (the check, and every live leak it found)
**Severity:** major
**Found by:** P03 · Juniper Row · act 82 · the example address in the notification form
**Surface:** `scripts/check-platform-brand.mjs`, and the Piggles console it never opened
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** the check now reads both brand trees and JSX text, and both new failure paths were made to go red and back to green

## What happened

The placeholder in "Address to notify" read:

    https://example.com/hooks/sparx

The other product's name, on a Piggles screen, in the box a shop owner is about
to type into.

`check:brand` exists to stop exactly this. It could not see the file. Its scan
root is `['wizeworks/packages']`, on the stated reasoning that "an app under
sparx/ or piggles/ serves ONE brand and may name it".

That is true of an app naming **itself**. It is false of an app naming the
**other one**, and the check implemented the rule symmetrically — which is to say
not at all.

## What should have happened

RULE — a check that hard-codes what it looks at is one assumption away from
scanning nothing and printing green. Piggles may say "Piggles" as often as it
likes. It may never say "sparx".

## Why it matters

A Piggles customer reading about sparx is being told about a product they cannot
buy, in a console whose every other word says the brand they did buy. It is a
support ticket with a brand confusion attached.

And the blindness is the bigger half. One placeholder is a typo; a check that
cannot see a whole application is a permanent hole that every future leak falls
through.

## The fix

**A second pass** over `piggles/**` for "sparx" and `sparx/**` for "piggles",
with its own debt file, the same shrink-only rule, and a floor of two trees so a
rename cannot make it blind.

**It learned what is DEAD.** These consoles were forked from each other, so a
surface reads `productCopy('some.key', <the other brand's sentence>)` and the
brand's own copy file supplies its own. Reporting those would bury the live ones
under 54 strings nobody can reach, so the pass now collects
`productCopy(key, default)` pairs whose key is overridden and skips them. The
count went **62 → 14** on that change alone.

**It learned to read JSX text**, which is where most prose in a React app
actually lives. That gap was found by trying to make the new pass go red and
watching it stay green: `placeholder="…sparx"` was seen, `<p>Featured by
sparx</p>` was not. A generics guard came with it — `Promise<Foo>` beside
`Bar<Baz>` reads as text to a `>…<` regex, and the first run reported
`(event: SparxEvent` as a brand leak.

## What it found, and what was done with each

| Where                      | Count | What                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Piggles console, live      | 2     | "your own sparx subscription", in onboarding. **Fixed** — now "what you pay us each month".                                                                                                                                                                                                                |
| Piggles console, dead      | 30    | behind `hiddenSurfaces` (partner.\*), `hiddenFeatures` (sparx Pay, sparx.market), or the section-rename table whose keys ARE the other brand's headings. **Banked**, and per piggles/CLAUDE.md they must not be "fixed" — renaming another product's marketplace invents something nobody can sign up for. |
| Shared code, new           | 1     | `packages/studio/.../settings-tab.tsx` said "This part is kept in place by **Piggles**" — the mirror-image leak, which a **sparx** customer would read. **Fixed** by removing the name.                                                                                                                    |
| Shared code, already fixed | 39    | strings in the old debt list that somebody had repaired without banking it. Banked; the shared debt went 61 → 23.                                                                                                                                                                                          |

**A correction to my own first reading.** Four keys — the payments intro, the
mailbox sign-in note, "not your accounting package", the migration help subject —
were reported as live by a scratchpad scan and are not: the `productCopy` call
spans lines, so a per-line key detector missed the override. All four already had
good Piggles wording. The duplicate entries added to `copy.ts` were removed;
TypeScript caught them as duplicate keys.

## Confirmed by

Both new failure paths made to go red, then restored:

> **A moved tree.** Pointed `CMS_DIR` at a name that does not exist →
> "found 0 event picker(s) … A moved directory makes this check scan nothing and
> pass." Exit 1.
>
> **A JSX-text leak.** Put "Copy this to sparx" as the text of a button in
> `webhook-secret.tsx` → "Brand check FAILED: 1 NEW string(s) naming the OTHER
> brand", naming the file. Reverted; green.

Final state: `1617 shared files, 23 known` · `2995 brand files, 30 known, 55
replaced by the brand's own copy`.

## Still open

- **The four `sparx Pay` strings and five `sparx marketplace` strings are only
  dead because of a RUNTIME seam** a static check cannot see. If somebody removes
  `commerce.payments.sparx_pay` from `hiddenFeatures`, the check stays green and
  the copy comes back. Making the seam legible to the check is not done.
- **`packages/db/prisma/seed.ts`** still names sparx in demo content. Seed only,
  and already in the shared debt, but it is what a new Piggles demo tenant reads.

## Rating effect

None on its own. The placeholder fix is folded into `cms.webhooks.detail`.
