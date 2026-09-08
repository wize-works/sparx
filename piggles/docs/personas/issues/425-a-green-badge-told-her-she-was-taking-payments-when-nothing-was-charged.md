# 425 — A green badge told her she was taking payments, when nothing was being charged

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 90
**Surface:** mypiggles › Sell › How you take payment
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi sells online only. She has no shop and no counter, and the thing she said
she was most afraid of is a month of broken checkout. So the first screen she
opened was **Sell › How you take payment**.

The pane's own opening sentence was correct:

> You're set up with Manual payments. You take the money yourself — checkout
> places the order and **nothing is charged online**.

Six lines below it, on the Manual payments row, a **green** badge read:

> **Active — taking payments**

And the pane header, above everything, carried a second green badge:

> **Taking payments**

Opening the Manual payments provider repeated it a third time:

> This is your active provider
> Checkout uses Manual payments **to take payments**. No fee. No online card
> processing.

Three green claims that money is being taken, and three plain sentences in the
same eyeful saying nothing is charged. The two greens are what a person scans;
the sentence is what a person reads only after something has gone wrong.

## What should have happened

The badge answers one question — "is my checkout charging cards?" — and for
Manual payments the answer is no. Being **switched on** and **charging money**
are two different facts, and this row reported the first while claiming the
second.

## How to reproduce

Every time, on any site whose active provider is Manual payments (the default
for a new business).

1. Sign in as `p03.devi@piggles.test`, site `primary`.
2. Open **Sell › How you take payment**.
3. Read the first sentence, then the badge on the **Manual payments** row.

## Why it matters

Juniper Row is 340 orders a year. If Devi reads the green badge, believes
checkout is charging cards, and goes on with her drop, every order arrives
unpaid and she chases each one by hand — and she finds out from customers, not
from the console. This is the exact question she came to this screen to answer,
and the screen answered it wrongly in the place a person actually looks.

It is also the shape recorded in
[feedback: never present absence as measurement] — a thing that was never
measured (a charge) rendering as though it were.

## Where it lives

- `piggles/apps/workbench/surfaces/commerce/providers-data.ts` — `gatewayState`
- `piggles/apps/workbench/surfaces/commerce/payment-providers.tsx` — the header badge
- `piggles/apps/workbench/surfaces/commerce/payment-provider-detail.tsx` — the active-provider alert
- and all three again in `sparx/apps/workbench/...`

The fact needed to tell the two apart was already on the descriptor and already
being served: `GatewayCheckout` is `'inline' | 'redirect' | 'none'`, and Manual
payments is `'none'`. Nothing had to be fetched; it simply was not read.

## The fix

`gatewayState` is the one place the surface reads status from — its own comment
says so — so the fix goes there and the row, the pane header and the detail
heading all follow:

- selected + active + `checkout === 'none'` → **`Active — no card payments`**, tone `info`
- everything else selected + active → `Active — taking payments`, tone `success`

Green now means money is moving, and it is the only thing that means that.

A new `checkoutSummary()` gives the shelf header its one-badge answer from the
same fact, so the header and the row it summarises cannot disagree — the header
now reads **No card payments**.

The active-provider alert on the detail pane carries two sentences instead of
one, and takes the matching color:

> Checkout places the order and charges nothing — you mark each one paid
> yourself. No fee. No online card processing.

**While in the file** (root RULE #4): `gatewayState` also returned
`tone: 'neutral'` for two different things — "Available" and "Coming soon" —
which rendered as the same grey pill. `GatewayState.tone` is now optional:
absent means a COLORLESS badge, which is the right ink for a row that carries no
state at all, and "Coming soon" takes `info`, because a gateway you cannot pick
yet is a state and not an absence.

Both consoles have the same fix. `wizeworks/packages/payments` is untouched by
this one — the data was already right.

## Confirmed by

Re-ran the act on the screen, in dark and in light and at 360px:

> **Sell › How you take payment** now carries **No card payments** in the header
> and **Active — no card payments** on the Manual payments row, both blue, with
> every other row's badge colorless. Opening **Manual payments** shows a blue
> "This is your active provider — Checkout places the order and charges nothing
> — you mark each one paid yourself." At 356px the shelf has no horizontal
> overflow and the badge stays on one line.

Nine tests now cover `gatewayState` and `checkoutSummary`
(`providers-data.test.ts`, mirrored into sparx), including the one that asserts
the label for a no-checkout gateway does not contain "taking payments", and one
that asserts active-and-charging and active-and-not-charging never share a tone.
Piggles is at 128 tests, sparx at 53.

## Rating effect

Sell › How you take payment — Ease 4 → 8. Sell › Payment provider — Ease 5 → 8.
Recorded in [rating.md](../rating.md).
