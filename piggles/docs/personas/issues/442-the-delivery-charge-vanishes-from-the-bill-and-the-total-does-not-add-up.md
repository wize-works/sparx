# 442 — The delivery charge vanishes, and the bill does not add up

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 105
**Surface:** Money › Invoices › the editor's Summary, and the emailed invoice
**Filed:** 2026-09-07
**Fixed:** 2026-09-07
**Confirmed by:** reopened INV-000005 and read the card back - Delivery $9.00 now sits between Tax and Total, Total reads $67.00, and the false "Not saved yet" warning is gone. Four figures that could not all be true now agree.

## What happened

Devi billed order O-000016 ($58 of goods, $9 delivery, $40 already paid on a
gift card). The invoice screen showed her this:

```
Subtotal                $58.00
Tax                      $0.00
Total                   $58.00
Not saved yet — $67.00 is what the customer would see today.
Paid                    $40.00
Amount due              $27.00
```

Four numbers, and they cannot all be true. **Total $58.00 with $40.00 paid does
not leave $27.00 owed.** She had just made the invoice and touched nothing, so
the "Not saved yet" warning was about a change she never made.

The saved document is correct: subtotal 58, shipping 9, total 67, paid 40,
balance 27. **Everything wrong here is on the screen.**

## Three faces, one cause

`totals.ts` in the console is a deliberate mirror of the server's
`billing-totals.ts`, so the editor can total a document while she types. Its own
header states the rule it mirrors:

> resolution order is lines → subtotal → discount → tax → **shipping →
> surcharge** → total

The function under that comment is:

```ts
total: round2(subtotal - discountTotal + taxTotal),
```

Shipping and surcharge are named in the comment and absent from the code.
`DocumentTotals` has no field for either. So:

1. **The Total row is wrong** by the delivery charge on every invoice that has
   one, and sits on screen beside an Amount due that is right, so the two
   disagree in front of her.
2. **The "Not saved yet" warning cries wolf.** It compares the mirror to the
   saved figure, and they differ by the shipping on a document nobody edited. A
   warning that fires when nothing is wrong is a warning she learns to ignore,
   and it is the only thing standing between her and sending a stale invoice.
3. **There is no Delivery row at all.** `shippingTotal` and `surchargeTotal`
   appear nowhere in the whole invoicing surface — one grep, zero hits. A $9
   charge the customer is being asked for cannot be seen, checked or questioned.

## The customer's copy is worse

The emailed invoice builds its summary in `invoice-mail.ts`:

```ts
const summary = [{ label: 'Subtotal', value: money(doc.subtotal) }];
if (Number(doc.taxTotal) > 0) summary.push({ label: 'Tax', … });
if (paid > 0) summary.push({ label: 'Already paid', … });
```

No shipping. No surcharge. So Marguerite receives a bill whose lines add to
$58.00, whose subtotal says $58.00, and which asks for $67.00. **Nine dollars
appears from nowhere and the document does not explain it.** A customer who
checks the arithmetic finds it wrong and has to ask; one who does not, pays a
charge nobody showed them.

## Why it stayed hidden

**The printed invoice is correct.** `billing-document-html.ts` has the rows and
prints them:

```ts
if (t.shippingTotal > 0) out.push(row('Shipping', t.shippingTotal));
if (t.surchargeTotal > 0) out.push(row('Surcharge', t.surchargeTotal));
```

So the one artifact that gets it right is the one nobody looks at on screen. Any
check that opened the PDF would have passed. And the server recomputes on every
write, so no wrong number is ever SAVED — the defect lives entirely in what
people are shown, which is exactly where a totals bug does its damage.

It also needs a delivery charge to appear at all. Ten of Devi's sixteen orders
have none, so the first nine invoices raised on this platform were all correct
by accident.

## What it should do

- `computeTotals` takes shipping and surcharge, adds them last as its own comment
  says, and returns them.
- The Summary block shows a Delivery row and a Surcharge row when there is one,
  and stays silent when there is not — the same "only rows that are true of this
  document" rule the email already follows.
- The emailed summary carries both.

## The discount was missing from the email too

Reading the summary builder for the delivery charge showed what else it never
listed. The rows were subtotal, tax, already paid — **no discount either.** So
the two faults are one:

| Invoice    | Subtotal | Missing from the email   | Asked for |
| ---------- | -------- | ------------------------ | --------- |
| INV-000001 | $276.00  | a $41.40 discount        | $234.60   |
| INV-000003 | $634.00  | a $25.00 delivery charge | $659.00   |

**Both were already in Marguerite's inbox** by the time this was found — two of
the five invoices this shop has ever sent. Not a corner case: the first three
were correct only because they happened to carry neither.

The discount is the gentler half (the customer is asked for less than the
subtotal, and nobody complains about that) but it is the same broken document:
a bill whose own figures do not reach its own total.

## What was changed

**Console, both:**

- `totals.ts` — `computeTotals` takes shipping and surcharge, adds them last as
  its own header always claimed, and returns them.
- `invoice-summary.tsx` — a Delivery row and a Surcharge row, each shown only
  when there is one.
- `types.ts` — `shippingTotal` / `surchargeTotal` added to the document type and
  to `normalizeDocument`, which is where every Decimal-as-string gets corrected.
- `invoice-editor.tsx` passes them.
- `totals.test.ts` — new, 5 cases. Removing the two fields from the total again
  reddens four and leaves the fifth green; that fifth is the green twin, and its
  greenness is why this shipped.

**Server:**

- `invoice-mail.ts` — the summary rows are now `invoiceSummaryRows`, a pure
  exported function with its own test, and it lists discount, tax, delivery,
  surcharge and money already paid. The invariant its test asserts is the one a
  customer applies: **the rows have to add up to the number the bill asks for.**
- `invoice-tree-render.ts` — the template binding scope offered subtotal, total
  and balance only, so a hand-built chrome totals block could reproduce exactly
  this gap with no way to close it. It now offers tax, delivery and surcharge.

## Not backfilled

INV-000001 and INV-000003 have been sent with the gap. Re-sending them would put
a second copy of a bill in a customer's inbox to fix a presentation fault in the
first, which is worse than the fault. Devi can send either again herself if she
wants to; the button says "Send again" and warns that they already have a copy.
