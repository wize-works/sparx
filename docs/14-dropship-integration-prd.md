# WizeWorks Platform — Dropship Integration PRD

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

WizeWorks treats dropshipping as a first-class commerce channel, not a plugin. Merchants connect supplier catalogs, import products with one click, set pricing rules, and have orders automatically routed to the right supplier — all without leaving the platform.

---

## 2. Supported Suppliers

### Tier 1 (Native Connectors)
| Supplier | Type | Catalog Size | Shipping |
|----------|------|-------------|----------|
| DSers / AliExpress | General | 100M+ products | 7–30 days |
| Spocket | US/EU Premium | 7M+ products | 3–7 days |
| Faire | Wholesale / B2B | 100K+ brands | 3–5 days |
| AutoDS | Multi-supplier automation | Aggregator | Varies |

### Tier 2 (API Connector — Custom)
Any supplier with a REST API can be connected via the custom connector framework. Merchants provide API credentials and field mappings.

### Tier 3 (Manual / CSV)
For suppliers without APIs, merchants upload CSV product files. Orders are exported as CSV for manual submission.

---

## 3. Supplier Connector Architecture

```
Supplier API / CSV
      │
      ▼
Connector Layer (adapter pattern)
├── DSers Adapter
├── Spocket Adapter
├── Faire Adapter
├── AutoDS Adapter
└── Custom Adapter (webhook + field mapping)
      │
      ▼
Normalized Product Schema
      │
      ▼
WizeWorks Product Catalog
      │
      ▼
Order Router
      │
      ▼
Supplier Order Submission
      │
      ▼
Tracking Webhook → Customer Email
```

Each adapter implements:
```typescript
interface SupplierAdapter {
  authenticate(credentials: Credentials): Promise<boolean>
  syncCatalog(since?: Date): AsyncGenerator<NormalizedProduct>
  submitOrder(order: Order): Promise<SupplierOrderResult>
  getTrackingUpdate(supplierOrderId: string): Promise<TrackingInfo>
  checkInventory(skus: string[]): Promise<InventoryMap>
}
```

---

## 4. Product Import Flow

### Connect Supplier
1. Merchant goes to **Dropship → Suppliers → Add Supplier**
2. Selects supplier type
3. Enters API credentials (stored encrypted in Google Secret Manager)
4. Platform authenticates and confirms connection
5. Initial catalog sync queued (background job)

### Product Search & Import
1. Merchant searches supplier catalog within dashboard
2. Filters by category, price, shipping time, rating
3. Selects product → clicks "Import"
4. Platform creates WizeWorks product with:
   - Supplier product ID linked
   - Variants mapped to supplier variants
   - Images imported to GCS
   - Inventory from supplier
5. Merchant sets their retail price (or applies pricing rule)
6. Product published to store

### Pricing Rules
Merchants configure automatic markup rules:
```
Cost + 40% margin (minimum $5 profit)
Cost × 2.5 (2.5x multiplier)
Cost + $15 flat markup
Compare-at price: Supplier MSRP
```

---

## 5. Catalog Sync

Syncs run on a schedule and on-demand:

| Supplier Tier | Sync Frequency | What Syncs |
|--------------|---------------|-----------|
| Tier 1 (native) | Every 4 hours | Price, inventory, availability |
| Tier 2 (custom) | Every 12 hours | Configurable |
| Tier 3 (CSV) | Manual upload | Full catalog |

If a supplier product is discontinued or goes out of stock:
- Product marked as unavailable on storefront
- Merchant notified via dashboard alert + email
- Merchant can remove or substitute product

---

## 6. Order Routing

When a customer places an order containing dropship products:

```
Order Placed
    │
    ▼
Order Router Analysis
├── Is product dropship? → Yes
│   ├── Which supplier?
│   ├── Is inventory available?
│   └── Submit to supplier API
│       ├── Success → Store supplier order ID
│       └── Failure → Alert merchant, hold order
└── Is product inventory? → Fulfill normally
```

### Mixed Orders
An order can contain both inventory-held and dropship products. The router:
1. Splits into fulfillment groups by supplier
2. Submits each group independently
3. Customer receives combined tracking when all groups ship

### Supplier Order Payload
```json
{
  "merchant_reference": "WW-ORDER-1234",
  "shipping_address": { ... },
  "items": [
    {
      "supplier_sku": "SP-98765",
      "quantity": 2,
      "variant_id": "..."
    }
  ]
}
```

---

## 7. Tracking & Fulfillment

1. Supplier ships order, sends tracking number via webhook or API poll
2. WizeWorks receives tracking → updates order fulfillment record
3. Customer receives automated shipping email with tracking link
4. CRM activity logged: "Order shipped via [supplier]"

---

## 8. Margin & Profitability Reporting

Merchants can see per-product and per-order profitability:
- Cost (from supplier)
- Revenue (from customer)
- Gross margin ($, %)
- Shipping margin (if charging shipping)
- Platform fees

Accessible in the dashboard and via MCP:
> "What are my top 10 most profitable dropship products this month?"
