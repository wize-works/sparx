# PgBouncer

Transaction-mode connection pooler in front of Cloud SQL Postgres. Required for RLS `SET LOCAL` to work correctly per [docs/03-infrastructure-deployment.md](../../docs/03-infrastructure-deployment.md) §8.

App pods connect to `pgbouncer.sparx-prod.svc.cluster.local:5432` — same wire protocol as Postgres itself.

The `edoburu/pgbouncer` image generates `pgbouncer.ini` from env vars at startup, so there's no ConfigMap — just a Secret with the host + password.

## Bootstrap secret

After `terraform apply`, sync the Cloud SQL private IP + `sparx_app` password into a k8s Secret:

```powershell
$pgHost = terraform -chdir=../../terraform/envs/prod output -raw cloud_sql_private_ip
$pgPass = terraform -chdir=../../terraform/envs/prod output -raw cloud_sql_app_password

kubectl create secret generic pgbouncer-secrets `
  --from-literal=POSTGRES_HOST=$pgHost `
  --from-literal=POSTGRES_PASSWORD=$pgPass `
  -n sparx-prod
```

## Password rotation

```powershell
gcloud sql users set-password sparx_app `
  --instance=$(terraform -chdir=../../terraform/envs/prod output -raw cloud_sql_instance_name) `
  --password=$NEW_PASSWORD

kubectl delete secret pgbouncer-secrets -n sparx-prod
# Recreate with the new password
kubectl rollout restart deployment pgbouncer -n sparx-prod
```
