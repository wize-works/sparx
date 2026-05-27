# Sparx Platform — Typesense Search Specification

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Why Typesense

Typesense is a single-binary, open-source search engine written in C++. It runs as a GKE pod with a persistent volume. No JVM, no cluster management, no index shards. Operationally equivalent to the Redis pod — just a container.

It replaces PostgreSQL tsvector as the search layer from day one because:
- Typo tolerance — "boach injector" finds "Bosch injector"
- Faceted filtering — filter by brand, price range, fitment, stock status simultaneously
- Sub-50ms queries at 100K+ products
- Relevance tuning per field
- Synonyms — "turbo" / "turbocharger" / "turbine" all match
- Geosearch — useful for service scheduling and dealer proximity

For Gillett Diesel's catalog (part numbers, engine fitments, brands, price ranges), faceted search is not optional. tsvector handles full-text but can't do multi-dimensional faceting cleanly.

---

## 2. Kubernetes Deployment

```yaml
# k8s/sparx-prod/typesense.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: typesense-data
  namespace: sparx-prod
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard-rwo
  resources:
    requests:
      storage: 5Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: typesense
  namespace: sparx-prod
  labels:
    app: typesense
spec:
  replicas: 1
  selector:
    matchLabels:
      app: typesense
  template:
    metadata:
      labels:
        app: typesense
    spec:
      containers:
      - name: typesense
        image: typesense/typesense:0.25.2
        args:
          - --data-dir=/data
          - --api-key=$(TYPESENSE_API_KEY)
          - --listen-port=8108
          - --enable-cors
        env:
        - name: TYPESENSE_API_KEY
          valueFrom:
            secretKeyRef:
              name: sparx-secrets
              key: TYPESENSE_API_KEY
        ports:
        - containerPort: 8108
        volumeMounts:
        - name: data
          mountPath: /data
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        readinessProbe:
          httpGet:
            path: /health
            port: 8108
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health
            port: 8108
          initialDelaySeconds: 30
          periodSeconds: 10
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: typesense-data
---
apiVersion: v1
kind: Service
metadata:
  name: typesense
  namespace: sparx-prod
spec:
  selector:
    app: typesense
  ports:
  - port: 8108
    targetPort: 8108
  type: ClusterIP
```

Internal URL: `http://typesense.sparx-prod.svc.cluster.local:8108`

Cost: 5GB persistent disk at $0.04/GB/mo = **$0.20/mo**

---

## 3. Collection Schemas

### Products Collection

```typescript
// src/search/schemas/products.ts
import Typesense from 'typesense'

export const PRODUCTS_SCHEMA = {
  name: 'products',
  fields: [
    // Core fields
    { name: 'id',              type: 'string' },
    { name: 'tenant_id',       type: 'string', facet: true },
    { name: 'title',           type: 'string', weight: 4 },
    { name: 'description',     type: 'string', weight: 2 },
    { name: 'sku',             type: 'string[]', facet: false },
    { name: 'tags',            type: 'string[]', facet: true },
    { name: 'vendor',          type: 'string', facet: true },
    { name: 'product_type',    type: 'string', facet: true },
    { name: 'status',          type: 'string', facet: true },
    
    // Pricing
    { name: 'price_min',       type: 'float', facet: true },
    { name: 'price_max',       type: 'float', facet: true },
    
    // Inventory
    { name: 'in_stock',        type: 'bool', facet: true },
    { name: 'total_inventory', type: 'int32' },
    
    // Fitment (Gillett Diesel specific — engine/vehicle compatibility)
    { name: 'fitment_makes',   type: 'string[]', facet: true },
    { name: 'fitment_models',  type: 'string[]', facet: true },
    { name: 'fitment_years',   type: 'int32[]', facet: true },
    { name: 'fitment_engines', type: 'string[]', facet: true },
    
    // SEO / metadata
    { name: 'slug',            type: 'string' },
    { name: 'image_url',       type: 'string', optional: true },
    { name: 'created_at',      type: 'int64' },
    { name: 'updated_at',      type: 'int64' },
  ],
  default_sorting_field: 'created_at',
  // Synonyms applied per-tenant at query time
}
```

### Customers Collection

```typescript
export const CUSTOMERS_SCHEMA = {
  name: 'customers',
  fields: [
    { name: 'id',              type: 'string' },
    { name: 'tenant_id',       type: 'string', facet: true },
    { name: 'full_name',       type: 'string', weight: 4 },
    { name: 'email',           type: 'string', weight: 3 },
    { name: 'phone',           type: 'string', optional: true },
    { name: 'company',         type: 'string', weight: 3, optional: true },
    { name: 'type',            type: 'string', facet: true },  // retail | b2b | wholesale
    { name: 'tags',            type: 'string[]', facet: true },
    { name: 'total_spent',     type: 'float', facet: true },
    { name: 'order_count',     type: 'int32' },
    { name: 'b2b_account_id',  type: 'string', optional: true, facet: true },
    { name: 'created_at',      type: 'int64' },
    { name: 'last_order_at',   type: 'int64', optional: true },
  ],
  default_sorting_field: 'total_spent',
}
```

### Orders Collection

```typescript
export const ORDERS_SCHEMA = {
  name: 'orders',
  fields: [
    { name: 'id',              type: 'string' },
    { name: 'tenant_id',       type: 'string', facet: true },
    { name: 'order_number',    type: 'string', weight: 5 },
    { name: 'customer_name',   type: 'string', weight: 3 },
    { name: 'customer_email',  type: 'string', weight: 3 },
    { name: 'status',          type: 'string', facet: true },
    { name: 'financial_status',type: 'string', facet: true },
    { name: 'total',           type: 'float' },
    { name: 'item_titles',     type: 'string[]', weight: 2 },
    { name: 'created_at',      type: 'int64' },
  ],
  default_sorting_field: 'created_at',
}
```

---

## 4. Search Service

```typescript
// src/search/typesense.client.ts
import Typesense from 'typesense'

export const typesense = new Typesense.Client({
  nodes: [{
    host: 'typesense.sparx-prod.svc.cluster.local',
    port: 8108,
    protocol: 'http'
  }],
  apiKey: process.env.TYPESENSE_API_KEY!,
  connectionTimeoutSeconds: 2,
  retryIntervalSeconds: 0.1,
  numRetries: 3,
})
```

```typescript
// src/search/product.search.ts
import { typesense } from './typesense.client'

interface ProductSearchParams {
  tenantId: string
  query: string
  page?: number
  perPage?: number
  filters?: {
    vendor?: string[]
    productType?: string[]
    inStock?: boolean
    priceMin?: number
    priceMax?: number
    tags?: string[]
    fitmentMake?: string
    fitmentModel?: string
    fitmentYear?: number
    fitmentEngine?: string
  }
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest'
  facets?: string[]
}

export async function searchProducts(params: ProductSearchParams) {
  const {
    tenantId, query, page = 1, perPage = 24,
    filters = {}, sort = 'relevance', facets = []
  } = params

  // Always filter by tenant — security requirement
  const filterParts = [`tenant_id:=${tenantId}`, `status:=active`]

  if (filters.vendor?.length)       filterParts.push(`vendor:[${filters.vendor.join(',')}]`)
  if (filters.productType?.length)  filterParts.push(`product_type:[${filters.productType.join(',')}]`)
  if (filters.inStock !== undefined) filterParts.push(`in_stock:=${filters.inStock}`)
  if (filters.priceMin !== undefined) filterParts.push(`price_min:>=${filters.priceMin}`)
  if (filters.priceMax !== undefined) filterParts.push(`price_max:<=${filters.priceMax}`)
  if (filters.tags?.length)         filterParts.push(`tags:[${filters.tags.join(',')}]`)

  // Fitment filtering (Gillett Diesel — engine compatibility)
  if (filters.fitmentMake)    filterParts.push(`fitment_makes:=${filters.fitmentMake}`)
  if (filters.fitmentModel)   filterParts.push(`fitment_models:=${filters.fitmentModel}`)
  if (filters.fitmentYear)    filterParts.push(`fitment_years:=${filters.fitmentYear}`)
  if (filters.fitmentEngine)  filterParts.push(`fitment_engines:=${filters.fitmentEngine}`)

  const sortBy = {
    relevance:  '_text_match:desc,created_at:desc',
    price_asc:  'price_min:asc',
    price_desc: 'price_max:desc',
    newest:     'created_at:desc',
  }[sort]

  const result = await typesense.collections('products').documents().search({
    q: query || '*',
    query_by: 'title,sku,description,tags,vendor',
    query_by_weights: '4,3,2,1,2',
    filter_by: filterParts.join(' && '),
    sort_by: sortBy,
    page,
    per_page: perPage,
    facet_by: facets.join(','),
    max_facet_values: 50,
    highlight_full_fields: 'title',
    typo_tokens_threshold: 1,
    num_typos: 2,
  })

  return {
    hits: result.hits?.map(h => ({
      ...h.document,
      highlight: h.highlight,
    })) ?? [],
    total: result.found,
    page: result.page,
    facets: result.facet_counts,
    searchTimeMs: result.search_time_ms,
  }
}
```

---

## 5. Sync Worker

The sync worker keeps Typesense in sync with PostgreSQL. It runs two modes:

### Mode 1: Real-time sync (Pub/Sub consumer)
Subscribes to `product.created`, `product.updated`, `product.deleted` events.
Upserts or deletes the Typesense document within seconds of the DB change.

```typescript
// src/workers/search-sync.worker.ts
import { pubsub } from '../pubsub'
import { db } from '../db'
import { typesense } from '../search/typesense.client'

pubsub.subscribe('product.updated', async (message) => {
  const { productId, tenantId } = message

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: true }
  })

  if (!product || product.deletedAt) {
    // Soft deleted or not found — remove from index
    await typesense.collections('products')
      .documents(productId)
      .delete()
    return
  }

  await typesense.collections('products')
    .documents()
    .upsert(toTypesenseProduct(product))
})

function toTypesenseProduct(product: ProductWithVariants): TypesenseProduct {
  const prices = product.variants.map(v => parseFloat(v.price.toString()))
  const skus = product.variants.map(v => v.sku).filter(Boolean) as string[]
  const inStock = product.variants.some(
    v => v.inventoryPolicy === 'continue' || v.inventoryQuantity > 0
  )

  return {
    id: product.id,
    tenant_id: product.tenantId,
    title: product.title,
    description: product.description ?? '',
    sku: skus,
    tags: product.tags,
    vendor: product.vendor ?? '',
    product_type: product.productType ?? '',
    status: product.status,
    price_min: Math.min(...prices),
    price_max: Math.max(...prices),
    in_stock: inStock,
    total_inventory: product.variants.reduce(
      (sum, v) => sum + (v.inventoryQuantity ?? 0), 0
    ),
    // Fitment data from product metadata
    fitment_makes:   product.metadata?.fitment?.makes ?? [],
    fitment_models:  product.metadata?.fitment?.models ?? [],
    fitment_years:   product.metadata?.fitment?.years ?? [],
    fitment_engines: product.metadata?.fitment?.engines ?? [],
    slug: product.slug,
    image_url: product.images?.[0]?.url,
    created_at: Math.floor(product.createdAt.getTime() / 1000),
    updated_at: Math.floor(product.updatedAt.getTime() / 1000),
  }
}
```

### Mode 2: Full reindex (on-demand or scheduled)
Used for initial population and recovery from sync drift.

```typescript
// src/search/reindex.ts
export async function reindexTenant(tenantId: string) {
  // Fetch all products for this tenant in batches
  let cursor: string | undefined
  let indexed = 0

  while (true) {
    const products = await db.product.findMany({
      where: { tenantId, deletedAt: null },
      include: { variants: true },
      take: 250,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    })

    if (products.length === 0) break

    // Typesense bulk import (much faster than individual upserts)
    await typesense.collections('products')
      .documents()
      .import(products.map(toTypesenseProduct), { action: 'upsert' })

    indexed += products.length
    cursor = products[products.length - 1].id
    console.log(`Reindexed ${indexed} products for tenant ${tenantId}`)

    if (products.length < 250) break
  }

  return indexed
}

// Full platform reindex (run once at launch, then rely on real-time sync)
export async function reindexAll() {
  const tenants = await db.tenant.findMany({ where: { status: 'active' } })
  for (const tenant of tenants) {
    await reindexTenant(tenant.id)
  }
}
```

---

## 6. Synonyms Configuration

Synonyms are configured per-tenant, allowing merchants to define their own:

```typescript
// Built-in synonyms applied to all tenants
const GLOBAL_SYNONYMS = [
  { id: 'turbo', synonyms: ['turbocharger', 'turbo', 'turbine', 'tc'] },
  { id: 'injector', synonyms: ['injector', 'fuel injector', 'nozzle'] },
  { id: 'filter', synonyms: ['filter', 'filtration', 'strainer'] },
  { id: 'pump', synonyms: ['pump', 'pumping unit'] },
]

// Applied per-collection at startup
async function applySynonyms() {
  for (const synonym of GLOBAL_SYNONYMS) {
    await typesense.collections('products')
      .synonyms()
      .upsert(synonym.id, { synonyms: synonym.synonyms })
  }
}
```

Merchants can add custom synonyms from their dashboard (Settings → Search → Synonyms).

---

## 7. API Endpoints

```
GET /v1/search/products?q=bosch+injector&vendor=Bosch&in_stock=true&price_max=500
GET /v1/search/customers?q=acme+fleet
GET /v1/search/orders?q=WW-1234

POST /v1/search/reindex           (staff only — trigger full reindex)
GET  /v1/search/status            (index stats per collection)

// Storefront-facing (no auth, tenant from domain)
GET /storefront/search?q=injector&facets=vendor,product_type,price_range
```

---

## 8. Dashboard Search Experience

The Typesense integration enables instant search across the entire dashboard:

```
⌘K / Ctrl+K  →  Global command palette
  Type: "1234"      → finds order WW-1234
  Type: "acme"      → finds customer Acme Fleet Services
  Type: "bosch"     → finds Bosch products
  Type: "john"      → finds customer John Smith + any orders mentioning John
```

This is a single Typesense multi-search call across all three collections, filtered to the current tenant, returning the top 3 results per collection.

```typescript
const results = await typesense.multiSearch.perform({
  searches: [
    { collection: 'products',  q: query, query_by: 'title,sku', per_page: 3 },
    { collection: 'customers', q: query, query_by: 'full_name,email,company', per_page: 3 },
    { collection: 'orders',    q: query, query_by: 'order_number,customer_name', per_page: 3 },
  ]
}, {
  filter_by: `tenant_id:=${tenantId}`
})
```

---

## 9. Scaling Path

Typesense handles millions of documents on a single node. The GKE pod is sufficient until:

- Single tenant exceeds ~5M products (very unlikely in e-commerce)
- Search latency p95 exceeds 100ms under load
- Multiple tenants doing heavy concurrent search

At that point: Typesense Cloud ($99/mo for managed) or Typesense cluster mode (3 nodes for HA). Either is years away.

---

## 10. Initialization Checklist

On first cluster deployment:

```bash
# 1. Apply Kubernetes manifests
kubectl apply -f k8s/sparx-prod/typesense.yaml

# 2. Wait for pod ready
kubectl -n sparx-prod wait --for=condition=ready pod -l app=typesense

# 3. Create collections (run once via init script)
pnpm run search:init

# 4. Full reindex (run after first DB migration and seed)
pnpm run search:reindex

# 5. Verify
curl http://typesense.sparx-prod.svc.cluster.local:8108/health \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY"
# → {"ok":true}
```
