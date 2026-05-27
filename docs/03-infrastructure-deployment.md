# Sparx Platform — Infrastructure & Deployment

**Version:** 3.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Philosophy — Start Cheap, Scale When Revenue Justifies It

Sparx runs on Google Cloud Platform inside an existing WizeWorks GKE cluster. Every infrastructure decision is evaluated against this rule: **don't pay for a service when a simpler alternative covers the use case at this scale.**

The architecture is explicitly phased. Services are swapped up as tenant count and revenue grow — not before. The application code doesn't change between phases; only the backing services do.

WizeWorks runs on GCP startup credits. Post-incorporation, apply immediately to the Google for Startups program for credit re-ups ($100K–$200K available). This covers the entire early and growth stages comfortably.

---

## 2. GKE Cluster Strategy

### Existing Cluster Reuse
Sparx deploys into the existing WizeWorks GKE cluster as a new namespace set. No new cluster required at launch.

```
Existing WizeWorks GKE cluster
├── [existing namespaces]
├── sparx-prod        ← new
├── sparx-staging     ← new
└── monitoring        ← shared or new
```

### Node Sizing (Early Stage)
GKE Autopilot scales to zero when idle — no nodes running means no node cost. For low-traffic early stage, actual compute cost is minimal. Autopilot provisions nodes on-demand per pod request.

If using Standard mode (not Autopilot), size down to `e2-small` or `e2-medium` nodes with min=1, max=5 autoscaling. A single `e2-medium` ($35/mo) handles dozens of tenants comfortably at low traffic.

### Namespaces
```
sparx-prod      # Production workloads
sparx-staging   # Staging / QA
monitoring      # Prometheus, Grafana (shared with WizeWorks)
```

---

## 3. Phased Service Selection

### Phase 1 — Early Stage (~$50–120/mo before credits)

**Trigger:** Now. Get Gillett Diesel live. First paying tenants.

| Service | Choice | Why | Cost |
|---------|--------|-----|------|
| Database | Cloud SQL db-g1-small | 1 vCPU, 1.7GB RAM. Handles hundreds of tenants. | ~$25/mo |
| Cache + queues | Redis pod in GKE | Self-hosted container. BullMQ works identically. | ~$0 |
| Search | PostgreSQL full-text (tsvector) | Built into Postgres. No sync, no extra service. | $0 |
| Event bus | Google Pub/Sub | 10GB free/mo ≈ 10M messages. Won't touch this for months. | $0 |
| File storage | GCS | 5GB free, then $0.02/GB. | ~$0–5/mo |
| CDN / Edge | Cloudflare Free | DDoS, WAF basics, CDN, DNS. | $0 |
| Email sending | Postal (GKE pod) | Self-hosted. No per-email cost. | ~$0 |
| Reverse proxy / SSL | Caddy (GKE pod) | On-demand TLS. One pod serves all tenants. | ~$0 |
| Load balancer | GCP L4 LB | One LB, all traffic. Caddy routes internally. | ~$18/mo |
| Secrets | Secret Manager | $0.06/10K ops. Negligible. | ~$0 |
| CI/CD | GitHub Actions + Cloud Build | Free tier covers 120 min/day builds. | $0 |

**Total cash cost before credits: ~$50–80/mo**

### Phase 2 — Growth Stage (~$200–500/mo)

**Trigger:** 50+ paying tenants, or users noticing search/cache slowness.

| Upgrade | From | To | Why |
|---------|------|----|-----|
| Database | db-g1-small | db-custom-2-4096 + read replica | More connections, analytics queries on replica |
| Cache | Redis GKE pod | Memorystore (managed Redis) | Auto-failover, persistence, no manual ops |
| Search | PostgreSQL full-text | Typesense (self-hosted GKE) | Faster faceted search, typo tolerance, still cheap |
| CDN | Cloudflare Free | Cloudflare Pro ($20/mo) | Better WAF, image optimization, analytics |
| Email IPs | Shared Postal pool | Dedicated Postal IP pool | Isolate high-volume merchant reputation |

### Phase 3 — Scale Stage (~$1,000–5,000/mo)

**Trigger:** 500+ tenants, enterprise clients, SLA commitments.

| Upgrade | What |
|---------|------|
| Multi-region | Add us-west1 GKE cluster, global load balancer |
| Cloud SQL HA | High-availability config, multiple read replicas |
| Elasticsearch | Replace Typesense for complex faceted search at scale |
| Memorystore cluster | Redis cluster mode for horizontal cache scaling |
| Cloudflare Enterprise | Advanced WAF, bot management, custom certs |
| Dedicated tenant DBs | Enterprise clients get isolated Cloud SQL instances |

---

## 4. The Three Key Phase 1 Substitutions

### 4a. Redis as GKE Pod (not Memorystore)

A single Redis container in the existing GKE cluster costs nothing beyond pod compute (already paying for the node).

```yaml
# k8s/sparx-prod/redis.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: sparx-prod
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        args: ["--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
```

BullMQ and the application connect to `redis.sparx-prod.svc.cluster.local:6379`.

**Acceptable risk:** If the Redis pod crashes, in-flight queue jobs may be lost. At early stage this means a delayed email or webhook — not a data loss event. Migrate to Memorystore when you have paying customers who'd notice.

**Upgrade trigger:** First customer complaint about a missed email, or when you have >20 paying tenants.

### 4b. PostgreSQL Full-Text Search (not Elasticsearch)

Postgres `tsvector` with a `GIN` index handles product and customer search well up to ~50K products per tenant.

```sql
-- Add to products table
ALTER TABLE products ADD COLUMN search_vector tsvector;
CREATE INDEX idx_products_search ON products USING GIN(search_vector);

-- Update trigger keeps it current
CREATE FUNCTION update_product_search() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_product_search();

-- Query
SELECT *, ts_rank(search_vector, query) as rank
FROM products, plainto_tsquery('english', $1) query
WHERE tenant_id = $2
  AND search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

**Upgrade trigger:** Search feels slow (>200ms p95), or when a tenant has >50K products and needs faceted filtering with typo tolerance.

**Upgrade path:** Typesense (not Elasticsearch). Typesense is a modern search engine written in C++, dramatically simpler to operate than Elasticsearch, self-hostable as a single GKE pod, and better suited for product catalog search. Elasticsearch is reserved for Phase 3 when complexity and scale justify it.

```yaml
# k8s/sparx-prod/typesense.yaml (Phase 2 only)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: typesense
  namespace: sparx-prod
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: typesense
        image: typesense/typesense:0.25.2
        args:
        - --data-dir=/data
        - --api-key=$(TYPESENSE_API_KEY)
        - --listen-port=8108
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
```

### 4c. Pub/Sub Stays — It's Already Free

Google Pub/Sub: first 10GB of message data per month is free. At ~1KB per message average, that's 10 million messages. At early stage Sparx will process maybe 50K–100K messages per month across all tenants. Pub/Sub cost: $0 for the foreseeable future.

The event-driven architecture is worth keeping from day one. Retrofitting it later is significantly more painful than the $0 it costs now.

---

## 5. Core Services (Kubernetes Deployments)

All deployments live in `sparx-prod` namespace.

```
api-rest          # Fastify REST API
api-graphql       # Pothos/Mercurius GraphQL
api-mcp           # MCP server (AI integration)
dashboard         # Next.js merchant admin
storefront        # Next.js multi-tenant storefronts
caddy             # Reverse proxy + on-demand TLS
redis             # Cache + BullMQ (Phase 1: pod, Phase 2: Memorystore)
postal            # Self-hosted email delivery
worker-email      # Pub/Sub consumer → Postal
worker-domain     # CNAME validation + SSL provisioning
worker-dropship   # Supplier catalog sync
worker-billing    # Stripe webhook processing
worker-webhook    # Outbound webhook dispatch
```

### Resource Sizing (Phase 1)

| Deployment | Replicas | CPU request | Memory request |
|-----------|---------|-------------|----------------|
| api-rest | 2 | 250m | 256Mi |
| api-graphql | 1 | 250m | 256Mi |
| api-mcp | 1 | 250m | 256Mi |
| dashboard | 1 | 250m | 512Mi |
| storefront | 2 | 500m | 512Mi |
| caddy | 1 | 100m | 128Mi |
| redis | 1 | 100m | 256Mi |
| postal | 1 | 500m | 512Mi |
| workers (each) | 1 | 100m | 128Mi |

Total cluster footprint: ~4 vCPU, ~4GB RAM. On GKE Autopilot this provisions automatically. On Standard mode, a single `e2-standard-4` node ($120/mo) covers this comfortably with headroom.

---

## 6. CI/CD Pipeline

### GitHub Actions

**`ci.yml`** — every PR:
```
lint → type check → unit tests → integration tests (testcontainers) → Docker build → Trivy scan
```

**`deploy-staging.yml`** — merge to `main`:
```
build images → push to Artifact Registry → DB migrations → deploy to sparx-staging → E2E smoke tests → Slack notify
```

**`deploy-prod.yml`** — release tag (semver):
```
build images → push → DB migrations → rolling deploy to sparx-prod → health check → E2E smoke → Slack + PagerDuty
```

### Cloud Build (alternative for GCP-native builds)
Cloud Build free tier: 120 minutes/day. Sufficient for Phase 1. Integrates directly with Artifact Registry and GKE.

### Rollback
```bash
# Immediate rollback (seconds)
kubectl -n sparx-prod rollout undo deployment/api-rest

# Rollback to specific revision
kubectl -n sparx-prod rollout undo deployment/api-rest --to-revision=42
```

Database migrations are forward-only. Schema rollbacks are a new forward migration. Never `migrate reset` in production.

---

## 7. Domain & SSL — Zero Config Per Tenant

The single most important infrastructure decision: Caddy with on-demand TLS.

```
New merchant signs up
    → slug "acme-parts" claimed in DB
    → *.sparx.zone A record already points to GKE LB (set once, never changes)
    → First request to acme-parts.sparx.zone:
        → Caddy calls /internal/domain-check
        → Tenant found and active
        → Caddy calls Let's Encrypt ACME API
        → SSL cert issued (~2 seconds)
        → Storefront renders
    → All subsequent requests: cert cached, sub-200ms
```

Custom domain flow:
```
Merchant adds "shop.acme.com"
    → Platform shows: CNAME shop → customers.sparx.zone
    → Domain worker polls every 5 min for CNAME propagation
    → On propagation: domain.verified event to Pub/Sub
    → Caddy /internal/domain-check returns 200
    → Next HTTPS request: Let's Encrypt cert issued automatically
    → acme-parts.sparx.zone → 301 redirect to shop.acme.com
```

No manual cert management. No per-tenant Caddy config. One Caddyfile serves all merchants.

---

## 8. Database

### Phase 1: Cloud SQL db-g1-small
- 1 vCPU, 1.7GB RAM
- 10GB SSD storage
- Automated daily backups (7-day retention on free tier, 30-day on paid)
- Private IP only (no public exposure)
- Cloud SQL Auth Proxy in GKE for secure connections

Cost: ~$25/mo

### Connection Pooling
PgBouncer runs as a sidecar or separate pod. Transaction-mode pooling is required for RLS `SET LOCAL` to work correctly — session-mode would share tenant context across connections.

```
Application pods → PgBouncer (transaction mode) → Cloud SQL Auth Proxy → Cloud SQL
```

### Migration Strategy
- Tool: Prisma Migrate
- Forward-only migrations in production
- Migrations run as a Kubernetes Job before each deployment
- Never run `migrate reset` in production

---

## 9. Monitoring (Phase 1 — Lightweight)

Phase 1 monitoring is intentionally minimal. Don't pay for Datadog or New Relic at this stage.

**Free / included:**
- GKE built-in metrics (Cloud Monitoring) — CPU, memory, pod restarts
- Cloud SQL metrics — connections, CPU, storage
- Cloud Logging — structured JSON logs from all services
- Uptime checks — Cloud Monitoring pings `/health` endpoints

**Add when needed:**
- Prometheus + Grafana (self-hosted in `monitoring` namespace) — when you need custom business metrics
- PagerDuty — when you have SLA commitments to clients
- Sentry (error tracking) — $26/mo developer plan, worth it early

**What to alert on from day one:**
- Pod crash loop
- Cloud SQL CPU > 80%
- API error rate > 5% (Cloud Logging metric)
- Domain SSL cert expiring < 30 days

---

## 10. Backup Strategy (Phase 1)

| Data | Method | Retention | Cost |
|------|--------|-----------|------|
| PostgreSQL | Cloud SQL automated daily backup | 7 days | Free |
| GCS media | Object versioning enabled | Indefinite | ~$0.02/GB/mo |
| Redis | Append-only file (AOF) on pod | Restart-safe | $0 |
| Terraform state | GCS bucket with versioning | Indefinite | ~$0 |

**Restore test:** Run quarterly. Clone Cloud SQL to a test instance, verify row counts, delete test instance. Document actual RTO (target: < 1 hour).

---

## 11. Upgrade Decision Triggers

Don't upgrade based on calendar. Upgrade based on observable signals:

| Signal | Upgrade |
|--------|---------|
| Redis pod crashes → missed email automation | Migrate to Memorystore |
| Product search p95 > 200ms | Add Typesense pod |
| DB connections exhausted (check `pg_stat_activity`) | Upgrade Cloud SQL instance |
| Pub/Sub costs appear on bill | You have serious volume — re-evaluate everything |
| First enterprise client signs SLA | Add Cloud SQL HA, Cloudflare Pro |
| 50+ tenants | Review all Phase 1 decisions |
| $10K+/mo revenue | Infrastructure cost is now a rounding error — optimize for reliability |
