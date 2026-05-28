# WizeWorks Platform — Operational Runbook

**Version:** 1.1  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-28

---

## 1. On-Call & Incident Response

### Severity Levels

| Severity | Definition                                        | Response Time       | Notification                   |
| -------- | ------------------------------------------------- | ------------------- | ------------------------------ |
| **P0**   | Complete outage or data breach                    | Immediate (< 5 min) | PagerDuty critical, SMS, phone |
| **P1**   | Major feature broken (checkout, login, email)     | < 15 minutes        | PagerDuty high, Slack          |
| **P2**   | Non-critical feature broken, degraded performance | < 1 hour            | Slack                          |
| **P3**   | Minor issue, workaround exists                    | Next business day   | Jira ticket                    |

### Incident Response Process

**P0/P1 Response:**

1. PagerDuty fires → on-call engineer acknowledges within 5 minutes
2. Post in `#incidents` Slack channel: "🔴 P{n} INCIDENT: [brief description]"
3. Start incident timeline in runbook doc
4. Diagnose: check dashboards → logs → recent deploys
5. Mitigate: rollback / feature flag / hotfix
6. Resolve: post "✅ RESOLVED" with summary
7. Schedule post-mortem within 48 hours

**Incident Commander:**

- For P0/P1: designate one person as IC to coordinate
- IC runs the timeline, delegates diagnosis and fix
- IC owns merchant communication (status page update within 15 min)

### Status Page

- Hosted at `status.wizeworks.com` (Instatus or Statuspage.io)
- Auto-updates from Prometheus alerting
- Merchants subscribed to email/SMS updates

---

## 2. Deployment Procedures

### Standard Deploy (Production)

1. Merge PR to `main` → staging auto-deploys
2. Run E2E critical path against staging (automated in CI)
3. Create GitHub release with semver tag → triggers prod deploy
4. Monitor: watch error rate and latency for 15 minutes post-deploy
5. If degraded: rollback (see below)

### Rollback Procedure

```bash
# Get previous image tag
kubectl -n wizeworks-prod rollout history deployment/api-rest

# Rollback to previous
kubectl -n wizeworks-prod rollout undo deployment/api-rest

# Or rollback to specific revision
kubectl -n wizeworks-prod rollout undo deployment/api-rest --to-revision=42

# Verify rollback complete
kubectl -n wizeworks-prod rollout status deployment/api-rest
```

### Database Migration Rollback

Migrations are forward-only. To "rollback" a schema change:

1. Deploy a new migration that reverses the change (two-phase)
2. Never run `migrate reset` on production — ever

### Hotfix Process

1. Branch from the current production tag (not main)
2. Fix → test → PR with `[hotfix]` label
3. Deploy directly to production after review
4. Cherry-pick to main

---

## 3. Common Runbooks

### API Latency Spike

**Symptoms:** p95 latency alert fires, Grafana shows latency increase

**Investigation:**

```bash
# Check pod CPU/memory
kubectl -n wizeworks-prod top pods

# Check database slow queries
gcloud sql operations list --instance=wizeworks-prod
psql $DATABASE_URL -c "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;"

# Check Redis
redis-cli --no-auth-warning -u $REDIS_URL INFO stats | grep rejected_connections

# Check recent deploys
kubectl -n wizeworks-prod rollout history deployment/api-rest
```

**Common causes:**

- Missing DB index → check `EXPLAIN ANALYZE` on slow query
- Redis connection pool exhausted → check pool settings
- Bad deploy → rollback
- Traffic spike → check if HPA is scaling

### Email Delivery Failure

**Symptoms:** `email-worker` error rate spike, merchants report emails not sending

**Investigation:**

```bash
# Check worker logs
kubectl -n wizeworks-prod logs -l app=email-worker --tail=100

# Check BullMQ queue health
redis-cli -u $REDIS_URL LLEN bull:email:failed
redis-cli -u $REDIS_URL LLEN bull:email:waiting

# Check Resend dashboard for bounces/API errors
# https://resend.com/dashboard
```

**Common causes:**

- Resend API key expired → rotate in Secret Manager
- Resend rate limit hit → check plan limits
- Invalid email addresses → check suppression list
- Template rendering error → check template in React Email preview

**Resolution:**

```bash
# Retry failed jobs
kubectl exec -n wizeworks-prod deploy/email-worker -- node scripts/retry-failed-jobs.js

# Or via BullMQ dashboard (if enabled)
```

### Domain Verification Stuck

**Symptoms:** Merchant reports custom domain not verifying after 30+ minutes

**Investigation:**

```bash
# Check domain status
psql $DATABASE_URL -c "SELECT domain, status, failure_reason, created_at FROM domains WHERE domain = 'their-domain.com';"

# Check DNS manually
dig CNAME their-domain.com

# Check worker logs
kubectl -n wizeworks-prod logs -l app=domain-worker --tail=100
```

**Common causes:**

- CNAME not propagated yet (can take up to 48hr for some registrars) → wait + communicate
- Wrong CNAME value entered → check `dig` output vs expected value
- Cloudflare proxy enabled (orange cloud) → must use DNS-only (grey cloud) for CNAME
- Worker not running → restart worker pod

### Checkout Failures

**Symptoms:** Orders not completing, merchants report customer complaints

**Investigation:**

```bash
# Check checkout error logs
kubectl -n wizeworks-prod logs -l app=api-rest --tail=200 | grep 'checkout'

# Check Stripe dashboard for payment intent failures
# https://dashboard.stripe.com/payments?status=failed

# Check inventory atomicity
psql $DATABASE_URL -c "SELECT id, inventory_quantity FROM product_variants WHERE id = 'variant-id';"
```

**Common causes:**

- Stripe webhook not processing → check webhook logs in Stripe dashboard
- Inventory race condition → look for negative inventory_quantity values
- Payment method declined → customer issue, not platform issue
- Tax calculation timeout → TaxJar/Avalara API down, check status page

### High Memory / OOM Pod

**Symptoms:** Pod OOMKilled, repeated crashes

```bash
# Check pod events
kubectl -n wizeworks-prod describe pod api-rest-xxxx

# Check memory usage history
# Grafana → Container memory usage dashboard

# Temporary: increase memory limit
kubectl -n wizeworks-prod set resources deployment/api-rest --limits=memory=2Gi

# Root cause: memory leak
# Check for unclosed DB connections, event listeners, large payload handling
```

---

## 4. Backup & Restore

### Database Backup Verification (Monthly)

```bash
# List recent automated backups
gcloud sql backups list --instance=wizeworks-prod

# Create on-demand backup
gcloud sql backups create --instance=wizeworks-prod

# Test restore to staging
gcloud sql instances clone wizeworks-prod wizeworks-restore-test \
  --point-in-time="2026-05-27T10:00:00.000Z"

# Verify data integrity on restored instance
psql $RESTORE_DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
psql $RESTORE_DATABASE_URL -c "SELECT COUNT(*) FROM orders;"

# Delete test instance
gcloud sql instances delete wizeworks-restore-test
```

### Restore Procedure (P0 — Data Loss)

1. Declare P0 incident, notify stakeholders
2. Identify point-in-time to restore to (last known good state)
3. Clone Cloud SQL instance to restore point
4. Verify data integrity
5. Update `DATABASE_URL` secret to point to restored instance
6. Restart all application pods
7. Verify platform functionality
8. Notify affected merchants

**RTO: < 1 hour | RPO: < 5 minutes**

### GCS Media Restore

GCS versioning enabled on media bucket. Restore deleted file:

```bash
# List versions of a file
gcloud storage ls --all-versions gs://wizeworks-media/original/image.jpg

# Restore specific version
gcloud storage cp "gs://wizeworks-media/original/image.jpg#1234567890" \
  gs://wizeworks-media/original/image.jpg
```

---

## 5. Scaling Procedures

### Horizontal Pod Autoscaler

HPA is configured for all stateless services. Manual override if needed:

```bash
# Check current HPA status
kubectl -n wizeworks-prod get hpa

# Manually scale (emergency)
kubectl -n wizeworks-prod scale deployment/api-rest --replicas=20

# HPA will take over when metric-based scaling catches up
```

### Database Read Replicas

Read-heavy endpoints (analytics, search) route to read replica:

```bash
# Check replica lag
gcloud sql instances describe wizeworks-prod-replica | grep replicationLag

# If lag > 30s: route all traffic to primary temporarily
# Set env var READ_REPLICA_URL="" → falls back to primary
kubectl -n wizeworks-prod set env deployment/api-rest READ_REPLICA_URL=""
```

---

## 6. Monitoring Reference

### Grafana Dashboards

- **Platform Overview:** Error rates, latency, throughput across all services
- **API Performance:** Per-endpoint latency, top slow queries
- **Worker Health:** Queue depth, processing rate, failure rate per worker
- **Database:** Connection pool, query time, replication lag
- **Cache:** Redis hit rate, memory usage, eviction rate
- **Business Metrics:** Orders/hour, signups/day, email delivery rate

### Key Prometheus Queries

```promql
# API error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# p95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Worker queue depth
bull_queue_waiting{queue="email"}

# DB connection pool utilization
pg_pool_used / pg_pool_size
```

### Log Queries (Google Cloud Logging)

```
# All errors in last hour
resource.type="k8s_container"
severity=ERROR
timestamp >= "2026-05-27T09:00:00Z"

# Slow API requests (> 1s)
resource.type="k8s_container"
labels.app="api-rest"
jsonPayload.duration > 1000

# Failed email sends
resource.type="k8s_container"
labels.app="email-worker"
jsonPayload.status="failed"
```

---

## 7. Maintenance Windows

- **Weekly:** Tuesdays 2:00 AM–3:00 AM UTC (low traffic window)
- **Database vacuuming:** Automated, pg_autovacuum (no window needed)
- **SSL cert renewal:** Automated via Caddy (no window needed)
- **Dependency updates:** Weekly automated PRs via Dependabot
- **Penetration testing:** Annual, scheduled in advance with 2-week merchant notice

---

## 8. Post-Mortem Template

```markdown
## Incident Post-Mortem: [Title]

**Date:** YYYY-MM-DD  
**Severity:** P{n}  
**Duration:** HH:MM  
**Author:** [Name]

### Summary

[2-3 sentence summary of what happened, impact, and resolution]

### Timeline

- HH:MM — [event]
- HH:MM — [event]
- HH:MM — Resolved

### Root Cause

[Technical explanation of what went wrong]

### Impact

- Merchants affected: [N]
- Orders affected: [N]
- Revenue impact: [$]

### What Went Well

- [item]

### What Went Poorly

- [item]

### Action Items

| Action            | Owner   | Due Date   | Status |
| ----------------- | ------- | ---------- | ------ |
| Add missing index | Brandon | 2026-06-01 | Open   |
| Add alert for X   | Brandon | 2026-06-03 | Open   |
```
