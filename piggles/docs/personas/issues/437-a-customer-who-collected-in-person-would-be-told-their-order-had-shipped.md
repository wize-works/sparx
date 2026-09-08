# 437 — A customer who collected in person would be told their order had shipped

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 100
**Surface:** the shipping confirmation automation
**Filed:** 2026-09-07
**Fixed:** 2026-09-07

## What happened

This one I introduced in [433](433-she-marks-an-order-sent-and-the-customer-is-never-told.md)
and caught by carrying on with the job rather than stopping at green tests.

Working through Devi's queue of unsent orders, the fourth was not a delivery at
all. **O-000001 was a collection** — Ravi Naidoo, paid, coming to fetch it. The
pane knew: it said _"The customer is coming to fetch this one. Mark it off when
they do"_, with one button, **They collected it**, and no carrier or tracking
field. That part is well built.

But a collection is recorded as a fulfillment carried by `pickup`, and:

```ts
if (fulfillment.status === 'shipped' || fulfillment.status === 'delivered') {
  publish order.fulfilled
}
```

It publishes `order.fulfilled` exactly like a despatch. **Deliberately** — the
comment beside it says so, because the activity feed, the customer stats and the
review request all need to see the sale complete.

My new automation listened to `order.fulfilled` with one condition:
`customer.email is_set`. So a customer who had just walked out of the shop
holding their order would be emailed:

> **Your order is on its way.** It's on the way — track your package.

Ravi has no email on file, so nothing was actually sent. That is luck, not a
guard.

## Proved, not assumed

The guard is now `fulfillment.carrier` `neq` `pickup`, and a test covers it. The
test was checked **both ways**: with the condition removed it fails with

```
expected [ 'post-purchase-review', 'shipping-confirmation' ]
  to not include 'shipping-confirmation'
```

so the defect was real and the guard is load-bearing, not decorative. The review
request still goes on a collection — the sale IS complete, and asking how it went
is right whether they carried it out or it arrived by post.

## The field had to be made resolvable first

`fulfillment.carrier` did not exist as a condition field. The
`order.fulfilled` / `order.delivered` resolver added in 433 merged only
`fulfillment.id` from the event payload, and the payload carries ids alone. The
resolver now reads the fulfillment ROW and exposes `carrier`, `service`,
`trackingNumber` and `status` — the row being authoritative, and an owner's own
automations getting the same four fields to condition on.

## Also seen, NOT fixed — a failed send is silent

Two of the eight despatches produced no mail. Their runs are recorded `failed`
with:

```
no executor registered for action "email.send_campaign"
```

**Cause here is almost certainly dev hot reload.** The action registry is a
module-level `Map`; editing files in this package mid-session re-evaluates the
module with an empty registry while `installModuleActions()` is not re-run. A
production process boots and installs once.

**But the tail is real and is not dev-only.** `failRun` marks the run failed,
increments `errorCount`, stamps `lastErrorAt` — and that is all. There is **no
retry and no alert**; the comment beside it says pause-on-repeated-failure is
"a later (UI) slice". So any transient failure loses a customer's order
confirmation permanently, and the only trace is a counter on a screen a clothes
maker has no reason to open.

Not fixed here: retry policy, backoff, dead-lettering and who gets told are a
capability with real decisions in them, not a patch. Recorded so the decision is
made deliberately.
