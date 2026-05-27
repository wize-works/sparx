# One-Off Jobs

## `migrate.yaml`

Applied by [deploy-prod.yml](../../.github/workflows/deploy-prod.yml) on each release. Runs `prisma migrate deploy` against Cloud SQL via PgBouncer.

The Job runs in-cluster (where the Cloud SQL private IP is reachable) so we don't need the Cloud SQL Auth Proxy. The image is the latest `api-rest` build — migrations live alongside the API code in the `@sparx/db` workspace.

### Manual run

If you need to apply migrations outside of a deploy:

```powershell
$tag = "v1.2.3"
$project = terraform -chdir=terraform/envs/prod output -raw project_id
$suffix = (Get-Date -UFormat %s).Substring(5)

(Get-Content k8s/jobs/migrate.yaml) `
  -replace 'IMAGE_TAG', $tag `
  -replace 'PROJECT_ID', $project `
  -replace 'JOB_SUFFIX', $suffix |
  kubectl apply -f -

kubectl wait --for=condition=complete --timeout=15m `
  job/sparx-migrate-$suffix -n sparx-prod

kubectl logs job/sparx-migrate-$suffix -n sparx-prod
```

### Rollback

Prisma migrations are forward-only — per [docs/03 §8](../../docs/03-infrastructure-deployment.md): "Database migrations are forward-only. Schema rollbacks are a new forward migration." Never `prisma migrate reset` in production.
