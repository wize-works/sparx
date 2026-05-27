# WizeWorks Platform — Data Model

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Design Principles

- Every table has `tenant_id` — Row Level Security enforced at DB level
- UUIDs for all primary keys (no sequential integers exposed externally)
- `created_at` / `updated_at` on every table — managed by trigger
- Soft deletes via `deleted_at` on high-value records (orders, customers, products)
- JSON/JSONB for flexible metadata and settings without schema migrations
- All foreign keys indexed

---

## 2. Core Entity Map

```
Tenant (merchant account)
├── Domain(s)
├── Subscription (billing plan)
├── Settings (JSON config)
├── Users (staff accounts)
│   └── Role assignments
├── Customers
│   ├── Addresses
│   ├── Orders
│   │   ├── Order Lines
│   │   ├── Fulfillments
│   │   └── Payments
│   ├── CRM Activities
│   └── B2B Account (optional)
│       ├── Pricing Rules
│       ├── Credit Terms
│       └── Quotes
├── Products
│   ├── Variants
│   ├── Images
│   ├── Categories
│   └── Dropship Source (optional)
├── Collections
├── Discounts / Promo Codes
├── Pages (CMS)
├── Blog Posts
├── Email Templates
├── Email Automations
├── Workflows (CRM pipelines)
└── Integrations
    └── Dropship Suppliers
        └── Supplier Products
```

---

## 3. Key Table Schemas

### tenants
```sql
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              VARCHAR(63) NOT NULL UNIQUE,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  plan              VARCHAR(50) NOT NULL DEFAULT 'starter',
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  settings          JSONB NOT NULL DEFAULT '{}',
  stripe_customer_id VARCHAR(255),
  trial_ends_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### users
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  full_name     VARCHAR(255),
  role          VARCHAR(50) NOT NULL DEFAULT 'editor',
  -- roles: owner | admin | editor | viewer | api
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);
```

### customers
```sql
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  email           VARCHAR(255),
  phone           VARCHAR(50),
  first_name      VARCHAR(255),
  last_name       VARCHAR(255),
  company         VARCHAR(255),
  type            VARCHAR(20) DEFAULT 'retail', -- retail | b2b | wholesale
  b2b_account_id  UUID REFERENCES b2b_accounts(id),
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  total_spent     NUMERIC(12,2) DEFAULT 0,
  order_count     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_email ON customers(tenant_id, email);
CREATE INDEX idx_customers_b2b ON customers(b2b_account_id);
```

### b2b_accounts
```sql
CREATE TABLE b2b_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  name              VARCHAR(255) NOT NULL,
  pricing_tier      VARCHAR(50),
  credit_limit      NUMERIC(12,2),
  credit_used       NUMERIC(12,2) DEFAULT 0,
  payment_terms     VARCHAR(20), -- net30 | net60 | net90 | prepay
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  status            VARCHAR(20) DEFAULT 'active',
  metadata          JSONB DEFAULT '{}',
  -- fleet-specific
  fleet_size        INTEGER,
  engine_profiles   JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### products
```sql
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  title           VARCHAR(500) NOT NULL,
  slug            VARCHAR(500) NOT NULL,
  description     TEXT,
  status          VARCHAR(20) DEFAULT 'draft', -- draft | active | archived
  product_type    VARCHAR(100),
  vendor          VARCHAR(255),
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  seo_title       VARCHAR(255),
  seo_description VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE(tenant_id, slug)
);
```

### product_variants
```sql
CREATE TABLE product_variants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  sku                 VARCHAR(255),
  title               VARCHAR(255),
  price               NUMERIC(12,2) NOT NULL,
  compare_at_price    NUMERIC(12,2),
  cost                NUMERIC(12,2),
  weight              NUMERIC(10,3),
  inventory_quantity  INTEGER DEFAULT 0,
  inventory_policy    VARCHAR(20) DEFAULT 'deny', -- deny | continue
  options             JSONB DEFAULT '{}', -- {color: "red", size: "XL"}
  dropship_source_id  UUID REFERENCES dropship_products(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### orders
```sql
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  order_number      VARCHAR(50) NOT NULL,
  customer_id       UUID REFERENCES customers(id),
  b2b_account_id    UUID REFERENCES b2b_accounts(id),
  status            VARCHAR(30) DEFAULT 'pending',
  -- pending | confirmed | processing | fulfilled | cancelled | refunded
  financial_status  VARCHAR(30) DEFAULT 'pending',
  -- pending | paid | partially_paid | invoiced | overdue | refunded
  fulfillment_status VARCHAR(30) DEFAULT 'unfulfilled',
  subtotal          NUMERIC(12,2) NOT NULL,
  tax_total         NUMERIC(12,2) DEFAULT 0,
  shipping_total    NUMERIC(12,2) DEFAULT 0,
  discount_total    NUMERIC(12,2) DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'USD',
  shipping_address  JSONB,
  billing_address   JSONB,
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE(tenant_id, order_number)
);
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_created ON orders(tenant_id, created_at DESC);
```

### email_automations
```sql
CREATE TABLE email_automations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        VARCHAR(255) NOT NULL,
  trigger     VARCHAR(100) NOT NULL,
  -- order.created | cart.abandoned | customer.created | order.shipped
  -- customer.inactive | b2b.account.approved | custom
  delay_minutes INTEGER DEFAULT 0,
  conditions  JSONB DEFAULT '{}',
  template_id UUID REFERENCES email_templates(id),
  is_active   BOOLEAN DEFAULT true,
  stats       JSONB DEFAULT '{"sent": 0, "opened": 0, "clicked": 0}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### dropship_suppliers
```sql
CREATE TABLE dropship_suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(50) NOT NULL, -- dsers | spocket | faire | custom
  credentials   JSONB DEFAULT '{}', -- encrypted API keys
  settings      JSONB DEFAULT '{}',
  sync_status   VARCHAR(20) DEFAULT 'idle',
  last_synced_at TIMESTAMPTZ,
  product_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Row Level Security

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their tenant's data
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Set tenant context in API middleware:
-- SET LOCAL app.tenant_id = 'uuid-here'
```

This is enforced at the database level as a backstop, even if application-level tenant filtering fails.

---

## 5. Audit Log

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  actor_id    UUID, -- user_id or null for system
  actor_type  VARCHAR(20), -- user | system | api
  action      VARCHAR(100) NOT NULL, -- order.created, customer.updated, etc.
  entity_type VARCHAR(100),
  entity_id   UUID,
  diff        JSONB, -- before/after for updates
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Partitioned by month for performance
-- Retained 2 years, then archived to GCS
```
