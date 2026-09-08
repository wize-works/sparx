# 248 — She could not see the email before it went to twenty-three people, and nothing asked her to confirm

**Status:** fixed and confirmed
**Severity:** high
**Found by:** P03 · Juniper Row · act 10 — the last look before pressing Send
**Surface:** mypiggles › Messages › Broadcasts › the composer
**Filed:** 2026-08-26
**Fixed:** 2026-08-26
**Confirmed by:** P03 · Juniper Row · act 10 — "See what they'll get" rendered the real email addressed to Marguerite, and Send now asked first

## What happened

Devi had a subject line, a designed email and 23 newsletter subscribers. The
composer showed her all three as words:

```
The email          Autumn drop
Who it goes to     Newsletter Subscribers · 23 people
Subject            {{customer.firstName}}, the autumn pieces are here
From               Piggles <noreply@sparx.email>

                                            [ Send now ]  [ Schedule ]
```

There was no way to see the email. Not a thumbnail, not a test send, not a
"view". The next thing that would render that message was a mail client
belonging to somebody else.

And `Send now` sent. One click, 23 emails, no confirmation step, no summary of
what was about to happen.

## What should have happened

The surface that sends is the surface that shows you what it will send, and the
one action in this product that cannot be undone asks before doing it.

## Why it matters

Two failures that are only dangerous together, which is how they shipped.

**She could not check her own work.** The subject line carries a merge tag.
`{{customer.firstName}}` is either a name or it is the literal text
`{{customer.firstName}}` arriving in 23 inboxes, and the only way to find out
which was to send it. The same goes for the unsubscribe footer that the law
requires on marketing mail, the sender name, and whether the design she wrote
three minutes ago is the one attached.

**There was no last chance.** Every other destructive thing in this console sits
behind a confirmation. Sending 23 emails is more final than any of them: a
deleted product can be restored, a sent email cannot be recalled, and the
recipients are real customers of a real shop.

Put together: the one irreversible action in Messages was also the only one with
nothing to look at first. The picker fault in
[247](247-the-newsletter-picker-offered-to-send-a-payment-failure.md) is the
same afternoon's proof of what that combination costs — "Payment failed" was two
rows above her newsletter in a list of 45, and there was neither a preview to
catch it nor a dialog to pause on.

## Why the designer's preview is not the same screen

"Design emails" has a preview, so it is tempting to call this solved elsewhere.
It is not, for three reasons, and all three are the difference between what she
designed and what her customers receive:

| In the designer                    | In the send                                        |
| ---------------------------------- | -------------------------------------------------- |
| Sample values — an invented "Alex" | Marguerite Adeyemi, off her own customer row       |
| The design's own subject           | the broadcast's subject, which is where hers lives |
| No unsubscribe footer              | the CAN-SPAM footer, composed at send time         |

That last one is in the code rather than in anybody's head: the footer is
composed when `marketing: true`, and `renderPreview` in `builder-email-service`
never passes it. So the designer's preview is a picture of a document, and a
broadcast is a picture of a message. A shop owner proving a merge tag against an
invented Alex has proved nothing about the twenty-three names it will meet.

## Where it lives

There was no preview endpoint for a broadcast at all. The renderer existed —
`renderBuilderEmailDoc` is what the dispatch tick itself calls — and nothing
above it offered the same render to a screen.

The confirmations were absent from
[broadcast-detail.tsx](../../../apps/workbench/surfaces/email/broadcast-detail.tsx),
where `sendNow` and `schedule` called their mutations directly. `useConfirm` was
already in the app and already wrapped every delete on every other surface.

## The fix

**A real preview, rendered by the thing that sends.** New
`GET /v1/email/broadcasts/:id/preview` runs the actual send path: the published
design, the broadcast's own subject, `marketing: true` so the footer is there,
and the FIRST REAL RECIPIENT from the audience — not a sample. It returns the
same `from`, `to`, `subject`, `html` and `text` the dispatch would.

`previewRecipient()` on the broadcast service expands the audience and takes the
head of it, so the person shown is somebody who is genuinely going to get this.

When it cannot be rendered it says which of the three reasons applies, rather
than showing an empty box: no email chosen, the email is not published, or the
audience is empty.

**Both send actions ask first**, naming the count and the sender:

> **Send this to 23 people?**
> "Marguerite, the autumn pieces are here" goes out from Piggles
> `<noreply@sparx.email>` straight away. Email can't be recalled once it has
> gone, so this is the last chance to change it.
> [Not yet] [Send it now]

Scheduling asks the same way, with the date and time in place of "straight away".

## What it looked like once fixed

```
What it looks like
  Shown to   marguerite.adeyemi@example.com
  From       Piggles <noreply@sparx.email>
  Subject    Marguerite, the autumn pieces are here

  ┌──────────────────────────────────────────────┐
  │ Hi Marguerite — the new core range has       │
  │ landed at Juniper Row.                       │
  │ …                                            │
  │ You're receiving this because you opted in.  │
  │ Unsubscribe                                  │
  └──────────────────────────────────────────────┘
```

The merge tag resolved to a real name from a real row, and the footer she never
wrote is present because the send composes it.

The preview renders in a sandboxed iframe: this is her own HTML, but it is HTML
composed from customer data and it is not going to run scripts inside her
console.

## Housekeeping done alongside

The composer was part of a 985-line `broadcast-detail.tsx`; adding the preview
and the dialogs meant touching it, so RULE #0.5 applied and it split by
responsibility into twelve files, all under the cap. The confirmations live in
`broadcast-compose-writes.ts`, the preview in `broadcast-preview.tsx`.

## Related

[247](247-the-newsletter-picker-offered-to-send-a-payment-failure.md) is what
the missing preview would have let through.
[249](249-the-email-she-had-just-designed-was-not-in-the-list.md) is the third
fault on the same picker.

## Rating effect

`Messages › Broadcasts` in [rating.md](../rating.md). Recorded in the run log of
[03-juniper-row.md](../03-juniper-row.md).
