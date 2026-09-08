# 405 — She typed the address the way people say it, and was told "nothing was saved"

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 82 · the first thing she typed into "Address to notify"
**Surface:** mypiggles › Content › Tell other software › the address field
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** `stock.juniperrow.co.uk/hooks/piggles` now becomes `https://…` in the box on leaving the field, and `http://` is refused on the field with the exact edit

## What happened

Devi typed her stock page's address the way anybody says a web address out loud:

    stock.juniperrow.co.uk/hooks/piggles

She pressed **Create**. The server answered **422**, and the pane said:

> **Could not create this webhook**
> Could not create this webhook. Nothing was saved.

The title and the description are the same sentence twice, and neither says what
is wrong. The rule she had broken — "it has to start with https://" — was sitting
in grey helper text under the box she had just filled in, unchanged, unmarked.

## What should have happened

Either accept it, or say which line is wrong and what to change. Preferably both:
a missing `https://` is not a mistake, it is how people write addresses.

## Why it matters

She has no way to work out what is wrong. The message names no field, no rule and
no fix. She has typed an address that looks completely correct to her, and the
product's answer is that something unspecified failed.

The information all existed: the server knew the field (Zod attaches per-field
`details`), the client knew the rule (its own helper text says it), and neither
said it. `apiErrorMessage` deliberately and correctly refuses to show Zod's
"Request validation failed." — so the schema layer's report was suppressed and
nothing replaced it.

## The fix

**`surfaces/cms/webhook-address.ts`** — the rules, as a pure function, tested.
Two jobs in order:

- **TIDY.** No scheme at all → `https://` is added, and `tidied: true` comes back
  so the field can show the result. What she sees is what gets saved.
- **REFUSE.** Everything else, in a sentence naming the problem and the edit:
  `http://` → "Notifications are only sent to a secure address. Change http:// at
  the start to https://."

**A limit that matches the server.** `draftProblem` now refuses a name over 120
characters — the server's own cap — and the field carries `maxLength={120}`. The
Save button disables and its tooltip says why, instead of the request going out
to be refused.

**Validated on LEAVING the field, not on every keystroke.** That is not a
preference: `Field`'s `status` prop changes its subtree, so flipping it mid-word
remounts the control and the typing goes nowhere. Found by typing a whole address
and finding a single letter in the box.

Eleven tests on `checkAddress` and six on `draftProblem`. One was **proved red**
by a real bug: `localhost:4000/hooks` was refused, because `localhost:` matched
the scheme pattern. Requiring the `//` fixed it.

## Confirmed by

Driven as Devi, three ways:

> **Typed without a scheme.** `stock.juniperrow.co.uk/hooks/piggles`, tab away →
> the box reads `https://stock.juniperrow.co.uk/hooks/piggles`. Nothing refused,
> nothing to fix.
>
> **Typed with http://.** The field goes red with "Notifications are only sent to
> a secure address. Change http:// at the start to https://." and Save disables.
>
> **Typed a whole address in one burst.** All 35 characters land. Before the
> blur-only change, the same burst left `s`.

## Rating effect

`cms.webhooks.detail` — scored in [rating.md](../rating.md).
