# Postal — self-hosted email infrastructure

Self-hosted SMTP relay for all outbound Sparx email. Sends to recipient MX hosts directly; `email-worker` POSTs to its HTTP API. Lives in the `postal` namespace, separate from `sparx-prod`.

## What's in this directory

| File                 | What                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `namespace.yaml`     | `postal` Namespace + ServiceAccount                                 |
| `mariadb.yaml`       | Single-replica MariaDB 11.4 StatefulSet (20Gi `standard-rwo`)       |
| `rabbitmq.yaml`      | Single-replica RabbitMQ 3.13 StatefulSet (5Gi `standard-rwo`)       |
| `secrets.yaml`       | Template for `postal-secrets` — real values synced from Secret Mgr  |
| `config.yaml`        | `postal.yml` ConfigMap (DB/AMQP wiring, DNS hostnames)              |
| `bootstrap-job.yaml` | `postal initialize` Job (schema migrate; idempotent)                |
| `web.yaml`           | Postal Web (HTTP API + admin UI) Deployment + ClusterIP Service     |
| `worker.yaml`        | Postal Worker Deployment (SMTP send queue consumer)                 |
| `smtp.yaml`          | Postal SMTP Deployment + ClusterIP Service (port 25, internal only) |
| `cron.yaml`          | Postal Cron Deployment (scheduled cleanup tasks)                    |
| `kustomization.yaml` | Resource list for `kubectl apply -k`                                |

## Why not the Helm chart

Per the project's no-Helm preference. Hand-authored YAML matches the `k8s/redis/`, `k8s/pgbouncer/`, `k8s/caddy/` conventions and is easier to grep / review. The Helm chart's values.yaml indirection obscured the multi-process architecture (web/worker/smtp/cron from a single image with different `postal <cmd>` entrypoints).

## Storage choice — `standard-rwo` (pd-balanced)

Both StatefulSets force `standard-rwo` explicitly. Reason: the project's `SSD_TOTAL_GB` quota is constrained (210/250GB used by Autopilot node boot disks + Cloud SQL). pd-balanced counts under `DISKS_TOTAL_GB` (2048GB, ~empty) instead. Postal's IOPS profile doesn't justify pd-ssd at our scale; if we ever hit issues, switch MariaDB alone to `premium-rwo` and request the SSD quota bump.

## Initial deployment (zero → running)

Run once by ops. Re-running is safe — every step is idempotent.

### 1. Create the GCP Secret Manager entries

Five secrets must exist BEFORE the bootstrap workflow runs:

```powershell
$mariadbRoot = -join ((33..126) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
$postalDb    = -join ((33..126) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
$rabbitmq    = -join ((33..126) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
$railsKey    = [Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))

$mariadbRoot | gcloud secrets create postal-mariadb-root-password --data-file=- --project=sparxworks
$postalDb    | gcloud secrets create postal-db-password           --data-file=- --project=sparxworks
$rabbitmq    | gcloud secrets create postal-rabbitmq-password     --data-file=- --project=sparxworks
$railsKey    | gcloud secrets create postal-rails-secret-key      --data-file=- --project=sparxworks
```

`postal-signing-key` is created automatically by `postal initialize` on first boot — leave it empty until then (the workflow warns and skips it on first run).

### 2. Bootstrap Postal via the workflow

```powershell
gh workflow run bootstrap.yml -f components=postal
```

The workflow:

1. Creates the `postal` namespace + ServiceAccount.
2. Syncs secrets into three k8s Secrets (`mariadb-credentials`, `rabbitmq-credentials`, `postal-secrets`).
3. Applies MariaDB + RabbitMQ StatefulSets and waits Ready (~2 min cold).
4. Applies `postal.yml` ConfigMap and the `postal-initialize` Job, waits Complete (~30 sec).
5. Applies Web / SMTP / Worker / Cron Deployments and waits Ready.

When it returns green, Postal is up but has no admin user, no organization, no servers, no SMTP credentials.

### 3. Create the admin user

`postal make-user` is interactive — it asks for email/password from stdin:

```powershell
$pod = kubectl get pod -n postal -l app=postal-web -o jsonpath='{.items[0].metadata.name}'
kubectl exec -it -n postal $pod -- postal make-user
# Email:    ops@sparx.works
# Name:     Sparx Operator
# Password: <generate something strong and save it in your password manager>
```

### 4. Export the signing key to Secret Manager

Postal generates an RSA key pair during `initialize` and stores it in MariaDB. Mirror it into Secret Manager so a future pod restart (which re-pulls `postal-secrets` from SM) doesn't reset DKIM and break sender reputation:

```powershell
$pod = kubectl get pod -n postal -l app=postal-web -o jsonpath='{.items[0].metadata.name}'
$signingKey = kubectl exec -n postal $pod -- cat /opt/postal/config/signing.key
echo $signingKey | gcloud secrets create postal-signing-key --data-file=- --project=sparxworks
# Re-sync so the cluster Secret picks up the new SM value
gh workflow run bootstrap.yml -f components=postal
```

### 5. Create the Postal organization, server, and credential

In the Postal admin UI at <https://postal.sparx.email>:

1. **Organization** → "Sparx".
2. **Server** under that org → "Sparx Transactional", mode = Live, domain = `sparx.email`.
3. **Credentials** under that server → API → name "email-worker" → save the generated API key.
4. **Domains** under that server → add `sparx.email` → copy the DKIM public key from the DNS Setup page.

### 6. Wire the API key into the platform

```powershell
echo "<paste the API key>" | gcloud secrets create postal-api-key --data-file=- --project=sparxworks
gh workflow run bootstrap.yml -f components=app-secrets
```

This syncs `postal-api-key` into `sparx-app-secrets` as `POSTAL_API_KEY` and rolls all `tier=api|web` Deployments so `email-worker` picks it up.

### 7. Populate the DKIM record in Terraform

From step 5 you have the DKIM TXT value (full `v=DKIM1; k=rsa; p=...` string). Set it as the `sparx_email_dkim_value` variable:

```hcl
# terraform/envs/prod/terraform.tfvars (or wherever you keep secrets)
sparx_email_dkim_value = "v=DKIM1; k=rsa; p=MIGfMA0G..."
```

Then `terraform apply` from `terraform/envs/prod/`.

### 8. Flip the email provider

Once `postal-api-key` is in `sparx-app-secrets`, edit `k8s/sparx-prod/app-env-configmap.yaml`:

```yaml
SPARX_EMAIL_PROVIDER: postal # was: console
```

Apply via `gh workflow run bootstrap.yml -f components=app-env`. `email-worker` reads the new value on next pod restart and starts relaying through Postal instead of logging to stdout.

## Day-2 operations

### Send a test email through the full pipeline

```powershell
# After signup is working, trigger a password reset from the dashboard UI —
# email-worker picks up the email.send event, renders via @sparx/email,
# and POSTs to Postal. Watch logs in two terminals:
kubectl logs -n sparx-prod -l app=email-worker -f
kubectl logs -n postal -l app=postal-web -f
```

### Re-run schema migrations after a Postal version bump

```powershell
kubectl -n postal delete job postal-initialize
gh workflow run bootstrap.yml -f components=postal
```

The Job is idempotent — it only applies new migrations.

### Rotate the Rails secret key

⚠️ Existing session cookies on the Postal admin UI become invalid after rotation.

```powershell
$newKey = [Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
echo $newKey | gcloud secrets versions add postal-rails-secret-key --data-file=- --project=sparxworks
gh workflow run bootstrap.yml -f components=postal
```

### Wipe and start over (dev / staging only — never in prod)

```powershell
kubectl delete namespace postal
# Wait for finalizers, then re-run:
gh workflow run bootstrap.yml -f components=postal
```

## Architecture cross-references

- **Brand decision:** Postal on `sparx.email`, not SendGrid/Postmark/SES — see [CLAUDE.md](../../CLAUDE.md) → "Email goes through self-hosted Postal".
- **Pub/Sub-default email flow:** publishers → `email.send` topic → `email-worker` → Postal HTTP API. Direct `sendTemplate()` from `@sparx/email` is the OTP escape hatch only.
- **DNS / Cloudflare records:** [terraform/envs/prod/cloudflare.tf](../../terraform/envs/prod/cloudflare.tf) → `sparx_email_*` resources.
- **Caddy routing:** [k8s/caddy/configmap.yaml](../caddy/configmap.yaml) → `postal.sparx.email` block.
