# Application Deployments

This directory holds the Deployment + Service + HPA + PDB for each app named in [docs/03-infrastructure-deployment.md](../../docs/03-infrastructure-deployment.md) §5:

| App | Replicas (Phase 1) | Notes |
|---|---|---|
| `api-rest` | 2 | Fastify REST API |
| `api-graphql` | 1 | Pothos + Mercurius |
| `api-mcp` | 1 | MCP server |
| `dashboard` | 1 | Next.js merchant admin |
| `storefront` | 2 | Next.js multi-tenant storefronts |
| `marketing` | 1 | Public sparx.works marketing site |

## Adding a new app

1. Copy `api-rest.example.yaml` to `<app-name>.yaml`
2. `sed -i s/api-rest/<app-name>/g <app-name>.yaml`
3. Adjust resources to match the table in [docs/03 §5](../../docs/03-infrastructure-deployment.md)
4. Add `<app-name>.yaml` to `kustomization.yaml`

Until the apps actually exist (the `apps/` packages in the repo are scaffold-only), these manifests are templates — applying them will produce `ImagePullBackOff` because the images haven't been pushed.

## Shared env & secrets

All apps share two top-level config sources via `envFrom`:

- **`sparx-app-env` ConfigMap** — non-sensitive config (LOG_LEVEL, FEATURE_FLAGS_BACKEND, POSTGRES_HOST=pgbouncer, REDIS_URL=redis://redis:6379, etc.)
- **`sparx-app-secrets` Secret** — DATABASE_URL, BETTER_AUTH_SECRET, STRIPE_SECRET_KEY, etc.

The Secret is synced from Secret Manager (Phase 1: manual; Phase 2: External Secrets Operator). See [`scripts/sync-secrets.ps1`](../scripts/sync-secrets.ps1) (TBD).

## Workload Identity

All app Pods use `serviceAccountName: sparx-app`, which is annotated to impersonate the `sparx-app@PROJECT_ID.iam.gserviceaccount.com` GSA (created by Terraform). That GSA has roles for Cloud SQL, Secret Manager, Pub/Sub, and GCS. No JSON key files anywhere.
