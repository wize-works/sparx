# 441 — The letterhead was never frozen, and never printed

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 102
**Surface:** Money › Invoices › print, and the emailed invoice
**Filed:** 2026-09-07
**Fixed:** 2026-09-07
**Confirmed by:** printed INV-000003 as Devi, moved the business address through Business details, printed the same invoice again — still the address it was issued under, and the new one appears nowhere in the artifact

## What happened

`billing_documents.issued_by` exists, has its own migration, and is filled in on
every invoice that reaches a final stage. The code that fills it explains itself
at length:

> Freeze WHO ISSUED this. `billTo`/`shipTo` were already snapshotted here and the
> seller was not, so renaming a site — or editing the legal entity's address —
> silently rewrote the letterhead on invoices already in customers' hands.

That is a real problem and a correct fix. **Nothing reads the column.**

One repo-wide search for `issuedBy` returns three hits, all inside the function
that writes it. It is not in the snapshot payload either — `buildSnapshotPayload`
carries stage, document, party, lines, and no seller.

Both renderers go to the live value instead:

```ts
// invoice-tree-render.ts
seller: { name: b.businessName },     // resolveBillingBrand(brand)

// invoice-mail.ts
const site = await prisma.property.findUnique({ ... select: { name: true } });
const fromName = site?.name ?? tenant?.name ?? 'us';
```

So the exact thing the column was added to prevent still happens: rename the
site, and every invoice already sent reprints under the new name.

## A third writer never got the rule at all

`b2b-ar-service.createOrderArDocument` builds its document directly rather than
through `applyStageEntryEffects` — it allocates its own number, sets its own
`finalizedAt`, and freezes its own snapshot. It never sets `issuedBy`. So every
net-terms AR invoice has a null one on top of everything above.

## Why it stayed hidden

The write side is complete and well argued, so a reader of that function has no
reason to check whether anyone downstream is listening. Same shape as the ones
this run keeps finding: [433] was an email that was provisioned, published and
never sent; [436] was an API verb no console called. Here it is a **column that
is correctly maintained and never read**.

## It was worse than "written and never read"

The database settled it. **0 of 90 billing documents on this database carried an
issuer**, 52 of them finalized. So the column was not merely unread — it was
never written either, and for a reason worth writing down:

```
invoice        Invoice     open      ← the DEFAULT workflow every tenant starts on
invoice        Paid        paid
service-repair Invoiced    final     ← the only place the freeze could ever fire
```

The freeze lived inside a `stage.stageType === 'final'` block, and **the default
workflow has no `final` stage.** Its one Invoice stage is `open`. So on the
workflow the overwhelming majority of documents use, the freeze never ran.

That is the same mistake, in the same function, that had already been found and
fixed for a different field. The due date used to sit in that same `final`-only
block, and its comment says exactly why it was moved out:

> The consequence was that the DEFAULT workflow, whose Invoice stage is `open`,
> could never produce one: every invoice a new tenant ever raised read "No due
> date", sat outside every aging bucket, and could never be chased.

One field was moved out of the wrong block and **its neighbour was left behind**.

## The fix

Four parts, and all four were needed — any one alone leaves the letterhead
moving.

1. **Freeze it when the document becomes payable**, not only when it is
   finalized. That is `open` or `final`: the moment it becomes a bill somebody is
   handed, which is the moment both "when is it due" and "who is billing you"
   must stop moving. The two are now one rule in one block.
2. **Read it when printing.** `resolveInvoiceBrand` takes the document's frozen
   issuer and prefers it over the live business. The visual brand still resolves
   live and deliberately: colors and a logo are the tenant's current look, and
   re-rendering an old invoice in the new house style is cosmetic. Who issued it
   is not.
3. **Read it when emailing.** The invoice email's "from" name is the frozen
   `siteName` — the trading name, because that is what a customer recognises in
   an inbox, where the printed document uses the legal entity.
4. **Freeze it on the B2B AR ledger too.** That path builds its document
   directly, stamps its own `finalizedAt`, and had no issuer at all.
   `snapshotIssuer` is now exported and both writers call it, rather than a
   second copy that becomes a second thing to keep in step.

And the snapshot payload now carries the issuer, so the immutable record of a
document can say who sent it. `billTo` and `shipTo` were frozen there from the
start and the seller was not — a frozen record that names the customer but not
the seller is only half a record.

## Proof, driven as Devi

Her business details were empty, so her invoices had no letterhead at all. Filled
in as she would: **Juniper Row Textiles LLC, 1184 SE Ash St, Portland, OR 97214**.

1. Raised **INV-000003** for order O-000015. `issued_by` written for the first
   time on this platform — the full block, both names, the address.
2. **Printed it.** The masthead read "Juniper Row Textiles LLC / 1184 SE Ash St /
   Portland, OR 97214 / US".
3. **Moved the business** to 2260 NW Quimby St, through the same Business details
   screen an owner would use.
4. **Printed the same invoice again.** Still 1184 SE Ash St. The new address
   appears nowhere in the artifact — checked against the printed bytes, not the
   screen.
5. Restored her real address. INV-000003 keeps the letterhead it was issued
   under.

That step 4 is the whole issue: before this, it would have said 2260 NW Quimby
St, and her customer's copy and her own would have disagreed about who billed
them.

**The guard was run red.** Disabling the freeze turns "freezes who issued it, on
the default workflow" red and leaves the other nine green.

494 crm tests and 7 new unit tests on the decode pass. The existing snapshot test
caught the payload change immediately, which is what a strict shape assertion is
for.

## What is deliberately NOT backfilled

INV-000001 and INV-000002 — raised before this — still have no issuer, and they
print from the live business. That is correct and is not a gap to close: nobody
recorded who issued them at the time, so inventing one now would be worse than
falling back. Anything issued from here on carries its own.
