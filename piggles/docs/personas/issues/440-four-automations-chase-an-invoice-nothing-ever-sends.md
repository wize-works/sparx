# 440 — Four automations chase an invoice that nothing ever sends

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 102
**Surface:** Automations, and Money › Invoices
**Filed:** 2026-09-07
**Fixed:** 2026-09-07
**Confirmed by:** re-ran the Invoices list as Devi — INV-000001 reads "Owed · Not sent", the Not sent filter returns 1 of 1, and removing the seed guard turns the new test red

## What the database says

Nine invoice automations are live on Juniper Row:

| Automation                                | Fires on                             |
| ----------------------------------------- | ------------------------------------ |
| Invoice reminder (3 days before due)      | daily scan                           |
| Invoice overdue (7 days)                  | daily scan                           |
| Invoice overdue (14 days — second notice) | daily scan                           |
| Invoice overdue (30 days — final notice)  | daily scan                           |
| Payment received — send receipt           | `crm.billing_document.paid`          |
| Estimate approved — advance task          | `crm.billing_document.stage_changed` |
| B2B invoice due reminder                  | daily scan                           |
| Subscription invoice — email              | `subscription.invoiced`              |
| Deal won — create invoice task            | `crm.deal.stage_changed`             |

**Not one of them fires on `crm.billing_document.created`.** Nothing sends the
invoice.

The email catalog says the same thing from the other side. Seven invoice-shaped
templates exist — `invoicing-reminder`, `invoicing-overdue`,
`invoicing-overdue-2`, `invoicing-overdue-final`, `invoicing-receipt`,
`b2b-invoice-due`, `subscription-invoice` — and **there is no "here is your
invoice"**. `subscription-invoice` is the closest thing and belongs to
subscriptions.

## What that means for an owner

She raises an invoice. Nobody is told. Three days before it is due the platform
emails her customer a **friendly reminder** about a bill they have never seen.
Four days after that: **overdue**. Then a second notice, then a final notice.

Four escalating chase letters about a document that never left the building.

A manual Send exists and works ([439]), so an owner who knows to press it is
fine. The dunning ladder does not know whether she pressed it.

## Why this was not simply "add an automation"

The obvious fix — one seed on `crm.billing_document.created` — is right for the
default `invoice` workflow, whose single relevant stage is `open` and which every
new tenant starts on. It is not right on its own, and the workflow table says why:

```
invoice          Invoice     open      numbers INV-
service-repair   Estimate    draft
service-repair   Approved    committed
service-repair   In Progress open
service-repair   Invoiced    final     numbers INV-
```

`service-repair` has **two** payable stages. A rule of "send when the document
becomes payable" emails the customer at "In Progress", which is work underway and
not a bill, and again at "Invoiced", which is. And there is **no dedupe at the
send layer** — two automations that both match send two emails.

So the send trigger has to distinguish _the stage where the customer is first
asked to pay_ from _any stage where money is theoretically owed_, and neither
`stageType` alone nor `numberOnEnter` is a safe signal across tenant-authored
workflows.

## The fix

**Nothing chases a bill the customer was never given.** Every step of the ladder
now requires that the invoice was actually sent:

```ts
const WAS_SENT = { field: 'invoice.sentAt', operator: 'is_set' } as const;
```

`sentAt` is written by the send route and by nothing else, so the ladder starts
only once the customer genuinely has the document. It needed a new resolvable
field — `invoice.sentAt`, read off the metadata bag where the send route records
it, because there is no column.

### And the owner can now see what has not gone out

The guard has a consequence that has to be paid for, or it makes things worse:
**an invoice she never sends is now never chased AND never sent, silently.**
That is [[never present absence as measurement]] waiting to happen, so the other
half of this fix is making an unsent bill visible where she looks for money:

- every row on Invoices that is unpaid and unsent carries a **Not sent** badge
  beside its status, so "unpaid because they have not paid" and "unpaid because
  nobody asked" stop reading identically;
- a **Sent** filter — All / Not sent / Sent — sitting next to the status filter,
  because they are different questions: status is about the money, this is about
  whether the bill was ever handed over.

Both consoles. The filter is a real server-side query (`?sent=false`), not a
client-side pass over the loaded page, so it is correct on page 3 of a long list.

One thing worth recording about that parameter: it is `z.preprocess`, not
`z.coerce.boolean()`. The latter is `Boolean(value)`, so `?sent=false` off a
query string arrives as `true` and the filter returns the exact opposite of what
was asked for. Verified in the console both ways: **Not sent** returns 1 of 1
(INV-000001) and **Sent** returns 1 of 1 (INV-000002).

## Auto-send was considered and deliberately not built

The obvious other half — an automation that emails the invoice when it is raised
— is **not** the fix, for a reason that only shows up when you use the screen.

An invoice is an edited document. The create flow opens the editor, and the
first things an owner does are set a deadline and check a line. Auto-sending on
create emails a document she has not finished, which is worse than not sending
it: it turns "edit an invoice after it has gone out" from a wrong move into the
normal path.

The double-send hazard above is the second reason, and it stands: `service-repair`
has two payable stages, and there is no dedupe at the send layer.

So the shape is: **the platform never sends a bill on her behalf, and never
chases one it did not send.** She sends it, with the button that already works,
and the list tells her which ones are still waiting on her.

If auto-send is wanted later it needs a first-payable event published exactly
once per document (option 1 above), and whatever sends it must write `sentAt`
the way the send route does — otherwise this guard silently suppresses the whole
ladder for automation-sent invoices.

## Proof

- The two new tests drive the **real shipped seed**, not a copy: an unsent
  invoice due in 3 days enqueues nothing; the same invoice with a `sentAt`
  enqueues one run carrying the field.
- **The guard was run red.** Removing `WAS_SENT` turns the first test red and
  leaves the second green, so it cannot rot into a condition that is always true.
- 58 automation-actions tests pass.
- Seen as Devi: INV-000001 ($234.60, raised in act 102 and never emailed) now
  reads **Owed · Not sent**. At 360px the row has zero overflow; in dark the
  badge is 9.12:1 against the page.

## Does this reach existing shops?

Yes, both halves, without a migration or a script:

- The four dunning automations are **system seeds**, and `reconcileSystemSeeds`
  runs daily off the automation worker and idempotently upserts the catalog, so
  the new predicate replaces the old one on every tenant on its own.
- The console change is code.

Nothing needs adding to a blueprint: blueprints carry site content, not the
platform's automation catalog.
