# 403 — Nothing ever said that not one notification had arrived

**Status:** fixed
**Severity:** critical
**Found by:** P03 · Juniper Row · act 82 · setting up "Tell other software" for her stock page
**Surface:** mypiggles › Content › Tell other software (list + detail)
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** the pane now reads "On its way", then names the event, the time, the number of tries and why it did not arrive

## What happened

Devi set up a notification so her studio's stock page would hear when she
publishes something. She typed a name, an address, ticked **Content published**,
and saved. The screen said:

> **Active**
> Notifications are being sent to this address as events happen.

She published a post. Nothing on that sentence changed, because nothing about it
was ever a measurement. `active` is the SWITCH she set. It says nothing about
whether a single message reached anybody.

Her address does not resolve. Every attempt failed. The delivery worker retried,
gave up after eight tries over about seven and a half hours, marked the row
`failed`, and told nobody. The badge stayed green.

## What should have happened

RULE #4 — never present absence as measurement. A setting is not a result. If
nothing has been sent, say so. If everything failed, say that, and say what came
back.

## Why it matters

This is the worst shape a defect can take here, because the screen is
**reassuring** and wrong. A person who mistypes one character in the address gets
exactly the same green badge and the same sentence as a person whose integration
works perfectly. There is no page to go and check, no notice, no email. The only
way to find out is for whoever runs the other end to say "we never got anything",
which by then is weeks of missing data.

## Where it lived

`webhook_deliveries` has recorded every attempt since the feature shipped —
`status`, `attempt_count`, `response_status`, `response_body`, `delivered_at` —
and carries `@@index([subscriptionId, createdAt(sort: Desc)])`, which is the
index for exactly one screen. **That screen did not exist, and neither did a
route to read it.** The rows were written and read by nobody.

Measured, not assumed: `grep` for a deliveries endpoint across
`services/api-rest/src/routes` returns nothing, and
`packages/api-core/src/webhook-delivery.ts` line 200 sets `status: 'failed'` with
no notification of any kind beside it.

## The fix

**A route.** `GET /v1/webhooks/subscriptions/:id/deliveries` in a new
`routes/v1/webhooks/deliveries.ts`, returning the recent attempts plus a health
summary. It checks the subscription exists first, because an empty list for a
deleted id reads as "nothing has been sent" when the truth is "there is no such
thing".

**A summary on the list.** `webhookHealth(tx, ids)` rides along on
`GET /v1/webhooks/subscriptions` — two aggregate queries, not one per row:
a grouped count inside a 7-day window, and a `DISTINCT ON (subscription_id)` for
the newest attempt regardless of age. So the LIST can say what happened too,
which is where the lie was loudest.

**A ladder of honest states**, in `surfaces/cms/webhook-status.ts`, worst news
first: Paused · Nothing sent yet · Not getting through · Some are failing ·
Working · On its way · Quiet lately. Every branch is a DIFFERENT fact and none of
them is inferred from the switch.

**A panel.** "What has been sent" on the detail pane — a stacked list, newest
first, each row carrying the event in her words, when, how many tries, and what
came back:

> **Still trying** · **Content published** · Sep 5, 2026, 1:40 AM · 2 tries
> We could not reach that address at all. It may be down, or the address may be
> wrong.

A table was built first and thrown away: four facts, one of them a sentence,
squeezed the sentence to one word per line at 360px.

## A bug the fix introduced, and how it was caught

The first version of `webhookState` reported **"Working. 0 messages arrived."**
on a notification that had reached nobody, because a `pending` delivery fell
through to the success branch. That is the same defect this issue is about,
inside its own repair.

It was caught by driving it, not by reading it: publishing a post and watching
the badge turn green over a panel that still said "Nothing yet". The ladder now
has an explicit `pending` rung, and `webhook-status.test.ts` has nine tests, one
of them named for this.

## Confirmed by

Driven as Devi, end to end:

> Set up "Tell our stock page" → the list showed **Nothing sent yet** (blue), not
> a green Active. Unpublished and republished a blog post, which fires
> `content.entry.published`. Refreshed: badge **On its way**, and the panel now
> carries one row — Content published, 1:40 AM, 2 tries, **Still trying**, with
> "We could not reach that address at all." Her address is fictional, so that is
> the true answer.
>
> 360px, dark: page width 356 against a 356 client, nothing overflowing, the row
> reading as four short lines.

## Still open

- **The `failed` end state is not confirmed on screen.** Reaching it means
  waiting out eight retries over about seven and a half hours. The branch is
  covered by test and its wording is written, but nobody has watched it happen.
- **Nothing pushes.** She still has to open the pane to learn a notification is
  failing. A run of failures is exactly the sort of thing the notification centre
  exists for, and wiring it is not done here.
- **Old attempts are never tidied.** `webhook_deliveries` grows forever. The
  7-day window keeps the counts honest but the table has no retention.

## Rating effect

`cms.webhooks.list` and `cms.webhooks.detail` — scored in [rating.md](../rating.md).
