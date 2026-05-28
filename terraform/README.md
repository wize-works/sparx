# Sparx Terraform

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

Terraform for the Sparx platform on GCP + Cloudflare. Implements the Phase 1 stack described in [docs/03-infrastructure-deployment.md](../docs/03-infrastructure-deployment.md).

## Layout

```
terraform/
├── bootstrap/        # One-time: APIs, deployer SA, GitHub WIF
├── modules/          # Reusable infra modules
│   ├── vpc/          # VPC + subnet + NAT + PSA peering for Cloud SQL
│   ├── gke/          # GKE Autopilot, private nodes
│   ├── cloud-sql/    # Postgres 16, private IP only
│   ├── pubsub/       # Event bus topics
│   ├── artifact-registry/
│   ├── secrets/      # Secret Manager entries (empty; versions added out of band)
│   └── storage/      # Media bucket
└── envs/
    └── prod/         # sparx-prod environment (staging added when justified)
```

## First-time bring-up (in order)

```powershell
# 0. Pick a project and authenticate
$env:PROJECT_ID = "<sparx-gcp-project-id>"
gcloud config set project $env:PROJECT_ID
gcloud auth application-default login

# 1. Create the Terraform state bucket (one-time, manual)
gcloud storage buckets create gs://sparx-terraform-state `
  --project=$env:PROJECT_ID `
  --location=us-central1 `
  --uniform-bucket-level-access `
  --public-access-prevention
gcloud storage buckets update gs://sparx-terraform-state --versioning

# 2. Bootstrap: enable APIs, create deployer SA + GitHub WIF
cd terraform/bootstrap
terraform init
terraform apply -var "project_id=$env:PROJECT_ID"

# 3. Apply prod environment
cd ../envs/prod
cp terraform.tfvars.example terraform.tfvars  # then fill in project_id
terraform init
terraform apply
```

## Phase 1 cost estimate

| Resource                                                          | Monthly        |
| ----------------------------------------------------------------- | -------------- |
| Cloud SQL `db-g1-small` (private IP)                              | ~$25           |
| L4 load balancer static IP + traffic                              | ~$18           |
| GKE Autopilot (idle → light)                                      | $0–30          |
| Cloud NAT (1 IP, low egress)                                      | ~$2            |
| Everything else (GCS, Pub/Sub, Artifact Registry, Secret Manager) | ~$0–5          |
| **Total before credits**                                          | **~$50–80/mo** |

GCP startup credits cover this for 12–18 months. See [docs/21-cost-scaling-guide.md](../docs/21-cost-scaling-guide.md).

## What this does NOT include

- **Kubernetes workloads.** Caddy, Redis, Postal, the app Deployments — those live in `k8s/` (TBD) and are applied via `kubectl`/Helm, not Terraform. Terraform owns the platform; kubectl owns the apps.
- **Cloudflare DNS records.** Defined in `envs/prod/cloudflare.tf` but gated by `var.cloudflare_enabled = false` until domain transfers from GoDaddy complete and the API token is provisioned.
- **GitHub Actions workflows.** The WIF pool + deployer SA are created so CI _can_ deploy; workflows themselves go in `.github/workflows/`.

## Applying changes

Terraform applies are run from a developer machine with `gcloud auth application-default login` credentials. The CI service account (`sparx-deployer`) is intentionally scoped to app deploys only (image push, GKE rollouts, Secret Manager reads) — not Terraform.

If/when CI-driven IaC becomes necessary, add a separate `sparx-infra-deployer` SA with `roles/editor` and a second WIF binding.
