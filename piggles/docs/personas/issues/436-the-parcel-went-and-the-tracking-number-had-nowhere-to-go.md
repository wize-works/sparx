# 436 — The parcel went, and the tracking number had nowhere to go

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 100
**Surface:** Sell › Orders › an order › Deliveries
**Filed:** 2026-09-07
**Fixed:** 2026-09-07

## How it was found

By writing a sentence and then checking whether it was true.

Marking an order sent shows a toast. It said, always:

> **Marked as sent** — The customer can follow it from here.

The tracking number on that form is **optional**, and leaving it blank is the
normal case for a shop that walks its own parcels to the post office: the goods
are boxed and marked sent, and the number comes back afterwards. With no number
the customer's email carries the carrier and nothing else — the "Track your
package" button is gated on the tracking number, so it is not in the mail at all.
There is nothing to follow.

So I changed the toast to say which of the two just happened, and wrote _"Add a
tracking number later if you get one."_ Then checked whether **that** was true.

It was not.

## The real defect

**A shipment was frozen the moment it was made.** Once an order was marked sent,
there was no way in either console to add, change or remove its tracking number.

`PATCH /v1/orders/:id/fulfillments/:fulfillmentId` has always existed. The
service behind it has always existed. **Nothing in either console called it** —
only `GET` and `POST` appear anywhere in the two apps.

That is the same gap, on the same block, that somebody already found and fixed
for the other half. The comment above `useRecordFulfillment` reads:

> `POST /v1/orders/:id/fulfillments` has always existed and nothing in either
> console called it.

The create half was wired up. The update half was left.

So: the parcel goes, the customer is emailed "on its way" with nothing to follow,
the post office hands over a tracking number, and there is nowhere on the screen
to put it. No later mail would ever carry one either.

## What was built

- **`useUpdateTracking`** in both consoles' order data modules, calling the PATCH
  that was already there. An empty value sends `null`, so a number typed by
  mistake can be removed and not merely replaced.
- **A `TrackingEditor`** on each shipment row: a link reading _"Add a tracking
  number"_ or _"Change the tracking number"_, opening an inline field with Save
  and Cancel. A collection gets none — there is nothing to track.
- **The toast now says what happened**, in three states: collected, sent with a
  number, sent without one.

## The audit log was recording nothing

Worth its own line, because creating this write exposed it. `failRun`'s sibling,
the fulfillment update, wrote:

```ts
diff: { before: { status: before.status }, after: { status: updated.status } }
```

Status only. So an edit that set or replaced a **tracking number** wrote an audit
row whose diff said nothing had changed. The diff now carries the tracking number
on both sides — "who changed it, and from what" is exactly the question asked
when a parcel goes missing.

Verified on a real edit:

```json
{
  "after": { "status": "shipped", "trackingNumber": "9405511899223197431807" },
  "before": { "status": "shipped", "trackingNumber": null }
}
```

## Two smaller things fixed while in the file

- The input had **no placeholder** and took the whole row, pushing Save onto a
  line of its own. Now `w-56` with a short placeholder — short deliberately,
  because the field is monospaced and a longer hint is clipped rather than read.
- The shipment headline joined carrier and service unconditionally, so a real
  service name read **"USPS · USPS Ground Advantage Economy"**. When the service
  already names the carrier, it now says it once.

## Checks

Both consoles typecheck and lint clean; `check:console-parity` and
`check-boundaries` pass. Verified by hand: added a number to an already-sent
order, saw it on the row, and confirmed the audit row and the customer-facing
`/v1/public/commerce/account` payload both carry it — so the toast's claim that
"it shows on the customer's order page" is true.
