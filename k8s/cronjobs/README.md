# CRM scheduled jobs

Four Kubernetes `CronJob` resources that POST to `/internal/crm/*` on api-rest. Each job runs once per day in a small `curlimages/curl` container and is the production wiring for the schedulers under [packages/crm/src/schedulers/](../../packages/crm/src/schedulers/).

| CronJob                   | Schedule    | Endpoint                                 | Why this time                              |
| ------------------------- | ----------- | ---------------------------------------- | ------------------------------------------ |
| `crm-partition-rollover`  | `0 2 * * *` | `POST /internal/crm/partition-rollover`  | Earliest — keeps `crm_activities` writable |
| `crm-automation-triggers` | `0 3 * * *` | `POST /internal/crm/automation-triggers` | After partition is guaranteed              |
| `crm-overdue-reminders`   | `0 4 * * *` | `POST /internal/crm/overdue-reminders`   | Mid-morning UTC ≈ early US workday         |
| `crm-segment-recompute`   | `0 5 * * *` | `POST /internal/crm/segment-recompute`   | Latest — heaviest, runs after the rest     |

All schedules are UTC. All endpoints are guarded by the
`X-Sparx-Internal-Cron-Token` shared secret, sourced from the
`sparx-app-secrets` Secret (key: `SPARX_INTERNAL_CRON_TOKEN`).

## Adding the secret

The CronJobs assume `sparx-app-secrets.SPARX_INTERNAL_CRON_TOKEN` is set.
If you bootstrap a fresh cluster:

```
openssl rand -hex 32 | \
  gcloud secrets create sparx-internal-cron-token --data-file=-
```

…then add `SPARX_INTERNAL_CRON_TOKEN` to the External Secrets / kustomize
mapping for `sparx-app-secrets`.

## Why CronJobs and not Cloud Scheduler

Cloud Scheduler would work too, but it would put authentication of an
in-cluster HTTP path behind a GCP-IAM concept (OIDC tokens) — which means
api-rest would have to verify Google-signed JWTs. The shared-secret
approach keeps the endpoint's trust boundary inside the cluster, which is
where it already lives (the route is `ClusterIP`-only).

## Applying

```
kubectl apply -k k8s/cronjobs/
```

…or it lands on a `components=all-platform` bootstrap run once it's
referenced by `.github/workflows/bootstrap.yml`.
