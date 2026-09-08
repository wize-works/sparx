# 434 — The order number broke in half and the money fell off the edge

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 99
**Surface:** Sell › Orders (the list)
**Filed:** 2026-09-07
**Fixed:** 2026-09-07

## What happened

The first thing on screen after signing in to do a day's work. In a docked pane
her order numbers rendered like this:

```
O-
000016
Due
Thu,
Sep 10
```

The identifier a row is read by, broken across two lines. The due date — the
thing a made-to-order shop scans this list for — broken across four, with the
last one clipped by the row height, so the date a late job was late by was the
part that disappeared.

Measured: the Order column had **83px**. The Delivery column, holding a small
badge, had **118px**.

## Why

Nothing stopped either from wrapping. `<span className="font-mono">` on the
number and a plain `block` on the due line, in an auto-layout table that hands a
column whatever the other five leave behind. Auto layout will always break a
token before it will take space from a neighbor.

## The second half

Making them `whitespace-nowrap` fixed the wrapping and immediately exposed what
the wrapping had been hiding: **six columns do not fit.** The table wanted
**719px** in a **676px** pane, and the column that fell off the right edge was
**Total** — "$67" where "$67.00" belongs.

The disclosure ladder is by container width and is otherwise well judged:
Customer appears at `@lg`, Delivery at `@xl`, Placed at `@2xl`. The top rung was
simply set too low — `@2xl` is 672px and six columns need 719. Placed was already
the last column to appear, so it is the one that now waits until `@3xl`.

Result at the same pane width: no overflow, the money intact, and **ten rows
visible where five fit before**.

## The third half, on a phone

At 360px the table still scrolled sideways by 26px. The cause was one line up:

```tsx
<span className="block truncate text-xs @lg:hidden">{customerName(order.customer)}</span>
```

`truncate` with **nothing to truncate against**. A name has no natural width, so
with no cap the span simply grew the column: "Marguerite Adeyemi" claimed 115px
against the 77px the order number needs, and a longer name would have taken more
still. That is exactly the failure the `IDENTITY_CELL` constant's own note in
[components/table.tsx](../../../apps/workbench/components/table.tsx) describes,
on a list that never adopted it.

Capped at 96px — chosen because that is about what "Due Thu, Sep 10" already
costs, so a name can never be the thing that widens a column that has to fit the
due line anyway. It relaxes at `@sm` and disappears entirely at `@lg` when the
Customer column takes over. Sideways scroll: **26px → 4px**, which is border
rounding.

## Both consoles

`sparx/apps/workbench/surfaces/commerce/orders-list.tsx` had the same unguarded
`font-mono` number and the same `@2xl` rung. It has no due line and no phone-only
name, so it took two of the four edits.

## Checks

Typecheck and lint clean on both consoles; `check:console-parity` and
`check-boundaries` both pass.
