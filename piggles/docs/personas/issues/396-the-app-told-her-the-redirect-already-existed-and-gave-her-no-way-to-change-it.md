# 396 — The app told her the redirect already existed, and gave her no way to change it

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 79 · repointing an old sale link
**Surface:** mypiggles › Content › Old links
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** a row opens its rule, saving repoints it with Times used intact, and the duplicate refusal now hands her into the rule she collided with

## What happened

Devi had a redirect sending `/sale` to `/shop`. The sale moved to a collection
page, so she went to change where it points. There was nothing to click. The rows
were not clickable, the only button on a row was the red bin, and the toolbar
offered "Add redirect" and "Bulk import".

So she did the obvious thing and added it again. The app answered:

> **Could not add that redirect**
> A redirect from "/sale" already exists.

True, clear, and a dead end. The sentence named the obstacle and the way past it
did not exist anywhere in the product — there was no edit in the pane, no edit in
the API, nothing. Her only route was to cancel, find the row, and delete it
through a confirm that warns:

> …any search-engine standing it was passing on is lost.

and then type the same address in again. To change one word of a destination she
had to accept a warning about losing the thing the redirect exists to preserve.

## What should have happened

A rule she can see is a rule she can change. And a refusal that names an obstacle
has to offer the remedy — that is the standing rule about advice in a message
being part of the contract, learned on issue 341: the app must not tell someone
to do something the app does not let them do.

## How to reproduce

Every time, before the fix:

1. Content › Old links, with at least one rule (`/sale` → `/shop`).
2. Try to change where it points. There is nothing to click.
3. Add redirect, `/sale` → anything, Add redirect.
4. Read the refusal. Nothing on screen or in the API can act on it.

## Why it matters

Moving a page is the single most common reason a person opens this screen, and
repointing a redirect is what you do the second time you move it. The workaround
was not just slower — it was **lossy in exactly the dimension the feature is
for**. A redirect carries search standing from the old address to the new one;
deleting and re-adding drops it, and the confirm says so. So the product's own
warning told her the cheap path was expensive, and offered no other.

## Where it lives

- `wizeworks/services/api-rest/src/routes/v1/redirects/index.ts` — had POST,
  POST `/bulk`, DELETE. No PATCH.
- `piggles/apps/workbench/surfaces/cms/redirects-list.tsx`,
  `redirects-table.tsx`, `redirects-add-dialog.tsx`, `redirects-data.ts` — whose
  own comment asserted "a redirect has no manage surface".

## The fix

**`PATCH /v1/redirects/:id`.** Destination and permanent/temporary only. The old
address deliberately stays fixed: it is the link people are already following, so
changing it is a different rule rather than a correction, and the honest way to
do that is to remove this one and add the new one — which says out loud that the
old address goes dead. It reuses `assertNoChain` (only when the destination
actually changed), leaves `hitCount` alone, writes an audit entry, and publishes
a new `redirect.changed` event so the site cache purges the same way an add does.

**A row opens its rule.** The table row is clickable and keyboard-focusable; the
delete button stops the event so the bin never opens the editor.

**One dialog, both jobs.** "Add a redirect" and "Change this redirect" are the
same three fields and the same question, so they are the same component. In
change mode the old address is read-only and its help text changes to say why.
Save stays disabled until something actually differs.

**The refusal now has a door.** A duplicate shows **Change the existing one**,
which opens the rule she collided with — found in the rows already loaded, since
the refusal can only have come from a rule the list is showing. Her typed
destination carries across the hand-off, because that is the one thing she had
already decided and making her retype it defeats the button.

Two things went wrong while building it, both worth recording:

- **The first button was invisible.** `variant="outline"` `color="error"` inside
  `AlertContent` renders red-on-red on a solid error alert: present in the DOM,
  taking up space, unseeable. Caught by zooming the screenshot, not by looking.
  Fixed with silica's own documented pattern — `AlertActions` and `variant="soft"`.
- **Then it broke at 360px**, which is issue 398.

`redirects-data.ts` and `redirects-list.tsx` were both over the 250-line ceiling
before this work touched them, so they were split under RULE #0.5 into
`redirects-format.ts`, `redirects-filter.ts`, `redirects-remove.ts` and
`redirects-dialog-fields.tsx`. `redirects-import.tsx` is 331 lines and was not
touched.

## Confirmed by

Driven as Devi, on screen, three times over:

> Clicked the `/sale` row — "Change this redirect" opened with the stored values
> and the old address locked. Changed the destination and saved: toast read
> "Redirect changed — Anyone visiting /sale now lands on /collections/autumn",
> and **Times used stayed at 3** (the count belongs to the old address, so it
> survives a repoint). Then Add redirect › `/sale` › `/collections/spring` ›
> Add: the refusal appeared with **Change the existing one**, which opened the
> `/sale` rule with `/collections/spring` already in the destination box and Save
> enabled.

Also proved on the live site: `/shipping` returns **308**, `/sale` returns **307**
before the type was changed, and a shopper following `/sale` lands on the real
collection page.

## Still open

- **A change takes up to five minutes to reach visitors.** `publicGet` caches
  with `revalidate: 300` and the purge would come from `cache-revalidation-worker`,
  which terraform shows is not deployed. Pre-existing for add and delete too, not
  introduced here.
- **`redirect.changed` is not webhook-subscribable.** The event picker it would
  have to be declared in lives under `sparx/`, which Piggles may never edit
  (RULE #0). Noted in the route, and `check-webhook-events` passes because the
  event is deliberately absent from the picker rather than missing from it.

## A check that was lying

`scripts/check-webhook-events.mjs` read its event list with
`matchAll(/'([^']+)'/g)`, so an apostrophe in a code comment — "the storefront's
cache" — opened a string and swallowed the next twenty keys. It then reported the
survivors as missing and named the wrong file. The same script already documented
that exact trap and had fixed it in one of its three readers. All three now read
line by line and skip comments, and it was proved to survive the apostrophe.
