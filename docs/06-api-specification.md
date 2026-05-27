# WizeWorks Platform — API Specification

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Design Principles

- **REST for CRUD operations** — Standard HTTP verbs, resource-based URLs
- **GraphQL for complex queries** — Flexible data fetching for frontend consumers
- **Consistent response shape** — Every response follows the same envelope
- **Versioned from day one** — `/v1/` prefix, never breaking changes without a new version
- **Tenant-scoped by default** — Every endpoint operates within the authenticated tenant's context
- **Idempotent writes** — POST with `Idempotency-Key` header for safe retries

---

## 2. Base URL

```
Production:  https://api.wizeworks.com/v1
Staging:     https://api-staging.wizeworks.com/v1
GraphQL:     https://api.wizeworks.com/graphql
MCP Server:  https://mcp.wizeworks.com/sse
```

---

## 3. Authentication

### Merchant Dashboard (Browser)
- Short-lived JWT access token (15 min expiry)
- Refresh token (30 day expiry, HTTP-only cookie)
- Refresh endpoint: `POST /auth/refresh`

### API Keys (Programmatic / Headless)
- Long-lived API key, prefixed: `ww_live_` or `ww_test_`
- Passed as `Authorization: Bearer ww_live_xxxxx`
- Scoped at creation time (read:orders, write:inventory, etc.)
- Revocable from dashboard

### MCP Auth
- Scoped API key with MCP-specific permissions
- Passed in MCP server connection config

### Request Headers
```
Authorization: Bearer {token_or_api_key}
X-Tenant-ID: {tenant_uuid}          # Required for API keys
Content-Type: application/json
Idempotency-Key: {uuid}             # Optional, for POST/PATCH
```

---

## 4. Response Envelope

### Success
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 50,
    "total": 247,
    "total_pages": 5
  }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body is invalid",
    "details": [
      { "field": "price", "message": "Must be a positive number" }
    ],
    "request_id": "req_01j4xyz..."
  }
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | Valid token but insufficient scope |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 422 | Request body or params invalid |
| `CONFLICT` | 409 | Duplicate resource (e.g. slug taken) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 5. Pagination

All list endpoints support cursor-based pagination:

```
GET /v1/products?page=2&per_page=50&sort=created_at&order=desc
```

Parameters:
- `page` — Page number (default: 1)
- `per_page` — Items per page (default: 50, max: 250)
- `sort` — Field to sort by
- `order` — `asc` or `desc`

Cursor-based (for high-volume endpoints):
```
GET /v1/orders?after=cursor_01j4xyz&limit=100
```

---

## 6. Filtering

List endpoints accept query params for filtering:

```
GET /v1/orders?status=fulfilled&created_after=2026-01-01&customer_id=uuid
GET /v1/customers?type=b2b&tag=fleet&q=acme
GET /v1/products?status=active&vendor=bosch&inventory_lt=10
```

Common filter params:
- `q` — Full-text search
- `status` — Resource status
- `created_after` / `created_before` — Date range (ISO 8601)
- `updated_after` / `updated_before` — Date range
- `tag` — Tag filter (repeatable: `?tag=fleet&tag=priority`)

---

## 7. API Endpoints

### Auth
```
POST   /v1/auth/register          Create account + tenant
POST   /v1/auth/login             Get access + refresh token
POST   /v1/auth/refresh           Rotate access token
POST   /v1/auth/logout            Revoke refresh token
POST   /v1/auth/forgot-password   Send reset email
POST   /v1/auth/reset-password    Complete password reset
GET    /v1/auth/me                Current user + tenant info
```

### Tenants
```
GET    /v1/tenant                 Get current tenant
PATCH  /v1/tenant                 Update tenant settings
GET    /v1/tenant/usage           Current plan usage metrics
```

### Users (Staff)
```
GET    /v1/users                  List staff accounts
POST   /v1/users/invite           Invite new staff member
GET    /v1/users/:id              Get staff member
PATCH  /v1/users/:id              Update role
DELETE /v1/users/:id              Remove staff member
```

### Products
```
GET    /v1/products               List products
POST   /v1/products               Create product
GET    /v1/products/:id           Get product
PATCH  /v1/products/:id           Update product
DELETE /v1/products/:id           Archive product

GET    /v1/products/:id/variants  List variants
POST   /v1/products/:id/variants  Create variant
PATCH  /v1/products/:id/variants/:vid  Update variant
DELETE /v1/products/:id/variants/:vid  Delete variant

POST   /v1/products/:id/images    Upload product image
DELETE /v1/products/:id/images/:iid  Remove image

POST   /v1/products/bulk          Bulk create/update
GET    /v1/products/export        Export as CSV/JSON
```

### Collections
```
GET    /v1/collections            List collections
POST   /v1/collections            Create collection
GET    /v1/collections/:id        Get collection + products
PATCH  /v1/collections/:id        Update collection
DELETE /v1/collections/:id        Delete collection
POST   /v1/collections/:id/products  Add products
DELETE /v1/collections/:id/products/:pid  Remove product
```

### Customers
```
GET    /v1/customers              List customers
POST   /v1/customers              Create customer
GET    /v1/customers/:id          Get customer
PATCH  /v1/customers/:id          Update customer
DELETE /v1/customers/:id          Soft delete

GET    /v1/customers/:id/orders   Customer order history
GET    /v1/customers/:id/addresses  Customer addresses
POST   /v1/customers/:id/addresses  Add address
PATCH  /v1/customers/:id/addresses/:aid  Update address
DELETE /v1/customers/:id/addresses/:aid  Remove address

GET    /v1/customers/:id/activities  CRM activity feed
POST   /v1/customers/:id/activities  Add CRM note/activity

POST   /v1/customers/import       Import from CSV
GET    /v1/customers/segments     List saved segments
POST   /v1/customers/segments     Create segment
```

### B2B Accounts
```
GET    /v1/b2b/accounts           List B2B accounts
POST   /v1/b2b/accounts           Create account
GET    /v1/b2b/accounts/:id       Get account + credit status
PATCH  /v1/b2b/accounts/:id       Update account
DELETE /v1/b2b/accounts/:id       Deactivate account

GET    /v1/b2b/accounts/:id/customers   Members
POST   /v1/b2b/accounts/:id/customers   Add customer to account

GET    /v1/b2b/pricing-tiers      List pricing tiers
POST   /v1/b2b/pricing-tiers      Create pricing tier
PATCH  /v1/b2b/pricing-tiers/:id  Update tier

GET    /v1/b2b/quotes             List quotes/RFQs
POST   /v1/b2b/quotes             Create quote
GET    /v1/b2b/quotes/:id         Get quote
PATCH  /v1/b2b/quotes/:id         Update quote (approve/decline/counter)
POST   /v1/b2b/quotes/:id/convert Convert to order
```

### Orders
```
GET    /v1/orders                 List orders
POST   /v1/orders                 Create order (API/B2B)
GET    /v1/orders/:id             Get order
PATCH  /v1/orders/:id             Update order (status, notes)
DELETE /v1/orders/:id             Cancel order

POST   /v1/orders/:id/fulfillments  Create fulfillment
GET    /v1/orders/:id/fulfillments  List fulfillments
PATCH  /v1/orders/:id/fulfillments/:fid  Update fulfillment (tracking)

POST   /v1/orders/:id/refunds     Create refund
GET    /v1/orders/:id/refunds     List refunds

GET    /v1/orders/:id/invoice     Get B2B invoice PDF
POST   /v1/orders/:id/invoice/send  Email invoice to customer

POST   /v1/checkout/sessions      Create checkout session
POST   /v1/checkout/sessions/:id/complete  Complete checkout
GET    /v1/checkout/sessions/:id  Get session
```

### Cart
```
POST   /v1/carts                  Create cart
GET    /v1/carts/:id              Get cart
POST   /v1/carts/:id/items        Add item
PATCH  /v1/carts/:id/items/:iid   Update quantity
DELETE /v1/carts/:id/items/:iid   Remove item
DELETE /v1/carts/:id              Clear cart
POST   /v1/carts/:id/discounts    Apply discount code
DELETE /v1/carts/:id/discounts    Remove discount
```

### Inventory
```
GET    /v1/inventory              List inventory levels
PATCH  /v1/inventory/:variant_id  Update inventory count
POST   /v1/inventory/adjustments  Bulk inventory adjustment
GET    /v1/inventory/alerts       Low stock alerts
```

### CRM Pipeline
```
GET    /v1/crm/pipelines          List pipelines
POST   /v1/crm/pipelines          Create pipeline
GET    /v1/crm/pipelines/:id/deals  List deals
POST   /v1/crm/deals             Create deal
GET    /v1/crm/deals/:id         Get deal
PATCH  /v1/crm/deals/:id         Update deal (stage, value, close date)
DELETE /v1/crm/deals/:id         Delete deal
```

### Content (CMS)
```
GET    /v1/pages                  List pages
POST   /v1/pages                  Create page
GET    /v1/pages/:id              Get page
PATCH  /v1/pages/:id              Update page
DELETE /v1/pages/:id              Delete page

GET    /v1/blog/posts             List posts
POST   /v1/blog/posts             Create post
GET    /v1/blog/posts/:id         Get post
PATCH  /v1/blog/posts/:id         Update post
DELETE /v1/blog/posts/:id         Delete post

POST   /v1/media                  Upload media file
GET    /v1/media                  List media library
DELETE /v1/media/:id              Delete media file
```

### Email
```
GET    /v1/email/automations      List automations
POST   /v1/email/automations      Create automation
PATCH  /v1/email/automations/:id  Update automation
DELETE /v1/email/automations/:id  Delete automation
PATCH  /v1/email/automations/:id/toggle  Enable/disable

GET    /v1/email/templates        List templates
POST   /v1/email/templates        Create template
GET    /v1/email/templates/:id    Get template
PATCH  /v1/email/templates/:id    Update template
DELETE /v1/email/templates/:id    Delete template
POST   /v1/email/templates/:id/test  Send test email

POST   /v1/email/broadcasts       Create broadcast
GET    /v1/email/broadcasts       List broadcasts
GET    /v1/email/broadcasts/:id   Get broadcast + stats
DELETE /v1/email/broadcasts/:id   Cancel scheduled broadcast

GET    /v1/email/suppressions     List unsubscribes
POST   /v1/email/suppressions     Add suppression
DELETE /v1/email/suppressions/:email  Remove suppression
```

### Domains
```
GET    /v1/domains                List domains
POST   /v1/domains                Add custom domain
GET    /v1/domains/:id            Get domain + validation status
DELETE /v1/domains/:id            Remove custom domain
POST   /v1/domains/:id/verify     Manually trigger verification
GET    /v1/domains/:id/dns-records  Get required DNS records
GET    /v1/domains/:id/email-records  Get required email auth records
PATCH  /v1/domains/:id/primary    Set as primary domain
```

### Dropship
```
GET    /v1/dropship/suppliers     List connected suppliers
POST   /v1/dropship/suppliers     Connect supplier
GET    /v1/dropship/suppliers/:id  Get supplier + sync status
DELETE /v1/dropship/suppliers/:id  Disconnect supplier
POST   /v1/dropship/suppliers/:id/sync  Trigger catalog sync

GET    /v1/dropship/catalog       Search supplier catalog
POST   /v1/dropship/catalog/:id/import  Import product to store

GET    /v1/dropship/orders        List pending dropship orders
POST   /v1/dropship/orders/:id/submit  Submit to supplier
GET    /v1/dropship/orders/:id/tracking  Get tracking status
```

### Analytics
```
GET    /v1/analytics/revenue      Revenue summary (period, compare)
GET    /v1/analytics/orders       Order metrics
GET    /v1/analytics/customers    Customer metrics (new, returning, LTV)
GET    /v1/analytics/products     Product performance
GET    /v1/analytics/conversion   Funnel metrics (visits→cart→checkout→order)
GET    /v1/analytics/email        Email campaign performance
```

### Billing
```
GET    /v1/billing/subscription   Current subscription
POST   /v1/billing/subscription   Start/change subscription
DELETE /v1/billing/subscription   Cancel subscription
GET    /v1/billing/invoices       List invoices
GET    /v1/billing/usage          Current period usage
POST   /v1/billing/portal         Get Stripe Customer Portal URL
```

### Webhooks
```
GET    /v1/webhooks               List webhook endpoints
POST   /v1/webhooks               Register webhook
GET    /v1/webhooks/:id           Get webhook
PATCH  /v1/webhooks/:id           Update webhook
DELETE /v1/webhooks/:id           Delete webhook
GET    /v1/webhooks/:id/logs      Recent delivery logs
POST   /v1/webhooks/:id/test      Send test event
```

---

## 8. Webhook Events

Webhooks are signed with `X-WizeWorks-Signature: sha256={hmac}`.

| Event | Description |
|-------|-------------|
| `order.created` | New order placed |
| `order.updated` | Order status changed |
| `order.fulfilled` | Order shipped |
| `order.cancelled` | Order cancelled |
| `order.refunded` | Refund processed |
| `customer.created` | New customer |
| `customer.updated` | Customer data changed |
| `product.created` | Product created |
| `product.updated` | Product or inventory updated |
| `cart.abandoned` | Cart inactive for threshold period |
| `domain.verified` | Custom domain verified |
| `domain.ssl_provisioned` | SSL cert issued |
| `subscription.created` | Merchant subscribed |
| `subscription.upgraded` | Plan upgraded |
| `subscription.cancelled` | Subscription cancelled |
| `b2b.quote.created` | New RFQ submitted |
| `b2b.quote.accepted` | Quote accepted by customer |
| `dropship.order.shipped` | Supplier shipped dropship order |

---

## 9. Rate Limits

| Plan | Requests/minute | Burst |
|------|----------------|-------|
| Starter | 60 | 100 |
| Growth | 300 | 500 |
| Pro | 1,000 | 2,000 |
| Enterprise | Custom | Custom |

Rate limit headers returned on every response:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1716825600
```

---

## 10. GraphQL Schema Overview

```graphql
type Query {
  me: User!
  tenant: Tenant!
  product(id: ID!): Product
  products(filter: ProductFilter, pagination: Pagination): ProductConnection!
  order(id: ID!): Order
  orders(filter: OrderFilter, pagination: Pagination): OrderConnection!
  customer(id: ID!): Customer
  customers(filter: CustomerFilter, pagination: Pagination): CustomerConnection!
  analytics(period: Period!, compareWith: Period): Analytics!
}

type Mutation {
  createProduct(input: CreateProductInput!): Product!
  updateProduct(id: ID!, input: UpdateProductInput!): Product!
  createOrder(input: CreateOrderInput!): Order!
  updateOrderStatus(id: ID!, status: OrderStatus!): Order!
  createCustomer(input: CreateCustomerInput!): Customer!
  addCRMActivity(customerId: ID!, input: ActivityInput!): Activity!
}

type Subscription {
  orderCreated: Order!
  orderUpdated(id: ID): Order!
  inventoryUpdated(productId: ID): ProductVariant!
}
```

---

## 11. SDK

```bash
npm install @wizeworks/storefront-sdk    # Storefront / headless
npm install @wizeworks/admin-sdk        # Server-side admin operations
```

Both SDKs are generated from the OpenAPI spec and provide full TypeScript types.

OpenAPI spec available at: `https://api.wizeworks.com/v1/openapi.json`
