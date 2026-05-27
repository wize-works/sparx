# Sparx Kubernetes Manifests

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

Workloads that run inside the GKE Autopilot cluster provisioned by [terraform/](../terraform/). Terraform owns the platform (cluster, DB, networking); kubectl/kustomize owns the workloads.

## Layout

```
k8s/
├── 00-namespaces.yaml       # sparx-prod, monitoring
├── 01-service-accounts.yaml # KSAs (Workload Identity)
├── caddy/                   # Reverse proxy + on-demand TLS — the LB origin
├── redis/                   # Cache + BullMQ broker (Phase 1: GKE pod, not Memorystore)
├── pgbouncer/               # Transaction-mode pooling (required for RLS SET LOCAL)
├── postal/                  # Email — install via Helm chart; see postal/README.md
├── apps/                    # Application Deployments (one example, copy for the rest)
├── workers/                 # Background workers (one example, copy for the rest)
└── monitoring/              # Phase 1: GCP-native; Phase 2: self-hosted Prometheus
```

## Phase 1 acceptable trade-offs

These match [docs/03-infrastructure-deployment.md](../docs/03-infrastructure-deployment.md) §4 — start cheap, upgrade on observable signal:

- **Redis runs as a single-replica StatefulSet with AOF.** Pod restart = brief queue interruption. Upgrade trigger: first customer-visible missed automation.
- **Postal is recommended via the official Helm chart**, not hand-rolled YAML. See [postal/README.md](postal/README.md).
- **No External Secrets Operator yet.** App pods use Workload Identity and read Secret Manager directly at boot (or via the bundled `sparx-app-env` k8s Secret that's synced from Secret Manager — see [apps/README.md](apps/README.md)).
- **Caddy is single-replica.** Cert storage is local to the PVC. Multi-replica Caddy needs distributed cert storage (Redis backend) — Phase 2.
- **One shared PgBouncer Deployment**, not per-app sidecar. Lower complexity; if it becomes a hotspot, move to sidecars.

## Apply order

After `terraform apply` in `envs/prod`, get cluster credentials:

```powershell
$creds = terraform -chdir=../../terraform/envs/prod output -raw gke_get_credentials_command
Invoke-Expression $creds
```

Then apply:

```powershell
# 1. Namespaces and service accounts
kubectl apply -f 00-namespaces.yaml
kubectl apply -f 01-service-accounts.yaml

# 2. Annotate the sparx-app KSA with the GSA email from Terraform
$gsa = terraform -chdir=../../terraform/envs/prod output -raw app_gsa_email
kubectl annotate serviceaccount sparx-app -n sparx-prod `
  iam.gke.io/gcp-service-account=$gsa --overwrite

# 3. Manual secret sync (Cloud SQL password from Terraform, app env from Secret Manager)
./scripts/sync-secrets.ps1   # see apps/README.md

# 4. Infra workloads
kubectl apply -k redis/
kubectl apply -k pgbouncer/
kubectl apply -k caddy/

# 5. Patch the Caddy Service to bind to the ingress IP
$ip = terraform -chdir=../../terraform/envs/prod output -raw ingress_ip
kubectl patch service caddy -n sparx-prod -p "{\"spec\":{\"loadBalancerIP\":\"$ip\"}}"

# 6. Application workloads (once images exist in Artifact Registry)
kubectl apply -k apps/
kubectl apply -k workers/
```

## What's still TODO

- [ ] Real app Deployments — example template provided in `apps/api-rest.example.yaml`; copy per app
- [ ] Postal Helm install — see `postal/README.md`
- [ ] External Secrets Operator (when manual sync becomes painful)
- [ ] PodMonitor / ServiceMonitor when Prometheus lands (Phase 2)
- [ ] NetworkPolicies (when tenant isolation testing demands it)
