# Sparx Platform — Architecture Overview

**Version:** 2.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Architecture Philosophy

Sparx is built API-first, cloud-native, modular, and multi-tenant from day one. Every feature exposed in the UI is available via API. The platform runs on Google Kubernetes Engine (GKE) with horizontal scalability at every layer.

Core tenets:
- **Modular** — Modules activate independently; disabled modules add zero overhead
- **Stateless services** — No session state in application tier; all state in data layer
- **Event-driven** — Business events (order placed, customer created) emit to Pub/Sub; all side effects are consumers
- **Tenant isolation** — Every merchant's data is row-level isolated with PostgreSQL RLS
- **Zero-downtime deploys** — Rolling updates; feature flags for gradual rollout
- **MCP-native** — The MCP server is a first-class service, not an afterthought
- **Auth via Better Auth** — Self-hosted, open source, no SaaS dependency

---

## 2. High-Level System Diagram

```
CLIENT LAYER
  Merchant Storefront (Next.js, theme-driven, multi-tenant)
  Admin Dashboard (Next.js)
  B2B Portal (Next.js)
  Custom Frontends (headless API consumers — Enterprise)
        │
        ▼ HTTPS
EDGE / GATEWAY LAYER
  Cloudflare (DDoS, WAF, CDN, DNS)
  Caddy (Dynamic SSL via on-demand TLS, domain routing)
  API Gateway (rate limiting, auth, tenant routing)
        │
        ▼
API LAYER (GKE)
  REST API (Fastify + Better Auth)
  GraphQL API (Pothos + Mercurius)
  MCP Server (TypeScript, @modelcontextprotocol/sdk)
        │
        ▼
SERVICE LAYER
  Auth (Better Auth)   Commerce      CRM        CMS
  Email (Postal)       B2B           Billing    Domains
  Dropship             Sitebuilder   Scheduler  Search
  (Scheduler = cron/job scheduling for nightly tasks:
   renewal checks, catalog syncs, reports)
        │
        ▼
EVENT BUS (Google Pub/Sub)
  order.created  customer.updated  cart.abandoned
  domain.verified  email.send  module.activated
        │                              │
        ▼                              ▼
DATA LAYER                      WORKER LAYER
  PostgreSQL (Cloud SQL)          Email sender (→ Postal)
  Redis (Memorystore)             Domain validator
  Elasticsearch (search)          Dropship sync
  GCS (media/files)               Billing worker
                                  Webhook dispatcher
                                  Report generator

EMAIL INFRASTRUCTURE (Postal)
  sparx.email sending domain
  Dedicated IP pools
  Bounce/complaint processing
  Per-tenant DKIM signing
  Merchant domain authentication
```

---

## 3. Technology Stack

### Infrastructure
| Component | Technology |
|-----------|-----------|
| Container orchestration | Google Kubernetes Engine (GKE Autopilot) |
| Infrastructure as code | Terraform |
| CI/CD | GitHub Actions + Cloud Build |
| Container registry | Google Artifact Registry |
| Secret management | Google Secret Manager |
| DNS / Edge | Cloudflare |

### Authentication
| Component | Technology |
|-----------|-----------|
| Auth framework | Better Auth (self-hosted, open source) |
| Password hashing | Argon2 (via Better Auth) |
| Session management | JWT (15 min) + refresh tokens (30 day) |
| Social OAuth | Google, Apple (via Better Auth) |
| MFA | TOTP + SMS (via Better Auth) |
| Multi-tenancy | Better Auth organizations plugin |
| API keys | Better Auth API key plugin |

### Backend
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (TypeScript strict) |
| HTTP framework | Fastify |
| GraphQL | Pothos + Mercurius |
| ORM | Prisma |
| Queue | BullMQ (Redis-backed) |
| Event bus | Google Pub/Sub |

### Email
| Component | Technology |
|-----------|-----------|
| Mail delivery | Postal (self-hosted, GKE deployment) — built-in tracking (clicks, opens, bounces) |
| Sending domain | sparx.email (dedicated) |
| Template rendering | React Email |
| IP management | Dedicated pools per volume tier |
| Tracking | Postal built-in (clicks, opens, bounces) |

### Data
| Component | Technology |
|-----------|-----------|
| Primary database | PostgreSQL 16 (Cloud SQL) |
| Cache / sessions | Redis (Memorystore) |
| Search | Search index — Typesense (Phase 2 onward) or Elasticsearch (Phase 3+) |
| File storage | Google Cloud Storage |
| CDN | Cloudflare |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS |
| State | Zustand + React Query |
| Components | Radix UI + custom |
| Email templates | React Email |

### Payments
| Component | Technology |
|-----------|-----------|
| Payment processing | Stripe |
| Subscription billing | Stripe Billing (module-based) |
| B2B invoicing | Custom (backed by Stripe) |

---

## 4. Module Architecture

Each module is a feature-flagged set of services, routes, and UI components. Disabled modules:
- Have no active API routes (404 returned **with a clear error message** identifying the disabled module)
- Have no running workers
- Contribute no overhead to the application tier
- Store no data (tables exist, no rows for disabled modules)

Module activation:
1. Merchant activates module in billing settings
2. Stripe subscription item added
3. `module.activated` event published to Pub/Sub
4. Feature flag updated in tenant settings (Redis cache + DB)
5. API routes enabled, workers started if needed
6. Dashboard navigation item appears
7. Merchant notified via email

---

## 5. Multi-Tenancy Model

Shared database, row-level isolation using PostgreSQL Row Level Security (RLS). Every tenant-scoped table has `tenant_id`. RLS policies enforce isolation at the database level — backstop against application-level bugs. RLS is the backstop against application-tier bugs — even if an ORM query forgets the tenant filter, the database refuses to return cross-tenant rows.

Better Auth's organization model maps directly:
- Better Auth Organization = Sparx Tenant
- Better Auth Organization Member = Sparx Staff User
- Tenant context established from Better Auth session claims

---

## 6. Domain Routing Architecture

```
Request: shop.acme.com
    ↓
Cloudflare (DNS proxy, WAF, DDoS)
    ↓
Caddy (on-demand TLS — issues Let's Encrypt cert automatically)
    ↓ Looks up domain in domains table → resolves tenant
Next.js storefront (reads tenant_id, loads theme, renders)
    ↓
API (tenant context from Better Auth JWT or domain lookup)
```

---

## 7. Email Architecture (Postal)

```
Application event (order.created)
    ↓
email.send published to Pub/Sub
    ↓
Email worker subscribes → renders React Email template
    ↓
Sends to Postal via HTTP API
    ↓
Postal routes via merchant's DKIM-signed domain (or sparx.email)
    ↓ Dedicated IP pool
Recipient's inbox
    ↓
Bounces/complaints → Postal webhook → Sparx suppression list
```

---

## 8. Scalability Targets

| Metric | Target |
|--------|--------|
| Storefront page load (p95) | < 200ms |
| API response time (p95) | < 100ms |
| Concurrent tenants | 10,000+ |
| Orders per second (peak) | 1,000+ |
| Email delivery | < 30 seconds |
| Domain SSL provisioning | < 5 minutes |
| Uptime SLA | 99.9% (99.99% Enterprise) |
| Email deliverability | > 98% inbox placement |
