# 435 — The email told her customer the parcel went by "usps"

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 99
**Surface:** the shipping confirmation, and every screen that names a carrier
**Filed:** 2026-09-07
**Fixed:** 2026-09-07

## How it was found

By finishing the job rather than the code. [433](433-she-marks-an-order-sent-and-the-customer-is-never-told.md)
wired the shipping confirmation up; this was found by then actually sending one
of Devi's overdue orders through the console and following the mail out.

The send worked. `entity_refs` carried the exact parcel, the automation ran and
completed, and the row went to `sent`. Then, reading what the render would
actually put in front of the customer:

```
carrier | usps
```

The template binds `{{shipping.carrier}}` and `resolveShipping` returned
`f.carrier ?? ''` — the stored column, raw. So the customer's confirmation named
their courier in lowercase, while the owner's console and the shopper's own order
page on the same shop both said **USPS**.

## Three maps, already drifted apart

The translation existed. Three times, and they disagreed:

| stored code | owner's console      | her website                          | the customer's email |
| ----------- | -------------------- | ------------------------------------ | -------------------- |
| `usps`      | USPS                 | USPS                                 | **usps**             |
| `dropship`  | Sent by the supplier | **Drop-ship**                        | **dropship**         |
| `other`     | Another courier      | **"OTHER"** (`toUpperCase` fallback) | **other**            |
| (none)      | omitted              | **the literal word "Carrier"**       | omitted              |

The website's copy was the worst of the three, and it is the one a shopper reads.
`dropship` is a word from inside the business; "OTHER" shouted at a customer is
not an answer; and a fulfillment with no carrier put the word "Carrier" on the
page beside the service name, because the local helper's `if (!carrier) return
'Carrier'` fed straight into a `.filter(Boolean)`.

## The fix — one list

`carrierLabel()` now lives in `@wizeworks/commerce-schemas/shipping`, beside the
rest of the shipping vocabulary, and all four callers read it: the email render,
both consoles, and the shopper's order page. An unknown code is returned
**unchanged** rather than upper-cased — a code nobody has named is a gap in the
map, and shouting it does not make it mean anything.

Three local maps deleted.

## Proof

Three tests added to `api-rest/test/integration/email-data.test.ts`, against the
real `shipping-confirmation` template and a real order with **two** parcels:

- the carrier renders as `USPS`, and `dropship` as `Sent by the supplier`;
- naming a parcel in the refs reports **that** parcel's tracking number, not
  whichever shipped most recently;
- the latest-parcel fallback is asserted too, documented as what every send did
  before the refs carried a fulfillment.

8 tests pass in that file. Both consoles typecheck and lint clean, and the order
pane still reads "USPS · Standard Delivery" through the shared helper.

## One thing outstanding, and it needs the user

`wizeworks/apps/site` did not depend on `@wizeworks/commerce-schemas`. The
dependency is added to its `package.json` and the import is in place, but the
package is not linked into `apps/site/node_modules` yet, so that one file will
not typecheck until **`pnpm install`** is run. That is the user's to run — a mid
session install can disturb a running stack. Her site was still serving 200 at the
time of writing; the unresolved import bites when the account order route is
compiled.
