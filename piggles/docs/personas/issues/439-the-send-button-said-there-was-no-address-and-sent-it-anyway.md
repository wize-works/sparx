# 439 — The Send button said there was no address, and would have sent it anyway

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 102
**Surface:** Money › Invoices › an invoice › Send
**Filed:** 2026-09-07

## What happened

Finishing act 101 meant actually sending an invoice, which meant using the Send
button for the first time. It exposed two things, on opposite ends of the same
path.

### One console asked a question it could not answer

Before sending, the console asks for confirmation, and the sentence it writes
depends on where the invoice is going:

```ts
const to = (doc.billTo?.email ?? '').trim();
```

`billTo.email` is the address typed by hand into the Bill to box. It is blank on
every invoice nobody typed one onto, which is most of them. So the dialog said:

> There is no email address on this invoice yet. Add one under Bill to first.

The server does not agree, and never did:

```ts
const to = billTo.email ?? doc.customer?.email ?? null;
```

It falls back to the customer's own address. So the owner is told there is
nowhere to send it, offered a **Send it** button anyway, and if she presses it
the invoice goes out perfectly. One rule, written in two places, and the copy
that faces the person is the one that drifted.

### The other console could not send at all

`POST /v1/invoicing/documents/:id/send` has existed and works. The Piggles
console calls it. **The sparx console has no send anywhere** — its two outbound
actions are "Print or save as PDF" and "Copy payment link", both of which end by
handing the job back to the operator's own mail client. Its Bill to field still
labels its email box "Where the invoice gets sent."

## Why it stayed hidden

Same shape as [433] and [436]: an API verb with one caller. When a resource's
verb is wired in one place, the other places are not obviously missing — nothing
is greyed out, nothing errors, there is simply no button, and a menu with four
working items reads as complete.

## The fix

**One rule, resolved once, on the server.** The single-document read now returns
`billedToEmail`, resolved exactly as the send route resolves it, and both
consoles ask the server rather than guessing:

```ts
const to =
  [doc.billTo?.email, doc.billedToEmail]
    .map((value) => (value ?? '').trim())
    .find((value) => value.length > 0) ?? '';
```

A first-non-empty rather than a `??` chain, because a blank string is an absent
address and `??` would keep it.

**The sparx console gained a Send button**, in the toolbar rather than the
overflow menu: raising an invoice and giving it to somebody are one errand, and
the second half of an errand should not be behind a menu. It is disabled while
the pane is dirty, because what lands in the customer's inbox has to be the
document the screen can still show afterwards.

## Proof

Sent a real invoice as Devi, from the order for O-000013:

- the dialog named the recipient: "INV-000002 goes to anneliese.vogt@example.com";
- `email_events` recorded `accepted` for that address at `00:55:08.625`, against
  a send at `00:55:08.420`;
- the document's metadata carries `sentAt` and `sentTo`;
- the button became **Send again**.

Related: [438], [433], [436].
