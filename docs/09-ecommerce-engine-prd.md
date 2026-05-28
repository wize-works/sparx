# WizeWorks Platform — E-Commerce Engine PRD

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

The e-commerce engine is the transactional core of WizeWorks. It handles everything from product catalog to checkout to fulfillment. It is designed to serve both direct-to-consumer (D2C) retail and B2B wholesale from the same codebase, with B2B-specific behavior toggled per merchant and per customer account.

---

## 2. Product Catalog

### Product Model

Every product has:

- **Title, slug, description** (rich text)
- **Status:** draft | active | archived
- **Type & vendor** (for filtering and organization)
- **Tags** (freeform, multi-value)
- **SEO fields:** title, description, OG image
- **One or more variants**

### Variants

Every purchasable item is a variant. A product with no options (e.g. a single-size item) still has one variant. Variant fields:

- SKU (optional but recommended)
- Price, compare-at price, cost (for margin tracking)
- Weight (for shipping calculation)
- Inventory quantity + policy (deny/continue when out of stock)
- Option values (e.g. `{ color: "red", size: "XL" }`)
- Dropship source link (optional)

### Options System

Products define option names (e.g. `["Color", "Size"]`). Variants define option values for each dimension. The UI generates a variant matrix from option combinations.

### Images

- Multiple images per product, ordered
- Primary image used for thumbnails
- Stored in GCS, served via Cloudflare CDN
- Automatic WebP conversion + responsive srcset generation
- Max 20 images per product, max 10MB per image

### Inventory

- Per-variant inventory count
- Inventory policy: `deny` (can't buy when 0) or `continue` (allow backorders)
- Low inventory threshold configurable per product
- Inventory alerts published to `inventory.low` Pub/Sub topic
- Bulk inventory adjustment via CSV or API

### Collections

- Manual collections (merchant curates product list)
- Automated collections (rules-based: all products tagged "diesel", all products from vendor "Bosch", all products under $50)
- Collections nested (parent/child) for navigation hierarchy
- SEO fields per collection

---

## 3. Cart

### Cart Lifecycle

```
Created → Items Added → Discounts Applied → Checkout Started → Completed / Abandoned
```

### Cart Features

- Persistent carts (stored in DB, cookie-linked for guests)
- Guest carts merged with customer cart on login
- Abandoned cart threshold configurable (default: 2 hours of inactivity)
- Cart abandonment triggers `cart.abandoned` Pub/Sub event → email automation

### Cart Validation

On every cart modification and at checkout start:

- Inventory availability re-checked
- Prices re-fetched (no stale prices)
- B2B pricing applied if customer is B2B account member
- Discounts re-validated (expiry, usage limits)

---

## 4. Checkout

### Standard Checkout Flow

```
Cart Review → Customer Info → Shipping → Payment → Confirmation
```

### Guest vs. Authenticated

- Guests provide email at checkout (account created or matched)
- Authenticated customers: address pre-populated, payment methods saved

### Address Handling

- Address validation via Google Maps / Smarty Streets API
- International addresses supported
- B2B accounts have default shipping addresses per account

### Shipping

- Flat rate rules (per order, per item, by weight, by price threshold)
- Free shipping threshold
- Carrier-calculated rates (FedEx, UPS, USPS) via EasyPost integration
- Local pickup option
- Dropship products: shipping calculated separately per supplier

### Tax

- Automatic tax calculation via TaxJar or Avalara
- Tax exempt status per customer (B2B accounts)
- Nexus configuration per merchant
- Tax included in price toggle (for international merchants)

### Payment Processing

- **Stripe** as primary processor
- Supported methods: card, Apple Pay, Google Pay, Link (Stripe's one-click checkout)
- 3D Secure handled automatically
- Payment intent created at checkout start, confirmed on submit
- Strong Customer Authentication (SCA) compliant
- Test mode for staging environment

### B2B Checkout Variations

- Net terms option (if customer's B2B account has terms set)
- Purchase order number field
- Approval workflow (order placed as "pending approval" if above threshold)
- Invoice generation instead of immediate payment

### Order Confirmation

- Confirmation page shown immediately
- Order confirmation email fired via email worker
- Order created event published to Pub/Sub
- Inventory decremented atomically

---

## 5. Orders

### Order States

```
pending → confirmed → processing → fulfilled → delivered
                   ↘ cancelled
                   ↘ refunded (partial or full)
```

### Financial States

```
pending → paid → partially_refunded → refunded
       → invoiced → overdue (B2B)
```

### Fulfillment

- Orders can have multiple fulfillments (partial shipment)
- Each fulfillment has: items, carrier, tracking number, tracking URL
- Tracking number entry triggers `order.fulfilled` event → shipping email
- Dropship fulfillments created automatically when supplier ships

### Refunds

- Full or partial refunds
- Refund back to original payment method via Stripe
- Inventory restocked on refund (configurable)
- Refund reason recorded for reporting

### Order Notes & Tags

- Internal notes (staff only)
- Customer-visible notes
- Tags for filtering and automation triggers

### Order Timeline

Every order has a chronological timeline:

- Order placed
- Payment received
- Note added
- Fulfillment created
- Tracking updated
- Refund issued
- Status changes

---

## 6. Discounts & Promotions

### Discount Types

- **Percentage off** — 10% off entire order or specific products/collections
- **Fixed amount** — $15 off orders over $100
- **Free shipping** — Waive shipping cost
- **Buy X get Y** — Buy 3 get 1 free

### Application Methods

- **Discount code** — Customer enters code at checkout
- **Automatic discount** — Applied based on rules (no code needed)

### Rules & Limits

- Minimum order value
- Minimum quantity
- Specific products or collections only
- Customer-specific (one-time use per customer)
- Start/end date
- Total usage limit
- One per customer limit

### B2B Pricing (Not Discounts)

B2B account-specific pricing is handled separately via pricing tiers, not as discounts. See B2B & Wholesale PRD.

---

## 7. Storefront

### Pages

- **Home** — Configurable sections (hero, featured products, collections, etc.)
- **Product** — Gallery, title, description, variants, add-to-cart, related products
- **Collection** — Product grid with filtering and sorting
- **Cart** — Item list, totals, discount code, checkout CTA
- **Checkout** — Multi-step form
- **Account** — Order history, address book, profile
- **CMS Pages** — Blog posts, landing pages, legal pages

### Search

- Full-text product search powered by Elasticsearch
- Autocomplete suggestions
- Filters: price range, vendor, tag, availability
- Sort: relevance, price, date, title, best selling

### Performance Targets

- Storefront page load (p95): < 200ms TTFB via SSR + CDN caching
- Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1
- Product images lazy-loaded, WebP served, responsive srcset

---

## 8. Analytics & Reporting

### Built-In Reports

- Revenue by period (day/week/month/year)
- Orders by status
- Top products by revenue and units
- Top customers by spend
- Conversion funnel (sessions → add-to-cart → checkout → purchase)
- Abandoned cart recovery rate
- Average order value trend
- Inventory valuation

### Data Export

- All reports exportable as CSV
- Order export with all fields
- Customer export with GDPR-compliant field selection
