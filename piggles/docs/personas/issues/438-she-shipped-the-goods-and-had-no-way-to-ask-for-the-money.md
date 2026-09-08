# 438 — She shipped the goods and had no way to ask for the money

**Status:** fixed, proven end to end
**Severity:** blocker
**Found by:** P03 · Juniper Row · act 101
**Surface:** Sell › Orders › an order, and Money › Invoices
**Filed:** 2026-09-07

## What happened

Devi's queue of unsent orders was cleared in act 100. That left the other half of
the sale: **$1,756.50 owed across eight orders whose goods have already gone**,
plus $214 part paid.

Her shop takes no payment at checkout. Its last screen says so, in as many words:

> Placing this order does not take any money now, and no card details are needed.
> **We'll be in touch about paying for it.**

So being in touch is the job. This is what that job looked like.

## Confirmed by using it, not by reading it

There IS an Invoices screen, with filters (All / Owed / Late / Part paid / Paid)
and a **New invoice** button. Opening it shows a well-built form: document type,
customer typeahead, due date, billing name and address, line items, notes, and a
summary.

**Nothing on it knows orders exist.** No order field, no "bill this order".

So to chase $234.60 on O-000014 she had to:

1. Open the order and read the items.
2. Come back, and find the customer again.
3. **Retype every line by hand.**
4. Type the tax rate as a number — on a shop that already has tax places, rates
   and permit numbers set up properly, which the checkout already applied.
5. And when the customer paid that invoice, **the order still said "Not paid ·
   $234.60 still owed"**, for ever, because no column joined the two. She would
   be reconciling two screens by memory.

`BillingDocument` carried `customerId` and `companyId` and no order. The one
order-shaped link on it — `convertedOrder` — points the **other way**: "this
QUOTE became that order".

## What was built

| Piece                                | What it does                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `billing_documents.order_id`         | The join that did not exist                                                          |
| `createInvoiceForOrder`              | Copies every line, the delivery charge, the frozen addresses and the order's own tax |
| Deposit seeding                      | Money already received comes across, so the balance is what is truly owed            |
| **The settlement hook**              | Paying the invoice writes an `OrderPayment` and moves the order to part paid / paid  |
| `GET`/`POST /v1/orders/:id/invoices` | The API                                                                              |
| "Asking for payment"                 | A section on the order pane, in both consoles                                        |

### Three decisions that carry weight

**It copies the sale; it never re-prices it.** The order is the record of what was
agreed. An invoice quietly charging a different number would be a second opinion
about a sale that already happened.

**Money already in is seeded straight to the payment table, not through
`recordPayment`.** That is load-bearing rather than stylistic: `recordPayment` is
where the settlement mirror lives, and this money is already ON the order.
Routing the seed through it would count the same dollars twice.

**A refund on the invoice is not mirrored back.** Putting money back is its own
lifecycle on the order, and writing a negative capture would corrupt the rollup
both paths share.

### It refuses by name

Three cases where an invoice would be wrong — paid in full, cancelled, already
invoiced — and the refusal names the thing it found, because "cannot create
invoice" tells an owner nothing about what to do next. The console hides the
button in those states rather than offering a control whose only job is to fail.

## Proof so far

The migration was dry-run inside a rolled-back transaction:

- column, foreign key and index applied clean;
- linking 88 real documents to a real order **worked**;
- linking to an order that does not exist was **refused** by the foreign key;
- the dev database afterwards was **unchanged**.

Both consoles typecheck and the eight-case integration test is written, covering
the copy, the deposit carry-across, full and partial settlement, the refund that
must not mirror, and all three refusals.

## What finishing it found

The migration ran, and the rest of it did not go smoothly, which was useful.

**Three of the eight tests failed on the first real run.** One was a bad test
(it read the payment rows through the bare client, and every billing table is
row-level-secured, so it saw nothing and would have "proved" the point by finding
nothing at all). The other two were the same real defect.

**`createInvoiceForOrder` skipped `applyStageEntryEffects`.** That helper is what
the New invoice form runs on create, and its own comment says it exists so "the
initial stage is treated identically to any later transition". It is what MINTS
THE NUMBER. Two code paths create a billing document and only one applied the
rule, so an invoice raised from an order arrived with **no number, no due date
and no frozen letterhead** — outside every aging bucket, impossible to chase, and
`sendInvoice` refuses an unnumbered document by design. The capability could not
have delivered its whole point.

**The addresses came across in the wrong shape.** Commerce freezes a structured
address (`recipientName`, `line1`, `region`, `postalCode`); an invoice's `billTo`
is three flat strings, `{ name, email, address }`. Copying one into the other
type-checks, saves, and silently empties the invoice: the Bill to form, the
"billed to" column on the receivables list, the PDF and the greeting on the
emailed invoice all read the three strings and found none of them. Only opening
the screen showed it — the first invoice raised had a blank Billing name and a
blank Email under a label reading "Where the invoice gets sent".

Both are fixed, both now have a test, and the second test is red under the old
code by construction: an order address carries no email at all.

## Proven end to end, as Devi

O-000013, fulfilled, $180.00 owed:

1. **Make an invoice** → INV-000002, numbered, with Anneliese Vogt, her address,
   her email and every line carried across.
2. A deadline of Sep 21 typed in, saved. Send is correctly disabled while unsaved.
3. **Send** → `email_events` recorded `accepted` for anneliese.vogt@example.com,
   and the document's metadata carries `sentAt` and `sentTo`.
4. The order pane now reads "Sent Sep 7, 2026 to anneliese.vogt@example.com ·
   Due Sep 21, 2026 · $180.00 still owed".
5. **Payment recorded against the invoice** → order O-000013 flipped to `paid`,
   `amount_paid` 180.00, `paid_at` set, and an `order_payment` naming INV-000002.

That last step is the whole point: without it the customer pays, the invoice
reads Paid, and the order says "Not paid" for ever.

## Three sentences on the pane that were not true

Found by reading the screen after building it, not before:

- the button said **Send an invoice** and only made one → **Make an invoice**;
- the section said "the invoices you have **sent**" → "raised … whether they went
  out";
- worst, each row printed **"Sent 7 Sep"** off the date the document was
  _created_, telling an owner her customer had a bill that had never left the
  building. The row now carries the real `sentAt`, or says "Not sent yet · open
  it to email it".

Two further defects fell out of sending it for real, filed separately as
[439](439-the-send-button-said-there-was-no-address-and-sent-it-anyway.md) and
[440](440-four-automations-chase-an-invoice-nothing-ever-sends.md), and a third
as [441](441-the-letterhead-is-frozen-on-every-invoice-and-printed-on-none.md).
