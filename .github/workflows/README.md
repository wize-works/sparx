# Workflows

| File                                 | When it runs                      | What it does                                                                    |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------- |
| [ci.yml](ci.yml)                     | every PR + push to `main`         | pnpm lint / typecheck / test + Terraform fmt + validate                         |
| [build-images.yml](build-images.yml) | push to `main`, `v*` tags, manual | matrix-builds each service image, pushes to Artifact Registry, scans with Trivy |
| [deploy-prod.yml](deploy-prod.yml)   | `v*` tags, manual                 | runs the migration Job, rolls out new image tags to GKE, smoke-tests `/health`  |

## Required secrets

Set these once at repo level. The first two are outputs of `terraform/bootstrap`:

| Secret                           | Source                                             |
| -------------------------------- | -------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output -raw workload_identity_provider` |
| `GCP_DEPLOYER_SA_EMAIL`          | `terraform output -raw deployer_sa_email`          |
| `GCP_PROJECT_ID`                 | The GCP project ID for sparx                       |

No JSON key files. The `sparx-deployer` SA is impersonated via GitHub OIDC (Workload Identity Federation).

## Deploy flow

```
push v1.2.3 tag
    → migrate job runs `prisma migrate deploy` against Cloud SQL via pgbouncer
    → image tags swapped on each Deployment
    → `kubectl rollout status` waits for each Deployment to converge
    → smoke checks /health on public hosts
```

If migrations fail, deploy doesn't run. Manual rollback (per [docs/20 §2](../../docs/20-operational-runbook.md)):

```
kubectl -n sparx-prod rollout undo deployment/<service>
```

## Soft-skip behaviour

`build-images.yml` skips services whose Dockerfile doesn't exist yet, and `deploy-prod.yml` skips Deployments that aren't in the cluster. This lets workflows stay green during the phased build-out (some services land before others).

When you want stricter behaviour — fail if expected services are missing — remove the conditional checks in those jobs.
