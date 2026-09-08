# 426 — The screen called it "your Your own Stripe account"

**Status:** fixed
**Severity:** copy
**Found by:** P03 · Juniper Row · act 90
**Surface:** mypiggles › Sell › How you take payment › Your own Stripe
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi opened **Your own Stripe** to move her checkout onto cards. The card asking
for her keys said:

> Paste these from your **Your own Stripe** account. Saved keys are never shown
> again — leave a key blank to keep the one already saved.

And underneath:

> Not sure where to find these? They are in your **Your own Stripe** account
> settings.

Four sentences on the pane do it, plus the unsaved-changes prompt, the remove
confirmation and two toasts:

- "Paste these from your Your own Stripe account."
- "They are in your Your own Stripe account settings."
- "Tell Your own Stripe where to send updates"
- "Add this address in your Your own Stripe account so it can tell us…"
- "Your Your own Stripe keys have unsaved changes. Close anyway?"
- "Remove your Your own Stripe keys?"
- "Your own Stripe keys saved" / "Your own Stripe keys removed"

## What should have happened

"Paste these from your Stripe account." Devi has an account at **Stripe**. She
does not have an account at "Your own Stripe".

## How to reproduce

Every time.

1. Open **Sell › How you take payment**.
2. Open **Your own Stripe**.
3. Read the description under **Your keys**.

## Why it matters

She is the most technical owner in the roster and she still stopped on it,
because it reads like a bug — and a screen that looks broken while asking for a
secret key is the worst place in the product to look broken. It is the moment
she has to trust the software with the credential that moves her money.

## Where it lives

`wizeworks/packages/payments/src/catalog.ts` — the gateway's `name` is a SHELF
name, and it has a real job: it has to tell "Your own Stripe" apart from the
platform's own gateway in a list where both appear. The detail pane then
interpolated that shelf name into a possessive.

`piggles/apps/workbench/surfaces/commerce/payment-provider-detail.tsx` and its
sparx twin are where it was rendered.

## The fix

`GatewayDescriptor` gains `processor?: string` — the company whose account and
dashboard the owner actually has, for use wherever a sentence says "your X
account". Two entries set it:

- `stripe_direct` → `'Stripe'`
- `custom` → `'payment processor'` ("Paste these from your payment processor
  account", which is better than "your Custom gateway account", since by
  definition we do not know who their processor is)

Everything else is absent, because the shelf name already reads correctly on its
own (Square, PayPal, Authorize.net, 1stPayGateway). `fillDescriptor` resolves it
like every other string, per the trap comment in that file.

The detail pane computes `processorName` once and uses it in the eight places
above. It keeps the SHELF name where the sentence is about the choice rather
than about her account: "Your own Stripe is now your active provider" is
correct and unchanged.

Manual payments has no credential fields, so its keys card never renders and it
never needed a processor name.

## Confirmed by

Re-ran the act on the screen:

> **Sell › How you take payment › Your own Stripe** now reads "Paste these from
> your Stripe account." and "Not sure where to find these? They are in your
> Stripe account settings." The blurb above still says "Route checkout to your
> own Stripe account", which was always correct.

**Not proved: the key-saving path itself.** Entering a live secret key into a
field is not something I may do, so the Save keys flow, the webhook section and
"Make this my active provider" were read but not driven. Recorded rather than
claimed.

## Rating effect

Folded into Sell › Payment provider — Ease 5 → 8 in [rating.md](../rating.md),
with [425].
