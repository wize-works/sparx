# WizeWorks Platform — B2B & Wholesale PRD

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

B2B and wholesale commerce is a first-class feature of WizeWorks, not an add-on. It is designed to handle the full complexity of business-to-business selling: account-based pricing, credit terms, purchase approval workflows, RFQ/quote flows, fleet management, and fitment-aware catalog behavior.

This module was designed with Gillett Diesel Service Inc. as the primary reference customer — a diesel parts and service business with fleet accounts, wholesale buyers, and complex pricing requirements.

---

## 2. B2B Account Model

### Account Structure

A B2B Account represents a business entity (e.g. "Acme Fleet Services"). Multiple customer contacts can belong to one B2B account.

```
B2B Account (Acme Fleet Services)
├── Contact: John Smith (fleet manager) — can place orders
├── Contact: Sarah Lee (AP) — can view invoices only
├── Contact: Mike Davis (buyer) — can request quotes
└── Pricing Tier: Wholesale Tier 1
    Credit Limit: $25,000
    Credit Used: $8,400
    Payment Terms: Net 30
```

### Account Fields

- Company name, tax ID, website
- Billing and shipping addresses (multiple)
- Pricing tier assignment
- Credit limit + current utilization
- Payment terms (prepay | net30 | net60 | net90)
- Discount percentage (flat, stacked with tier)
- Account status (active | suspended | credit hold)
- Fleet profiles (engine types, vehicle count) — for fitment-aware catalog
- Internal notes (staff only)
- Tags

### Account Status Transitions

```
Active → Credit Hold (when credit limit exceeded)
Active → Suspended (manual, or after N days overdue)
Suspended → Active (on payment + manual approval)
```

---

## 3. Pricing Tiers

Pricing tiers define discount structures applied to all members of an account.

### Tier Configuration

| Field          | Description                                              |
| -------------- | -------------------------------------------------------- |
| Name           | e.g. "Wholesale Tier 1", "Fleet Partner"                 |
| Discount type  | Percentage off list price, or fixed price override       |
| Discount value | e.g. 20% off                                             |
| Product scope  | All products, specific collections, or specific products |
| Minimum order  | Minimum order value to access tier pricing               |

### Tier Examples

```
Tier: Fleet Partner
  - All diesel parts: 18% off list
  - Turbo assemblies: 25% off list
  - Labor/service: list price (no discount)

Tier: Wholesale Tier 1
  - All products: 15% off list
  - Min order: $500

Tier: Distributor
  - Product-specific price lists (CSV upload)
  - No minimum order
```

### Price Resolution Order

When calculating price for a B2B customer:

1. Check for product-specific price override on the account
2. Check for product-specific price override on their tier
3. Apply tier discount to list price
4. Apply account-level flat discount (stacked)
5. Fall back to list price

---

## 4. Catalog Visibility Rules

B2B accounts can have restricted or expanded catalog visibility:

- **Show/hide specific products** — e.g. distributor-only SKUs
- **Show/hide collections** — e.g. wholesale catalog separate from retail
- **Fitment filtering** — Show only parts compatible with the account's registered fleet
- **Price visibility** — Show prices only to logged-in B2B contacts (guest = no price)
- **Quantity restrictions** — Min/max order quantities per product per account

---

## 5. Fleet & Fitment Management

For industrial and automotive B2B accounts, the platform stores fleet profiles and uses them to surface relevant products.

### Fleet Profile

```json
{
  "fleet_size": 24,
  "vehicles": [
    { "year": 2019, "make": "Ford", "model": "F-350", "engine": "6.7L Power Stroke" },
    { "year": 2021, "make": "RAM", "model": "2500", "engine": "6.7L Cummins" }
  ]
}
```

### Fitment-Aware Catalog

Products can have fitment data:

```json
{
  "fitment": [{ "year_min": 2017, "year_max": 2024, "make": "Ford", "engine": "6.7L Power Stroke" }]
}
```

When a B2B customer with a fleet profile browses:

- Products are tagged/filtered by fitment match
- "Fits your fleet" badge shown on matching products
- Default sort: fitment-matched products first
- Incompatible products still browsable with "Not for your fleet" warning

---

## 6. Quote & RFQ Workflow

### Quote Lifecycle

```
Draft → Submitted → Under Review → Quoted → Accepted → Converted to Order
                                          → Declined
                                          → Expired (after N days)
```

### RFQ (Request for Quote) — Customer Initiated

1. Customer adds items to quote (separate from cart)
2. Specifies quantities, notes, delivery requirements
3. Submits RFQ to merchant
4. Merchant receives notification in dashboard
5. Merchant reviews, sets custom prices, adds notes
6. Merchant sends quote back to customer
7. Customer accepts → converts to order at quoted price
8. Customer declines → merchant notified

### Quote Fields

- Line items (product, variant, requested qty, merchant-set price)
- Requested delivery date
- Shipping address
- Customer notes
- Merchant response notes
- Expiry date (auto-calculated, configurable)
- Discount codes (can be applied to quotes)
- Attachments (spec sheets, POs)

### Quote PDF

Auto-generated PDF with:

- Merchant branding (logo, colors)
- Quote number, date, expiry
- Customer and merchant details
- Line items with pricing
- Terms and conditions
- Signature line (optional)

---

## 7. Net Terms & Credit Management

### Invoice Generation

When a B2B customer with net terms places an order:

- Order created with `financial_status: invoiced`
- PDF invoice generated automatically
- Invoice emailed to customer's billing contact
- Due date calculated from payment terms (Net 30 = today + 30 days)

### Invoice Fields

- Invoice number (sequential per tenant)
- Order reference
- Customer PO number (entered at checkout)
- Line items, subtotal, tax, total
- Payment terms and due date
- Payment instructions (bank transfer details, check payable to)
- Remittance instructions

### Credit Limit Enforcement

- Credit limit tracked per B2B account
- `credit_used` = sum of all outstanding invoices
- At order placement: `credit_used + order_total <= credit_limit` checked
- If exceeded: order placed as pending, merchant notified, customer shown message
- Merchant can override per order (with audit log)

### Overdue Management

- Day of due date: send invoice reminder
- 7 days overdue: second reminder + account flagged
- 14 days overdue: account automatically placed on credit hold
- 30 days overdue: account suspended (no new orders)
- All thresholds configurable per merchant

---

## 8. Purchase Approval Workflows

For enterprise B2B buyers with internal approval requirements:

### Workflow Configuration

Merchant can configure:

- Orders above $X require approval
- All orders require approval
- Specific account requires approval

### Approval Flow

1. Buyer places order → status: `pending_approval`
2. Account manager (approver role) notified
3. Approver reviews in dashboard: approve or reject with reason
4. On approval: order proceeds to normal flow, buyer notified
5. On rejection: buyer notified with reason, order cancelled

---

## 9. B2B Portal

B2B customers access a dedicated portal (separate from the retail storefront) that shows:

- Account dashboard (credit balance, recent orders, outstanding invoices)
- Order history with invoice downloads
- Quote history (submit new RFQs, view responses)
- Account contacts management (if account admin)
- Fitment-filtered catalog
- Reorder functionality (one-click reorder from previous orders)
- Saved carts (multiple saved carts, named)

### Access Control

- B2B portal requires login
- Contacts have roles: `account_admin` | `buyer` | `viewer`
- Account admin can invite contacts, manage roles
- Viewer: read-only (orders, invoices, products)
- Buyer: can place orders, submit RFQs
- Account admin: all above + manage contacts, approve purchases (if configured)

---

## 10. Service Scheduling Integration

For businesses like Gillett Diesel that offer repair/service in addition to parts:

- Service types configured by merchant (e.g. "Dyno Tune", "Injector Rebuild", "Turbo Service")
- Each service type has: duration, capacity per day, pricing, resource requirements
- Customers book appointments from portal or storefront
- Appointment linked to B2B account (for fleet management)
- Parts from order can be linked to service appointment
- Service history recorded per vehicle in fleet profile
- Appointment confirmation and reminder emails automated
