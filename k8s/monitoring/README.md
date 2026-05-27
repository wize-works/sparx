# Monitoring

## Phase 1 — GCP native (no manifests needed)

Per [docs/03-infrastructure-deployment.md](../../docs/03-infrastructure-deployment.md) §9, Phase 1 monitoring uses:

- **Cloud Monitoring** — GKE pod metrics (CPU, memory, restarts), Cloud SQL metrics
- **Cloud Logging** — structured JSON logs from all containers; queries documented in [docs/20-operational-runbook.md](../../docs/20-operational-runbook.md) §6
- **Uptime checks** — pings `/health` on each app's public domain (created out-of-band in Cloud Console or via Terraform later)

Alerts to configure in Cloud Monitoring on day one:

- Pod crash loop (`kubernetes.io/container/restart_count`)
- Cloud SQL CPU > 80%
- API 5xx rate > 5% over 5 min
- Caddy down (`/health` on `api.sparx.works`)
- Domain SSL cert expiring < 30 days

## Phase 2 — Self-hosted Prometheus + Grafana

When custom business metrics matter, install in the `monitoring` namespace:

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prom prometheus-community/kube-prometheus-stack `
  --namespace monitoring `
  --values prometheus-values.yaml
```

Then add `ServiceMonitor` resources alongside each app Deployment.

## Phase 3 — PagerDuty + Sentry

Per [docs/21-cost-scaling-guide.md](../../docs/21-cost-scaling-guide.md) §8 — only when there's revenue to justify the spend.
