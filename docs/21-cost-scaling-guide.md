# Sparx Platform — Cost & Scaling Guide

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. The Rule

**Don't pay for scale you haven't earned yet.**

Every infrastructure upgrade should be triggered by an observable problem — slow queries, crashed pods, customer complaints — not by what the architecture "should" look like at maturity. The Phase 1 stack handles hundreds of tenants. If you're upgrading before you have hundreds of tenants, you're probably paying for anxiety, not necessity.

---

## 2. Real Cost Breakdown by Phase

### Phase 1 — Early Stage

**Who:** 0–50 tenants. Gillett Diesel live. First paying merchants.
**Credits:** GCP startup credits cover most or all of this.

| Line item | Monthly cost |
|-----------|-------------|
| Cloud SQL db-g1-small | $25 |
| GCP Load Balancer | $18 |
| GCS (media storage) | $2–10 |
| Cloud Build (CI/CD) | $0 (free tier) |
| Pub/Sub | $0 (free tier) |
| GKE compute (Autopilot idle) | $0–30 |
| Redis pod | $0 (GKE pod) |
| Postal pod | $0 (GKE pod) |
| Caddy pod | $0 (GKE pod) |
| Cloudflare | $0 (free plan) |
| Secret Manager | $0 |
| **Total (before credits)** | **~$50–80/mo** |

GCP new account credits: $300 free.
Google for Startups credits (apply post-incorporation): $100K–$200K.
**Effective Phase 1 cost: $0 for 12–18 months.**

---

### Phase 2 — Growth Stage

**Who:** 50–500 tenants. Real revenue. Some tenants noticing slowness.

Changes from Phase 1 and their triggers:

| Upgrade | Monthly delta | Trigger |
|---------|--------------|---------|
| Cloud SQL → db-custom-2-4096 | +$55 | Connection pool exhausted or query p95 > 500ms |
| Cloud SQL read replica | +$40 | Analytics queries slowing down writes |
| Redis pod → Memorystore basic | +$50 | Redis pod crash caused missed automations |
| Typesense pod (search) | +$0* | Product search p95 > 200ms |
| Cloudflare Pro | +$20 | Need better WAF rules or image optimization |
| Postal dedicated IPs | +$20–50 | Merchant email reputation complaints |
| Sentry error tracking | +$26 | Debug time costs more than $26/mo |

*Typesense runs as a GKE pod — compute cost absorbed by cluster headroom.

**Phase 2 total: ~$250–500/mo**
At 50 tenants on Starter ($79/mo avg): $3,950/mo revenue vs $500/mo infra = 87% gross margin before labor.

---

### Phase 3 — Scale Stage

**Who:** 500+ tenants. Enterprise SLA commitments. Significant traffic.

| Line item | Monthly cost |
|-----------|-------------|
| Cloud SQL HA (db-custom-4-8192) | ~$200 |
| Cloud SQL read replicas (×2) | ~$150 |
| Memorystore standard (HA) | ~$150 |
| Multi-region GKE | ~$200 |
| Global load balancer | ~$50 |
| Elasticsearch | ~$100–200 |
| Cloudflare Enterprise | ~$200 |
| Postal (dedicated cluster) | ~$100 |
| Monitoring (Prometheus+Grafana) | ~$0 (self-hosted) |
| PagerDuty | ~$20 |
| **Total** | **~$1,200–1,500/mo** |

#### Phase 3 Revenue Scenarios (~500 tenants)

We plan against two scenarios because product mix at this scale is uncertain:

| Scenario     | Avg ARPU | Implied mix                                 | MRR at 500 tenants |
|--------------|----------|---------------------------------------------|--------------------|
| Conservative | $149/mo  | Predominantly Growth-tier single-module     | $74,500            |
| Optimistic   | $300/mo  | Multi-module + Enterprise upsell saturation | $150,000           |

Phase 3 infrastructure cost remains ~$1,200–$1,500/mo in both scenarios, so gross margin stays ≥ 98% (Conservative: $74,500 MRR vs $1,500 infra; Optimistic: $150,000 MRR vs $1,500 infra). Conservative is the planning baseline; Optimistic is the upper bound for capital allocation decisions.

---

## 3. The Startup Credits Strategy

### GCP Default Credits
Every new GCP account: $300 free for 90 days. Already useful for initial setup and testing.

### Google for Startups Program
Apply immediately after WizeWorks incorporates. This is the big one.

**What you get:** $100K–$200K in GCP credits (amount varies by program tier and referral source).
**How to apply:** cloud.google.com/startup — requires incorporated company, active GCP usage, and sometimes an accelerator referral.
**Duration:** Credits typically expire 1–2 years after grant.

**What it covers at Phase 1–2 rates:**
- $200K credits ÷ $400/mo Phase 2 burn = 500 months of runway
- Realistically you'll hit Phase 3 scale long before credits run out
- Phase 3 burn ($1,500/mo) still gives 130+ months on $200K

**Other credit sources to stack:**
- Stripe: $20K in credits + 1 year fee waiver for startups
- AWS (for any non-GCP services): $100K via Activate
- MongoDB Atlas: $500 credit (skip — using Postgres, but good to know)
- Twilio: $500 credit (useful for SMS MFA via Better Auth)

### Re-up After Incorporation
As mentioned, the Google for Startups program allows re-application after incorporation. The timing here is good — apply the moment WizeWorks is incorporated and GCP usage is active.

---

## 4. Revenue vs Infrastructure Model

At each stage, what does the math look like?

### Break-Even Analysis

| Tenants | Avg plan | MRR | Infra cost | Infra % of MRR |
|---------|---------|-----|------------|----------------|
| 5 | $149 (Growth) | $745 | $80 | 11% |
| 10 | $149 | $1,490 | $80 | 5% |
| 25 | $149 | $3,725 | $80 | 2% |
| 50 | $200 (mixed) | $10,000 | $300 | 3% |
| 100 | $250 (mixed) | $25,000 | $500 | 2% |
| 500 | $300 (mixed) | $150,000 | $1,500 | 1% |

Infrastructure cost as a percentage of MRR shrinks as you scale. This is a fundamentally good business — the marginal cost of adding a new tenant is nearly zero.

### The Gillett Diesel Effect
GDS at $750/mo managed hosting + Enterprise plan is already 10x the infrastructure cost of running them. One client covers the entire Phase 1 infrastructure budget with margin to spare.

---

## 5. Per-Tenant Marginal Cost

What does it actually cost to add one new merchant?

**One-time provisioning cost:**
- Database: one tenant row + schema setup (~0ms compute, ~1KB storage)
- DNS: already handled by wildcard *.sparx.zone
- SSL: Let's Encrypt cert on first request (free, Caddy handles it)
- Welcome email: one Postal send (~$0)

**Ongoing compute cost per tenant:**
- Active store request: ~0.5ms of API CPU per request
- Background workers: proportional to order/email volume
- Storage: media files in GCS at $0.02/GB/mo

**At 1,000 requests/day per tenant, 100 tenants:**
- 100,000 requests/day
- At 0.5ms each: 50 CPU-seconds/day = 0.0006 vCPU continuous
- Negligible — the GKE cluster compute handles this in noise

**The real per-tenant cost is the database.** More tenants = more rows = larger Cloud SQL instance needed. This is why the Phase 2 trigger is Cloud SQL upgrade, not compute upgrade.

---

## 6. Cost Optimization Decisions Already Made

These architectural choices each save meaningful money:

| Decision | Alternative | Savings |
|----------|------------|---------|
| Postal self-hosted | Resend/SendGrid | $0.001/email × 1M emails = $1,000/mo saved at scale |
| PostgreSQL full-text search | Elasticsearch | $100–500/mo saved in Phase 1–2 |
| Redis GKE pod | Memorystore | $50/mo saved in Phase 1 |
| Caddy on-demand TLS | AWS Certificate Manager + ALB | $20–100/mo saved |
| Single GKE cluster (existing) | New dedicated cluster | $100–200/mo saved |
| Typesense (Phase 2) | Elasticsearch | $100–300/mo saved vs managed Elastic |
| Better Auth (self-hosted) | Auth0/Clerk | $0.02/MAU × 10K users = $200/mo saved |
| GCS + Cloudflare CDN | AWS CloudFront | $20–100/mo saved |

**Total savings vs "just use the AWS/SaaS default for everything":** $500–2,000/mo at Phase 2 scale, $3,000–8,000/mo at Phase 3.

---

## 7. What NOT to Skimp On

Some things are worth paying for even in Phase 1:

**Secret Manager** — $0.06/10K ops is nothing. The alternative (env files in repos or unencrypted config) has real security risk.

**Cloud SQL automated backups** — free on Cloud SQL, no reason to skip. RTO < 1hr is worth it.

**Cloudflare (even free tier)** — DDoS protection is not optional. A single bot attack on an unprotected endpoint can take down the whole cluster.

**Sentry** — $26/mo developer plan. The first time you spend 4 hours debugging a production error that Sentry would have surfaced in 10 minutes, you'll wish you had it.

**GCS versioning on media** — free, just a setting. A merchant accidentally deleting their product images is a support nightmare. Versioning means you restore in seconds.

---

## 8. Monitoring Cost

**Phase 1:** $0. Use GCP built-in Cloud Monitoring (free), Cloud Logging (free tier), and uptime checks (free tier). Set alerts on: pod crash loop, Cloud SQL CPU > 80%, API 5xx rate > 1%.

**Phase 2:** Add self-hosted Prometheus + Grafana in the monitoring namespace. Zero additional cost — just GKE pods. Add Sentry ($26/mo).

**Phase 3:** PagerDuty ($20/mo for basic on-call). Everything else stays self-hosted.

Never pay for Datadog, New Relic, or Dynatrace until you have dedicated SRE headcount to actually use them. They're excellent products that generate expensive dashboards nobody looks at.

---

## 9. Scaling Checklist

Before each infrastructure upgrade, confirm:

- [ ] Observable problem identified (not "it might slow down someday")
- [ ] Specific metric that triggered the upgrade documented
- [ ] Cost delta calculated and compared to current MRR
- [ ] Upgrade plan written (which service, which size, when)
- [ ] Rollback plan if upgrade causes issues
- [ ] Startup credits checked before paying cash
