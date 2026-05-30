# Sparx Platform — TikTok Shop Integration Spec

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Overview

TikTok Shop is a mandatory channel integration for a modern commerce platform. The platform generated over $33 billion in gross merchandise value in 2024 with over 1.6 billion active users — users who discover, evaluate, and purchase products entirely within the app, often in a single session.

Sparx integrates with TikTok Shop via the TikTok Shop Open Platform API as an ISV (Independent Software Vendor) partner. Merchants connect their TikTok Shop account via OAuth from the Sparx dashboard. Product catalogs sync bidirectionally, TikTok Shop orders appear in Sparx order management, inventory stays in sync in real time, and revenue data flows into Sparx analytics alongside storefront and B2B channels.

This is a Channel integration — part of the Commerce module, no additional module fee. Merchants who sell on TikTok Shop have higher GMV and stronger platform retention.

---

## 2. Implementation Timeline

| Task | Start | Due | Priority |
|------|-------|-----|----------|
| Apply for ISV partner access | May 28 | May 31 | High |
| OAuth connect flow | Jun 16 | Jun 20 | High |
| Product catalog sync | Jun 20 | Jun 27 | High |
| Order sync + fulfillment | Jun 27 | Jul 4 | High |
| Real-time inventory sync | Jul 4 | Jul 11 | High |
| Analytics consolidation | Jul 11 | Jul 18 | Medium |
| Channels UI in dashboard | Jul 11 | Jul 18 | Medium |

**Note:** Apply for ISV partner access immediately — approval takes time and the clock starts when you apply.

---

## 3. Partner Registration

**ISV Partner Application:** https://partner.tiktokshop.com

What to prepare:
- Sparx platform description and merchant value proposition
- Tech stack overview (Next.js, Fastify, TypeScript)
- Estimated merchant volume (honest — early stage)
- Use case: commerce platform enabling merchants to sell on TikTok Shop

TikTok reviews ISV applications and provides API credentials, higher rate limits, and access to advanced endpoints not available to individual sellers.

---

## 4. Authentication

TikTok Shop uses OAuth 2.0. Merchants authorize the Sparx app in TikTok, and Sparx stores the access/refresh tokens per tenant.

```typescript
// src/services/channels/tiktok/auth.ts

const TIKTOK_AUTH_URL = 'https://auth.tiktok-shops.com/oauth/authorize'
const TIKTOK_TOKEN_URL = 'https://auth.tiktok-shops.com/oauth/token'

export function generateAuthURL(tenantId: string): string {
  const state = encryptState({ tenantId })
  return `${TIKTOK_AUTH_URL}?` + new URLSearchParams({
    app_key: process.env.TIKTOK_APP_KEY!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/tiktok/callback`,
    state,
    scope: [
      'product:read', 'product:write',
      'order:read', 'order:write',
      'inventory:read', 'inventory:write',
      'finance:read',
    ].join(','),
  })
}

export async function exchangeCodeForToken(code: string): Promise<TikTokTokens> {
  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      app_key: process.env.TIKTOK_APP_KEY!,
      app_secret: process.env.TIKTOK_APP_SECRET!,
      code,
      grant_type: 'authorization_code',
    }),
  })
  return response.json()
}
```

Tokens stored in Google Secret Manager:
- `tiktok/{tenantId}/access_token`
- `tiktok/{tenantId}/refresh_token`
- `tiktok/{tenantId}/shop_id`

Automatic refresh before expiry via the tiktok channel worker.

---

## 5. Product Catalog Sync

### Sparx → TikTok Shop (push)

Triggered by Pub/Sub events:

```typescript
// Subscribe to product events
pubsub.subscribe('product.created', pushProductToTikTok)
pubsub.subscribe('product.updated', pushProductToTikTok)
pubsub.subscribe('product.archived', deactivateTikTokListing)

async function pushProductToTikTok(event: ProductEvent) {
  const { tenantId, productId } = event

  // Check if tenant has TikTok Shop connected and product opted in
  const [connection, product] = await Promise.all([
    getTikTokConnection(tenantId),
    db.product.findUnique({
      where: { id: productId },
      include: { variants: true, images: true }
    })
  ])

  if (!connection || !product?.tiktokEnabled) return

  await tiktokAPI.upsertProduct(connection, {
    product_name: product.title,
    description: product.description,
    skus: product.variants.map(v => ({
      seller_sku: v.sku,
      sale_price: v.price,
      stock_infos: [{ available_stock: v.inventoryQuantity }],
    })),
    main_image: product.images[0]?.url,
  })
}
```

### TikTok Shop → Sparx (pull / import)

Merchant initiates from dashboard:
1. Dashboard fetches existing TikTok Shop listings
2. Merchant selects listings to import
3. Sparx creates products, matched by SKU where possible
4. Products linked: `product.tiktokProductId` stored for future sync

### Field Mapping

| Sparx | TikTok Shop |
|-------|------------|
| `title` | `product_name` |
| `description` | `description` |
| `variants[].price` | `skus[].sale_price` |
| `variants[].inventory_quantity` | `skus[].stock_infos[].available_stock` |
| `variants[].sku` | `skus[].seller_sku` |
| `images[0].url` | `main_image` |
| `status = 'active'` | `product_status = 'ACTIVATE'` |
| `status = 'archived'` | `product_status = 'DEACTIVATE'` |

---

## 6. Order Sync

### TikTok Shop → Sparx (ingest)

TikTok pushes order webhooks to:
`POST /api/channels/tiktok/webhooks/orders`

```typescript
// src/routes/channels/tiktok/webhooks.ts
fastify.post('/api/channels/tiktok/webhooks/orders', async (req) => {
  // Verify webhook signature
  verifyTikTokSignature(req)

  const { order_id, order_status, buyer_info, order_line_items } = req.body

  // Find tenant from TikTok shop ID
  const tenantId = await getTenantByTikTokShopId(req.body.shop_id)

  // Create or update order in Sparx
  await orderService.upsertFromChannel({
    tenantId,
    source: 'tiktok_shop',
    externalId: order_id,
    externalStatus: order_status,
    customer: {
      email: buyer_info.email,
      name: buyer_info.display_name,
    },
    items: order_line_items.map(item => ({
      sku: item.seller_sku,
      quantity: item.quantity,
      price: item.sale_price,
    })),
  })

  // Decrement inventory (same pool as storefront)
  await inventoryService.decrementForOrder(tenantId, order_line_items)
})
```

### Sparx → TikTok Shop (fulfillment push)

When merchant marks order as fulfilled in Sparx:

```typescript
pubsub.subscribe('order.fulfilled', async (event) => {
  const order = await db.order.findUnique({ where: { id: event.orderId } })

  if (order.source !== 'tiktok_shop') return

  const connection = await getTikTokConnection(order.tenantId)

  await tiktokAPI.updateOrderShipment(connection, {
    order_id: order.externalId,
    tracking_number: event.trackingNumber,
    shipping_provider: event.carrier,
  })
})
```

---

## 7. Real-Time Inventory Sync

Sparx DB is the single source of truth for inventory across all channels.

```typescript
// Subscribe to inventory changes
pubsub.subscribe('inventory.updated', async (event) => {
  const { tenantId, variantId, newQuantity } = event

  const connection = await getTikTokConnection(tenantId)
  if (!connection) return

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { tiktokSkuId: true }
  })

  if (!variant?.tiktokSkuId) return

  // Push new quantity to TikTok Shop
  await tiktokAPI.updateInventory(connection, {
    sku_id: variant.tiktokSkuId,
    available_stock: newQuantity,
  })
})
```

**Critical invariant:** inventory is decremented in Sparx first, then pushed to TikTok. This prevents overselling even if the TikTok push fails (dead letter queue retries the push, never re-increments Sparx inventory on failure).

---

## 8. Analytics Consolidation

TikTok Shop revenue surfaces in the Sparx analytics dashboard as a channel alongside storefront and B2B.

```typescript
// GET /v1/analytics/revenue?breakdown=channel
{
  "period": "this_month",
  "channels": {
    "storefront": { "revenue": 48200, "orders": 156 },
    "tiktok_shop": { "revenue": 12800, "orders": 89 },
    "b2b": { "revenue": 31400, "orders": 24 }
  },
  "total": { "revenue": 92400, "orders": 269 }
}
```

### GMV Max Advertising (July 2026 Requirement)

Starting July 2026, TikTok requires sellers to allocate 1.5–5% of TikTok Shop sales revenue to GMV Max advertising campaigns. Sparx surfaces this in analytics:

- "TikTok Ad Budget" line in analytics showing required allocation
- Link to TikTok Marketing API for campaign management
- Future: automated GMV Max campaign creation via TikTok Marketing API

### MCP Tools

```
get_channel_revenue({ channel: 'tiktok_shop', period: 'this_month' })
get_tiktok_top_products({ period: 'this_month', limit: 10 })
get_channel_comparison({ period: 'this_month' })
```

Example AI interaction:
> "How does my TikTok Shop revenue compare to my storefront this month?"
> → get_channel_comparison({ period: 'this_month' })
> → "TikTok Shop: $12,800 (89 orders). Storefront: $48,200 (156 orders). TikTok is 13.8% of total revenue."

---

## 9. Dashboard UI

### Settings → Channels → TikTok Shop

```
TikTok Shop                                    [Connected ✓]
─────────────────────────────────────────────
Shop: @acme_parts_official
Last synced: 2 minutes ago
Products synced: 47 of 52 (5 errors)          [View errors]

This month:
GMV: $12,800    Orders: 89    AOV: $143.82

[Sync products now]                    [Disconnect]
```

### Product List

Each product card shows TikTok Shop status:
- `● Live on TikTok` — active listing
- `○ Not on TikTok` — toggle to enable
- `⚠ Sync error` — click for details

Bulk action: select products → "Push to TikTok Shop"

### Order List

Orders from TikTok Shop show a TikTok badge and the `tiktok_shop` source label. Filterable by channel.

---

## 10. Channel Adapter Architecture

TikTok Shop is implemented as a channel adapter — the same pattern used for future channels (Amazon, Instagram Shopping, etc.).

```typescript
// packages/channels/src/types.ts
interface ChannelAdapter {
  id: string                        // 'tiktok_shop'
  name: string                      // 'TikTok Shop'
  connect(tenantId: string): string // returns OAuth URL
  syncProduct(tenantId: string, product: Product): Promise<void>
  ingestOrder(payload: unknown): Promise<Order>
  pushFulfillment(order: Order): Promise<void>
  syncInventory(tenantId: string, variantId: string, qty: number): Promise<void>
  getAnalytics(tenantId: string, period: Period): Promise<ChannelAnalytics>
}
```

New channels (Amazon, Instagram Shopping) implement this interface and register with the channel registry. No changes required to core commerce logic.

---

## 11. Environment Variables

```bash
TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=
TIKTOK_WEBHOOK_SECRET=    # for signature verification
TIKTOK_API_BASE=https://open-api.tiktokglobalshop.com
```

---

## 12. Rate Limits

TikTok Shop Open Platform (ISV tier):
- Product API: 100 requests/minute per shop
- Order API: 100 requests/minute per shop
- Inventory API: 50 requests/minute per shop

All TikTok API calls go through a rate-limit-aware client with automatic backoff and retry.

---

## 13. Implementation Checklist

- [ ] Apply for ISV partner access at partner.tiktokshop.com (do immediately)
- [ ] Create TikTok developer app, obtain App Key + App Secret
- [ ] Store credentials in Secret Manager
- [ ] Implement OAuth connect flow (callback route + token storage)
- [ ] Implement token refresh worker
- [ ] Add `tiktokEnabled` boolean and `tiktokProductId` to product schema
- [ ] Add `tiktokSkuId` to product_variants schema
- [ ] Add `source` field to orders schema ('storefront' | 'tiktok_shop' | 'b2b' | etc.)
- [ ] Add `externalId` and `externalStatus` to orders schema
- [ ] Add TikTok connection table (tenantId, shopId, accessToken, refreshToken, expiresAt)
- [ ] Implement pushProductToTikTok (Pub/Sub consumer)
- [ ] Implement product import from TikTok Shop
- [ ] Implement order webhook ingestion endpoint
- [ ] Implement fulfillment push (Pub/Sub consumer)
- [ ] Implement inventory sync (Pub/Sub consumer)
- [ ] Implement analytics fetch from TikTok Finance API
- [ ] Add channel revenue breakdown to analytics API
- [ ] Add MCP tools: get_channel_revenue, get_tiktok_top_products
- [ ] Build Channels UI: connection flow, sync status, quick stats
- [ ] Add TikTok status badges to product list
- [ ] Add channel filter to order list
- [ ] Add TikTok source badge to order cards
- [ ] Add GMV Max budget tracker to analytics
- [ ] Webhook signature verification
- [ ] Rate limit handling with retry/backoff
- [ ] E2E test: connect → sync product → place test order → fulfill → verify tracking pushed
