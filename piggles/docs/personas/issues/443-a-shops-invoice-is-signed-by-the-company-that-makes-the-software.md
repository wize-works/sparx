# 443 — A shop's invoice is signed by the company that makes the software

**Status:** fixed
**Severity:** major
**Found by:** Brandon, reading act 105's rendered invoice email
**Surface:** every email a tenant sends to their own customer
**Filed:** 2026-09-08
**Fixed:** 2026-09-08
**Confirmed by:** rendered the invoice and the signature request end to end — both now sign "Sent with <product>" under the shop's own line, and neither carries a masthead

## What happened

Act 105 printed the invoice email Juniper Row sends Tessa Wren. At the bottom:

```
Juniper Row sent you invoice INV-000006.
WizeWorks
```

Tessa bought a knit from a clothes shop. **She has never dealt with WizeWorks**,
and there it is on her bill, named as a party to a transaction between her and
somebody else.

## I had already dismissed this, wrongly

Act 105 saw the same line and cleared it, on the strength of a test:

```ts
expect(out.html).toContain('WizeWorks'); // the operator, correct for both
```

"Correct for both" means **both PRODUCTS** — sparx and Piggles — not both
audiences. Every case in that file renders `password-reset`, and its section
header says so: "a Piggles owner's password reset arrived under sparx's
wordmark". The reader there is an owner who **pays WizeWorks**. Naming the
operator to them is right and the test is right.

The test simply never considered the other audience, and I read its comment
instead of its cases.

## The rule the platform already had

This exact question was decided months ago, and implemented — in the other
renderer. `silica/frame.ts` composes the footer for every Builder email a shop
sends (order confirmation, shipping, receipts, dunning, broadcasts):

1. the shop's name, linked home
2. the shop's legal links and socials
3. the shop's name and postal address
4. **"Sent with <product>"** — small, last, resolved from the brand

Never the operating company. Its own comment states the rule:

> Hardcoded, it put one brand's name and marketing site under every email the
> other brand's tenants sent, in front of their customers, on every send.

That is [122], fixed 2026-08-23. And [122] itself says the sweep before IT
"fixed the React templates. It missed the silica frame." **Now it is the mirror
image**: the silica frame was fixed and `_layout.tsx` was left behind. Three
sweeps, three engines, each one fixing the engine the last one missed.

## What was actually reaching strangers

`EmailLayout` served three audiences with one footer. Four of its templates go to
somebody who has never heard of us:

| template                       | who reads it                                 | masthead         | signed                |
| ------------------------------ | -------------------------------------------- | ---------------- | --------------------- |
| `invoice-sent`                 | the customer being billed                    | no               | **WizeWorks ·**       |
| `gated-delivery`               | a visitor who swapped their email for a file | **our wordmark** | **WizeWorks ·**       |
| `form-submission-confirmation` | a visitor who filled in a contact form       | **our wordmark** | **WizeWorks ·**       |
| `document-signature-request`   | a customer asked to sign                     | **our wordmark** | **WizeWorks, Inc. ·** |

The rest of `EmailLayout`'s templates are fine: `chat-notification` and
`form-submission-notification` are read by the owner, and `tool-result`,
`job-application-received` and `job-application-confirmation` are our own
visitors and applicants. For all of those the operator line is correct.

**Broadcasts are NOT affected.** `renderAuthoredEmail` in `send.tsx` carries the
same footer and looked like the biggest exposure of all, but it has zero callers
outside its own package — broadcasts render through `renderSilicaEmail`, which
was already right. Checked before saying so.

### Three of the four also carried our wordmark

`header={false}` existed for exactly this, and **one template ever passed it.**
The invoice took its masthead off with a long argument about how a software
product's name over somebody's bill reads, and the other three visitor-facing
sends kept it. The masthead and the sign-off are the same decision and they were
two separate levers, so it was possible — and it happened — to get one right and
the other wrong on the same email.

### The signature request was the worst of them

It goes to `signature.signerEmail` — a customer — on the **platform** chassis,
and it named no business at all:

> **Please review and sign**
> Hi Tessa, your estimate EST-000041 is ready.

Our wordmark on top, our company at the bottom, a link asking a stranger to put
their name to a document, and nowhere on it the business that wants the
signature. Subject: "Estimate EST-000041 — ready for your signature". That is
shaped exactly like a phishing attempt.

## The fix

`EmailLayout` takes one **required** `audience: 'platform' | 'visitor'`, and it
decides the masthead AND the sign-off together, because they were never two
questions:

- `platform` → the product wordmark, and `WizeWorks · <host>` in the fine print.
- `visitor` → no masthead, the shop's line, and `Sent with <product>` — the same
  wording, and the same say-nothing-if-you-cannot-name-it rule, as
  `silica/frame.ts`. `header` is gone.

Required rather than defaulted on purpose: a default is how the next
visitor-facing template gets signed by us without anybody deciding to. It earned
that immediately — it caught a ninth call site (`renderAuthoredEmail`) that no
grep of the templates folder would have found.

`document-signature-request` moves to the tenant chassis and **learns who is
asking**: `signature-mail.ts` already loaded the document's `propertyId`, so it
now selects the property name and passes it. Heading, body, subject and footer
all name the business.

## The test was pinning the leak in place

```ts
expect(out.html, 'shared frame').toContain('WizeWorks');
```

That assertion required the operator on **every** template, which made the defect
mandatory. It is now split by audience: a visitor-facing template must NOT
contain it and MUST carry the credit. Removing the fix reddens those four plus
the new invoice case, and leaves the platform templates green.

Which is the second time this file has done this to itself — it already records
the last one, three paragraphs up:

> This used to assert `sparx.works`, and it passed because `defaultBrand` carried
> sparx's site URL — **which is to say the assertion was pinning the leak in
> place.**

## And one test had been asserting nothing at all

`invoice-sent.test.tsx` has a case called "carries no platform masthead". It did:

```ts
const masthead = html.slice(0, html.indexOf('Invoice from Rosa Flowers'));
```

React Email splits interpolated text with `<!-- -->` markers, so the rendered
heading is `Invoice<!-- --> from <!-- -->Rosa Flowers` and that `indexOf` returns
**-1** — which makes `slice(0, -1)` the whole document minus one character. The
test has been checking the entire email against "must not contain sparx" and
passing only because the footer happened to name the operating company rather
than a product. **The moment the footer said "Sent with sparx", the test that was
supposed to guard the masthead failed for the wrong reason.** Fixed by stripping
the markers and asserting the anchor exists at all.
