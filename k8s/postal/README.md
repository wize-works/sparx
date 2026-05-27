# Postal (Self-Hosted Email)

Postal is a non-trivial multi-service deployment (web, SMTP, workers, MariaDB, RabbitMQ). Rather than hand-roll YAML, **install via the official Helm chart**:

```
https://github.com/postalserver/helm-charts
```

## Install

```powershell
helm repo add postal https://postalserver.github.io/helm-charts
helm repo update

# Review and customise:
cp values.example.yaml values.yaml
# edit values.yaml — set the sparx.email domain, DKIM key, MariaDB password, etc.

helm install postal postal/postal `
  --namespace sparx-prod `
  --values values.yaml
```

## Sparx-specific config

- **Sending domain:** `sparx.email` (see [docs/02-architecture-overview.md](../../docs/02-architecture-overview.md) §7)
- **Inbound webhooks for bounces/complaints:** Postal posts to `api-rest.sparx-prod.svc.cluster.local:3000/internal/postal/webhook`
- **Per-tenant DKIM signing:** generated at custom-domain setup time, stored in Secret Manager, loaded by Postal via its credential API
- **Dedicated IPs:** Phase 1 = shared. Phase 2 trigger = first merchant email-reputation complaint (per [docs/03 §3](../../docs/03-infrastructure-deployment.md))

## DNS records to add (Cloudflare, after Postal is live)

These are stubbed as TODO in [terraform/envs/prod/cloudflare.tf](../../terraform/envs/prod/cloudflare.tf) — fill in once the DKIM public key is known and Postal's SMTP IP is assigned:

| Type | Name | Value |
|------|------|-------|
| MX | `@` (sparx.email) | `mail.sparx.email` priority 10 |
| TXT | `@` | `v=spf1 ip4:<postal-ip> ~all` |
| TXT | `dkim._domainkey` | `v=DKIM1; k=rsa; p=<public-key>` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email` |
| A | `mail` | `<postal-smtp-ingress-ip>` |
