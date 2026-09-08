# sparx Platform — Inventory API Reference

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-08-13

---

## What this is

The complete inventory HTTP surface — **340 endpoints across 38 route files**. It lives here rather than in [docs/06](06-api-specification.md) because inventory is an order of magnitude larger than any other domain in that document, and burying the whole platform API under one module would make the spec unusable. docs/06 §7 carries the contract-stable core and a description of every group below; this is the exhaustive list.

**This file is generated.** Run `node scripts/gen-inventory-api-reference.mjs` after adding a route; `node scripts/check-inventory-api-docs.mjs` fails the build when it drifts. Do not hand-edit the endpoint tables — edit `GROUPS` in the generator for the prose.

## Conventions

- Every endpoint is gated on the `inventory` module flag. A disabled module returns `404 MODULE_DISABLED` rather than pretending the data is empty.
- Reads need `read:inventory`, writes need `write:inventory` for a programmatic key (`Authorization: Bearer sk_live_…`). Staff sessions are gated by role instead — `viewer` reads, `editor` writes, and a few settings surfaces require `admin`.
- Every write that changes a quantity goes through the movement ledger, so it is concurrency-safe, idempotent and attributed. There is no path that edits on-hand directly.
- Responses use the standard envelope and pagination described in docs/06 §4–§5.

---

## The contract-stable core

The four endpoints promised not to change shape. Everything else in this document is real, supported and versioned the same way, but these are the ones an integration should build on first.

```
GET     /v1/inventory
PATCH   /v1/inventory/:variant_id
POST    /v1/inventory/adjustments
GET     /v1/inventory/alerts
GET     /v1/inventory/uncounted
```

## Locations

The places stock physically sits — owned sites, third-party warehouses, vans, virtual locations.

```
GET     /v1/inventory/locations
POST    /v1/inventory/locations
GET     /v1/inventory/locations/:id
PATCH   /v1/inventory/locations/:id
DELETE  /v1/inventory/locations/:id
GET     /v1/inventory/locations/:id/levels
```

## Stock levels and the grid

Reading and setting quantities, including the spreadsheet-style bulk grid and its CSV round trip.

```
POST    /v1/inventory/adjust
GET     /v1/inventory/levels/variant/:variantId
GET     /v1/inventory/levels/warehouse/:warehouseId
GET     /v1/inventory/levels/warehouse/:warehouseId/enriched
GET     /v1/inventory/low-stock
POST    /v1/inventory/reorder-policy
GET     /v1/inventory/reservations
POST    /v1/inventory/safety-buffer
POST    /v1/inventory/transfer
```

## The movement ledger

Every change to every quantity, as an append-only record. On-hand is only ever written through this.

```
GET     /v1/inventory/movements
GET     /v1/inventory/movements/export
```

## Integrity — can this number be trusted

Re-derives on-hand from the ledger and records where the two disagree. Never auto-corrects: a silent fix destroys the evidence.

```
GET     /v1/inventory/channel-buffers
PUT     /v1/inventory/channel-buffers
DELETE  /v1/inventory/channel-buffers/:id
GET     /v1/inventory/integrity/drifts
GET     /v1/inventory/integrity/oversell
GET     /v1/inventory/integrity/oversell/summary
GET     /v1/inventory/integrity/reconciliation
POST    /v1/inventory/integrity/reconciliation
PUT     /v1/inventory/sources/:id/freshness
GET     /v1/inventory/sources/freshness
POST    /v1/inventory/sources/freshness/sweep
GET     /v1/inventory/stock/:variant_id/:warehouse_id/provenance
```

## Counts

Cycle, full and opening counts, through submit → approve → post.

```
GET     /v1/inventory/counts
POST    /v1/inventory/counts
GET     /v1/inventory/counts/:id
POST    /v1/inventory/counts/:id/approve
POST    /v1/inventory/counts/:id/cancel
POST    /v1/inventory/counts/:id/entries
POST    /v1/inventory/counts/:id/lines
DELETE  /v1/inventory/counts/:id/lines/:lineId
POST    /v1/inventory/counts/:id/post
POST    /v1/inventory/counts/:id/submit
```

## Count schedules

Which items get counted how often, and what is due.

```
GET     /v1/inventory/count-schedules
POST    /v1/inventory/count-schedules
GET     /v1/inventory/count-schedules/:id
PATCH   /v1/inventory/count-schedules/:id
DELETE  /v1/inventory/count-schedules/:id
POST    /v1/inventory/count-schedules/:id/run
POST    /v1/inventory/count-schedules/generate
```

## Transfers between locations

Two-phase, so stock is conserved while it is on a van.

```
GET     /v1/inventory/transfers
POST    /v1/inventory/transfers
GET     /v1/inventory/transfers/:id
DELETE  /v1/inventory/transfers/:id
POST    /v1/inventory/transfers/:id/cancel
POST    /v1/inventory/transfers/:id/lines
PATCH   /v1/inventory/transfers/:id/lines/:lineId
DELETE  /v1/inventory/transfers/:id/lines/:lineId
POST    /v1/inventory/transfers/:id/receive
POST    /v1/inventory/transfers/:id/ship
```

## Bins and put-away

Shelf-level positions inside a location, and where a delivery should go.

```
GET     /v1/inventory/bins
POST    /v1/inventory/bins
GET     /v1/inventory/bins/:id
PATCH   /v1/inventory/bins/:id
DELETE  /v1/inventory/bins/:id
GET     /v1/inventory/bins/:id/contents
PUT     /v1/inventory/bins/home/:variantId
POST    /v1/inventory/bins/move
GET     /v1/inventory/bins/suggest
GET     /v1/inventory/bins/variant/:variantId
POST    /v1/inventory/warehouses/:id/bins/disable
POST    /v1/inventory/warehouses/:id/bins/enable
```

## Barcodes

The codes that make a scanner resolve to an item, including conflicts.

```
GET     /v1/inventory/barcodes
POST    /v1/inventory/barcodes
PATCH   /v1/inventory/barcodes/:id
DELETE  /v1/inventory/barcodes/:id
POST    /v1/inventory/barcodes/:id/primary
GET     /v1/inventory/barcodes/conflicts
POST    /v1/inventory/barcodes/conflicts/resolve
POST    /v1/inventory/barcodes/generate
GET     /v1/inventory/barcodes/variant/:variantId
GET     /v1/inventory/scan
POST    /v1/inventory/scan
GET     /v1/inventory/scan/events
```

## Scanning

Receive, count, transfer and put away from a scanner or a phone camera.

```
POST    /v1/inventory/counts/:countId/scan
POST    /v1/inventory/put-away/scan
GET     /v1/inventory/receiving/:purchaseOrderId
POST    /v1/inventory/receiving/:purchaseOrderId/post
POST    /v1/inventory/receiving/:purchaseOrderId/scan
DELETE  /v1/inventory/receiving/:purchaseOrderId/scan/:scanEventId
POST    /v1/inventory/scan/replay
POST    /v1/inventory/transfers/:transferId/scan
```

## Picking and packing

Pick lists, the guided pick walk, short picks, and pack verification.

```
GET     /v1/inventory/packages
POST    /v1/inventory/packages
GET     /v1/inventory/packages/:packageId
PATCH   /v1/inventory/packages/:packageId
POST    /v1/inventory/packages/:packageId/cancel
POST    /v1/inventory/packages/:packageId/close
POST    /v1/inventory/packages/:packageId/fulfill
POST    /v1/inventory/packages/:packageId/items
GET     /v1/inventory/packages/:packageId/packing-slip
POST    /v1/inventory/packages/:packageId/scan
GET     /v1/inventory/pick-lists
POST    /v1/inventory/pick-lists
GET     /v1/inventory/pick-lists/:pickListId
POST    /v1/inventory/pick-lists/:pickListId/assign
POST    /v1/inventory/pick-lists/:pickListId/cancel
POST    /v1/inventory/pick-lists/:pickListId/pick
POST    /v1/inventory/pick-lists/:pickListId/scan
POST    /v1/inventory/pick-lists/:pickListId/short
POST    /v1/inventory/pick-lists/:pickListId/skip
GET     /v1/inventory/reports/pick-throughput
```

## Lots, serials and recalls

Batch and unit traceability, expiry, and the recall lifecycle.

```
GET     /v1/inventory/lots
POST    /v1/inventory/lots
GET     /v1/inventory/lots/:id
POST    /v1/inventory/lots/:id/clear-recall
GET     /v1/inventory/lots/:id/serials
GET     /v1/inventory/lots/expiring
POST    /v1/inventory/recalls
GET     /v1/inventory/recalls/active
GET     /v1/inventory/serials
POST    /v1/inventory/serials
PATCH   /v1/inventory/serials/:id
```

## Units of measure

Buying in cases and selling in singles, without two numbers that disagree.

```
GET     /v1/inventory/units
POST    /v1/inventory/units
PATCH   /v1/inventory/units/:id
DELETE  /v1/inventory/units/:id
GET     /v1/inventory/variants/:variantId/units
PUT     /v1/inventory/variants/:variantId/units
```

## Bills of materials and assembly

What a thing is made of, how many you could build, and running a build.

```
GET     /v1/inventory/assemblies
POST    /v1/inventory/assemblies
GET     /v1/inventory/assemblies/:id
PATCH   /v1/inventory/assemblies/:id
POST    /v1/inventory/assemblies/:id/cancel
POST    /v1/inventory/assemblies/:id/complete
POST    /v1/inventory/assemblies/:id/release
GET     /v1/inventory/boms
POST    /v1/inventory/boms
GET     /v1/inventory/boms/:id
PATCH   /v1/inventory/boms/:id
DELETE  /v1/inventory/boms/:id
GET     /v1/inventory/boms/:id/buildable
POST    /v1/inventory/boms/:id/status
GET     /v1/inventory/variants/:variantId/bom
```

## Cost

Moving-average and FIFO layers, landed cost, and what a delivery actually cost once freight is in.

```
GET     /v1/inventory/costing/layers
GET     /v1/inventory/costing/movement/:id
GET     /v1/inventory/costing/policy
PATCH   /v1/inventory/costing/policy
GET     /v1/inventory/costing/uncosted
POST    /v1/inventory/costing/uncosted
POST    /v1/inventory/costing/variant-method
PATCH   /v1/inventory/purchase-order-charges/:id
DELETE  /v1/inventory/purchase-order-charges/:id
GET     /v1/inventory/purchase-orders/:id/charges
POST    /v1/inventory/purchase-orders/:id/charges
PATCH   /v1/inventory/receipt-charges/:id
DELETE  /v1/inventory/receipt-charges/:id
GET     /v1/inventory/receipts/:id/charges
POST    /v1/inventory/receipts/:id/charges
GET     /v1/inventory/receipts/:id/landed-cost
GET     /v1/inventory/reports/cogs
GET     /v1/inventory/reports/price-variance
GET     /v1/inventory/reports/valuation-as-of
```

## Suppliers

Who you buy from and the per-item purchasing links.

```
GET     /v1/inventory/suppliers
POST    /v1/inventory/suppliers
GET     /v1/inventory/suppliers/:id
PATCH   /v1/inventory/suppliers/:id
DELETE  /v1/inventory/suppliers/:id
GET     /v1/inventory/suppliers/:id/variants
PUT     /v1/inventory/suppliers/:id/variants
DELETE  /v1/inventory/suppliers/:id/variants/:variantId
GET     /v1/inventory/suppliers/variant-lookup
```

## Purchase orders

Raising, sending, receiving and closing an order.

```
GET     /v1/inventory/purchase-orders
POST    /v1/inventory/purchase-orders
GET     /v1/inventory/purchase-orders/:id
PATCH   /v1/inventory/purchase-orders/:id
DELETE  /v1/inventory/purchase-orders/:id
POST    /v1/inventory/purchase-orders/:id/cancel
POST    /v1/inventory/purchase-orders/:id/close
GET     /v1/inventory/purchase-orders/:id/document
POST    /v1/inventory/purchase-orders/:id/lines
PATCH   /v1/inventory/purchase-orders/:id/lines/:lineId
DELETE  /v1/inventory/purchase-orders/:id/lines/:lineId
POST    /v1/inventory/purchase-orders/:id/submit
```

## Purchase-order approvals

Who has to sign off on what spend, and what is waiting.

```
POST    /v1/inventory/purchase-orders/:id/reschedule
GET     /v1/inventory/purchase-orders/approval-rules
POST    /v1/inventory/purchase-orders/approval-rules
PATCH   /v1/inventory/purchase-orders/approval-rules/:id
DELETE  /v1/inventory/purchase-orders/approval-rules/:id
GET     /v1/inventory/purchase-orders/approvals
POST    /v1/inventory/purchase-orders/approvals/:id/cancel
POST    /v1/inventory/purchase-orders/approvals/:id/decide
```

## Goods receipts

What actually turned up against what was ordered.

```
GET     /v1/inventory/receipts
POST    /v1/inventory/receipts
GET     /v1/inventory/receipts/:id
POST    /v1/inventory/receipts/:id/bill
GET     /v1/inventory/receipts/:id/bill-draft
```

## Advance ship notices

What a supplier says is on its way, before it arrives.

```
GET     /v1/inventory/advance-ship-notices
POST    /v1/inventory/advance-ship-notices
GET     /v1/inventory/advance-ship-notices/:id
PATCH   /v1/inventory/advance-ship-notices/:id
POST    /v1/inventory/advance-ship-notices/:id/cancel
GET     /v1/inventory/advance-ship-notices/:id/prefill
```

## Supplier performance

On-time rate, fill rate, price variance and lead-time reliability.

```
GET     /v1/inventory/purchase-orders/late
GET     /v1/inventory/supplier-variants/:id/price-breaks
PUT     /v1/inventory/supplier-variants/:id/price-breaks
GET     /v1/inventory/suppliers/:id/scorecard
GET     /v1/inventory/suppliers/scorecards
POST    /v1/inventory/suppliers/scorecards/recompute
```

## Supplier returns

Stock sent back, and the credits still owed for it.

```
GET     /v1/inventory/supplier-returns
POST    /v1/inventory/supplier-returns
GET     /v1/inventory/supplier-returns/:id
PATCH   /v1/inventory/supplier-returns/:id
POST    /v1/inventory/supplier-returns/:id/cancel
POST    /v1/inventory/supplier-returns/:id/close
POST    /v1/inventory/supplier-returns/:id/credit
POST    /v1/inventory/supplier-returns/:id/send
```

## Supplier bills

Matching an invoice to what was received.

```
GET     /v1/inventory/supplier-bills
POST    /v1/inventory/supplier-bills
GET     /v1/inventory/supplier-bills/:id
PATCH   /v1/inventory/supplier-bills/:id
POST    /v1/inventory/supplier-bills/:id/accept-variance
POST    /v1/inventory/supplier-bills/:id/approve
POST    /v1/inventory/supplier-bills/:id/cancel
POST    /v1/inventory/supplier-bills/:id/dispute
POST    /v1/inventory/supplier-bills/:id/pay
```

## Reordering

What to buy today, and the suggested orders that follow from it.

```
POST    /v1/inventory/reorder/draft
GET     /v1/inventory/reorder/suggestions
GET     /v1/inventory/reorder/summary
GET     /v1/inventory/reorder/worklist
```

## Planning

Stockout risk, slow movers, holding cost, and the policy behind them.

```
GET     /v1/inventory/planning/demand/:variant_id/:warehouse_id
GET     /v1/inventory/planning/explain/:variant_id/:warehouse_id
GET     /v1/inventory/planning/holding-cost
GET     /v1/inventory/planning/lead-times
GET     /v1/inventory/planning/policy
PUT     /v1/inventory/planning/policy
POST    /v1/inventory/planning/recompute
PUT     /v1/inventory/planning/reorder-plan
POST    /v1/inventory/planning/reorder-plan/apply
GET     /v1/inventory/planning/reorder-plans
GET     /v1/inventory/planning/slow-movers
GET     /v1/inventory/planning/stockout-risk
```

## Demand and forecasting

Consumption history, forecasts, and the commitments already made against stock.

```
GET     /v1/inventory/consignment/settlements
POST    /v1/inventory/consignment/settlements
GET     /v1/inventory/consignment/settlements/:id
POST    /v1/inventory/consignment/settlements/:id/cancel
POST    /v1/inventory/consignment/settlements/:id/close
POST    /v1/inventory/consignment/settlements/:id/invoice
POST    /v1/inventory/consignment/settlements/:id/paid
POST    /v1/inventory/consignment/settlements/:id/refresh
GET     /v1/inventory/consignment/unsettled
GET     /v1/inventory/expiring
POST    /v1/inventory/expiring/markdown
POST    /v1/inventory/expiring/write-off
GET     /v1/inventory/ownership
POST    /v1/inventory/ownership
GET     /v1/inventory/preorders
GET     /v1/inventory/preorders/:id
PATCH   /v1/inventory/preorders/:id
POST    /v1/inventory/preorders/:id/close
POST    /v1/inventory/variants/:variantId/preorder
```

## Value and predictability

Which items are worth attention, and which have demand steady enough to forecast.

```
GET     /v1/inventory/classifications
PUT     /v1/inventory/classifications
GET     /v1/inventory/classifications/:variant_id/:warehouse_id
```

## Backorders

What has been promised and cannot yet be shipped.

```
GET     /v1/inventory/backorders
GET     /v1/inventory/backorders/:id
PATCH   /v1/inventory/backorders/:id
POST    /v1/inventory/backorders/:id/cancel
POST    /v1/inventory/backorders/:id/notified
POST    /v1/inventory/backorders/refresh-promises
```

## Reports

The report registry — one code path shared by the export button, the scheduler and an assistant.

```
GET     /v1/inventory/gl-reconciliation
GET     /v1/inventory/gl-snapshots
POST    /v1/inventory/gl-snapshots
GET     /v1/inventory/imports
POST    /v1/inventory/imports
GET     /v1/inventory/imports/:id
POST    /v1/inventory/imports/:id/apply
POST    /v1/inventory/imports/:id/discard
POST    /v1/inventory/imports/:id/reverse
GET     /v1/inventory/imports/template
GET     /v1/inventory/report-schedules
POST    /v1/inventory/report-schedules
GET     /v1/inventory/report-schedules/:id
PATCH   /v1/inventory/report-schedules/:id
DELETE  /v1/inventory/report-schedules/:id
POST    /v1/inventory/report-schedules/:id/run
GET     /v1/inventory/reports/:key
GET     /v1/inventory/reports/catalog
```

## Analytics reports

Valuation, turnover, ageing and dead stock.

```
GET     /v1/inventory/reports/aging
GET     /v1/inventory/reports/reorder-analysis
GET     /v1/inventory/reports/shrinkage
GET     /v1/inventory/reports/turnover
GET     /v1/inventory/reports/valuation
```

## Report delivery

Scheduled report sends and their history.

```
GET     /v1/inventory/reports/activity
GET     /v1/inventory/reports/summary
GET     /v1/inventory/reports/valuation-timeseries
```

## Accounting

Journals, the GL reconciliation, and the connectors that carry them out.

```
GET     /v1/inventory/accounting/accounts
PUT     /v1/inventory/accounting/accounts
POST    /v1/inventory/accounting/balance
GET     /v1/inventory/accounting/journal
POST    /v1/inventory/accounting/journal
```

## External stock feeds

ERP and WMS feeds into the one ledger, and whether each is still telling the truth.

```
GET     /v1/inventory/sources
POST    /v1/inventory/sources
GET     /v1/inventory/sources/:id
PATCH   /v1/inventory/sources/:id
DELETE  /v1/inventory/sources/:id
POST    /v1/inventory/sources/:id/push
POST    /v1/inventory/sources/:id/sync
```

## Feed sync

Running a sync and reading its outcome.

```
GET     /v1/inventory/sources/:id/health
GET     /v1/inventory/sources/:id/runs
GET     /v1/inventory/sources/:id/unmapped
POST    /v1/inventory/sources/:id/unmapped/:unmappedId/ignore
POST    /v1/inventory/sources/:id/unmapped/:unmappedId/map
```

## Getting set up

The guided setup, spreadsheet import with column mapping, opening balances and tenant-defined columns.

```
GET     /v1/inventory/custom-fields
POST    /v1/inventory/custom-fields
PATCH   /v1/inventory/custom-fields/:id
DELETE  /v1/inventory/custom-fields/:id
GET     /v1/inventory/custom-fields/values/:entity/:id
PATCH   /v1/inventory/custom-fields/values/:entity/:id
GET     /v1/inventory/import-profiles
POST    /v1/inventory/import-profiles
PATCH   /v1/inventory/import-profiles/:id
DELETE  /v1/inventory/import-profiles/:id
GET     /v1/inventory/import-recipes
POST    /v1/inventory/imports/:id/resolve
POST    /v1/inventory/imports/preview
GET     /v1/inventory/opening-balance
POST    /v1/inventory/opening-balance
GET     /v1/inventory/setup
POST    /v1/inventory/setup/dismiss
POST    /v1/inventory/setup/steps
GET     /v1/inventory/stock-grid
POST    /v1/inventory/stock-grid
```

## Bridge agent

Enrolment and heartbeat for the on-premise bridge.

```
POST    /v1/inventory/sources/:id/enroll
POST    /v1/inventory/sources/:id/heartbeat
POST    /v1/inventory/sources/:id/revoke-agent
```

## Deep links

Addresses that open a specific inventory surface in the workbench.

```
GET     /v1/inventory/sources/:sourceId/links
POST    /v1/inventory/sources/:sourceId/links
DELETE  /v1/inventory/sources/:sourceId/links/:id
```

---

## Sources

- Routes: `wizeworks/services/api-rest/src/routes/v1/inventory`
- Capability plan: [docs/146](146-inventory-parity-and-gap-closure.md)
- Platform API spec: [docs/06](06-api-specification.md)
