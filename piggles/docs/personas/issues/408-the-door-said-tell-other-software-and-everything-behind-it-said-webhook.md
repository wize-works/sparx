# 408 — The door said "Tell other software" and everything behind it said "webhook"

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 82 · opening the pane for the first time
**Surface:** mypiggles › Content › Tell other software (list + detail)
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** the word does not appear on either pane; the search keyword is kept so a developer can still find it

## What happened

Somebody had already renamed this screen properly. `vocabulary.ts` carries:

    'cms.webhooks.list': 'Tell other software'

So the tab, the nav entry and the launcher all say something a shop owner
understands. Everything **inside** was untouched:

> **No webhooks yet**
> A webhook tells another system the moment something happens here…
> [ Set up a webhook ]

plus a toolbar button reading **New webhook**, a search box labelled "Search
webhooks", and a column headed **Endpoint**.

## What should have happened

RULE #3 — never make somebody learn a category word. A renamed door with the old
vocabulary behind it is worse than not renaming it: the person who was reassured
by the plain name now finds they were wrong about what the screen is.

## Why it matters

Devi runs a clothing label. "Webhook" and "endpoint" are not words she has any
reason to know, and the empty state's own copy admits it — "useful when a
developer is building on top of your content". The screen was written for
somebody who was never going to open it.

## The fix

The subscription is a **notification**; one delivery is a **message**. That is
not invented — it is the vocabulary the form ALREADY used ("Where to send
notifications", "A message is sent to this address"). Only the chrome was out of
step, so the chrome moved:

| Was                            | Now                          |
| ------------------------------ | ---------------------------- |
| No webhooks yet                | Nothing is being told yet    |
| New webhook / Set up a webhook | Set one up (both, one label) |
| Endpoint                       | Where it goes                |
| Events                         | What triggers it             |
| Added                          | Set up                       |
| Status                         | How it is going              |
| Delete this webhook            | Delete this                  |
| Could not load your webhooks   | Could not load these         |

Two labels for one action became one. `createLabel` in the catalog and the
toolbar button had said different things.

**"Signing secret" is kept deliberately.** It is the one term on the pane that a
person hands to somebody else, and renaming it would make it unfindable for the
developer who needs it. Its explanation carries the meaning instead.

**The search keyword `webhook` is kept too**, so somebody who does know the word
still lands here.

## Confirmed by

> Opened the empty pane: "Nothing is being told yet · You can have us tell
> another system the moment something happens here — a page goes live, a file is
> uploaded, stock runs out." One button, **Set one up**.
>
> The populated list: **Where it goes · What triggers it · Set up · How it is
> going**. Grepped both files afterwards — the only remaining "webhook" strings
> are route paths, registry keys and the search keyword.

## Rating effect

`cms.webhooks.list` — scored in [rating.md](../rating.md).
