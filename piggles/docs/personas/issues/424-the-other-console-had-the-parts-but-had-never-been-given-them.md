# 424 — The other console had the parts and had never been given them

**Status:** fixed
**Severity:** major
**Found by:** act 89 · closing the sparx-piggles console parity list
**Surface:** sparx › the operator console — failure states, toolbars, stock costing, ⇧-click
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

`check:console-parity` compares the two consoles by NAME. Its own header admits
the two things it cannot see: it cannot find what NEITHER console has, and it
compares names rather than depth. Measuring depth found four items, and the file
sizes badly under-reported every one of them.

**1. `<PaneLoadError>` was built in sparx and never adopted.** Two call sites,
against 200 in piggles. Roughly three hundred surfaces had each invented their
own failure state, and the invented ones were wrong in the way the component
exists to prevent: a record that had been DELETED said "the server could not be
reached", over a **Try again** button that will fail forever, because a 404 does
not become a 200 by being asked twice. A failed list and an empty list drew the
same grey picture, so "nothing here yet" and "this did not load" were
indistinguishable.

**2. `lib/api-error.ts` silenced every `VALIDATION_ERROR`.** It returned its own
fallback whenever the code matched, so a service explaining a real business rule
in a real sentence reached the operator as "Check what you entered." The
schema's own generic complaint and the service's considered one were treated as
the same thing.

**3. The toolbar could not fold.** `useToolbarFit` only folds what it has been
TOLD about, and 307 toolbars were still passing their contents as `children`.
A slot the bar cannot name is a slot it cannot move, so a narrow pane spilled
onto extra rows instead of collapsing into the overflow menu.

**4. `inventory.costing.uncosted` did not exist in sparx.** The console warned
that stock had no cost recorded and then offered nowhere to go and fix it. The
API route was already there and shared; only the screen was missing.

Two more defects turned up on the way, neither on the list:

- **⇧-click was silently broken.** Chrome — the launcher, a favourite, the app
  panel — has no pane to name as the anchor, and `positionFor` reads a missing
  anchor as "no opinion". So every ⇧↵ from outside a surface quietly opened a
  plain tab, in a command palette whose own footer advertises "⇧↵ alongside".
  Piggles has the anchor fix; sparx never got it.
- **Five dead `ctx.open` calls** — typos such as `commerce.products.detail` for
  `commerce.product.detail`. They were sitting in `check-surface-routes.mjs`'s
  `KNOWN_DEAD_OPENS` behind a note saying they were waiting on somebody who owns
  sparx. Every one was a button that opened nothing.

## What should have happened

A capability built once should reach both consoles. RULE #7 says fixes travel;
these were not fixes that failed to travel but PARTS that had never been carried
at all, and each one had a visible consequence on screen.

## Why it matters

A deleted record telling an operator the server is down sends them to check
their internet. A **Try again** that can never succeed is worse than no button.
And a warning with no destination — "this stock has no cost recorded" — is the
console pointing at a problem it will not let anybody solve.

## Where it lives

- `sparx/apps/workbench/lib/api-error.ts`
- `sparx/apps/workbench/components/pane-load-error.tsx`
- `sparx/apps/workbench/components/pane-toolbar.tsx` and the toolbar family
- `sparx/apps/workbench/surfaces/inventory/uncosted-*.ts(x)`
- `sparx/apps/workbench/lib/workbench/controller.ts` (the ⇧-click anchor)
- `scripts/check-surface-routes.mjs` (`KNOWN_DEAD_OPENS`, now empty)

## The fix

`PaneLoadError` gained `error` and `noun`, so the reason is READ from the
failure rather than assumed: `paneLoadReason()` returns `missing` for a 404 and
`unreachable` for anything else, and the component itself suppresses **Try
again** when the thing is gone. 98 call sites now use it, 42 of them detail
panes passing the error. Four deliberately pass neither, each with the reason
written at the call site — three cannot produce a 404 (the record is selected
out of a list that already loaded), and one means "never configured".

`api-error.ts` now distinguishes the schema complaining about its own shape
(details present, or the generic sentence) from a service sending a considered
message, and only replaces the first.

The toolbar family was ported whole and 307 toolbars migrated off `children`
onto named slots. `inventory.costing.uncosted` was built and registered. The
⇧-click anchor now falls back to the active pane. The five typos are fixed and
the allowlist is empty.

Windows mode was ALSO ported, but it is not part of this defect: it was a
recorded decision, stated in `lib/window-mode.ts`'s own header and backed by 22
parity exceptions. Brandon reversed it on 2026-09-05 — "we have proven its worth
in piggles" — and the header in both consoles was rewritten so it stops claiming
otherwise.

## Confirmed by

Driven on the screen, not from the checks:

> Opened a product pane in sparx, deleted the row underneath it, and reloaded.
> The pane now says the piece is no longer here and offers no Try again. Forced
> a 400 on the same pane and got the service's own sentence instead of "Check
> what you entered", with a Try again that works. Narrowed a pane to 360px and
> watched the toolbar fold into the overflow menu with every icon wearing its
> label. Opened **What your stock cost you** from the stock warning and set a
> cost. ⇧-clicked a favourite and it landed beside the pane I was reading.

`check:console-parity` reports 0 divergent; sparx's excused `lib` files went
27 to 10, and reachable modules 154 to 174.

## Rating effect

None yet — these are sparx panes and sparx is not scored in
[rating.md](../rating.md), which covers the Piggles console. The piggles rows
are unaffected; nothing here changed a piggles screen.
