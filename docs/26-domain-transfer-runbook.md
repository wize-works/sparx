# Sparx Platform — Domain Transfer Runbook

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. What this runbook covers

Moving eight Sparx-owned domains from GoDaddy (current registrar) to Cloudflare (new registrar + DNS). After this is complete, Cloudflare manages all platform DNS via Terraform.

| Domain | Purpose | Priority |
|---|---|---|
| `sparx.works` | Platform brand — app, api, mcp, marketing | **P0 — first** |
| `sparx.zone` | Tenant storefronts (`*.sparx.zone`, `customers.sparx.zone`). Shopify-style split for reputation isolation. | **P0 — also first** |
| `sparx.email` | Postal sending infrastructure **and** platform-to-merchant transactional emails (replaces planned `sparx.mx`) | P1 |
| `sparxcms.com` | CMS module marketing site | P2 |
| `sparxcrm.com` | CRM module marketing site | P2 |
| `sparxemail.com` | Email module marketing site | P2 |
| `sparxb2b.com` | B2B module marketing site | P2 |
| `sparx.host` | Managed hosting product marketing (301 → sparx.works/hosting for now) | P3 |
| `sparx.software` | Developer portal (301 → sparx.works/docs for now) | P3 |
| `sparx.market` | Future theme/plugin marketplace | P3 |
| `sparx.exchange` | Defensive (301 → sparx.works) | P3 |

`sparx.mx` was the original plan for Postal sending; it is already registered to a third party. `sparx.email` plays both the infrastructure-sending and merchant-facing roles.

Do transfers in the order above. `sparx.works` is the only one with live traffic risk; the rest are pre-launch.

---

## 2. Prerequisites

Before transferring **any** domain:

- [ ] Cloudflare account created (use `ops@sparx.works` or a shared org email)
- [ ] Payment method on file at Cloudflare (transfers cost ~$10/yr each at registrar cost)
- [ ] Each domain is at least 60 days old at GoDaddy (ICANN rule — new registrations are transfer-locked for 60 days)
- [ ] You have GoDaddy account access with permission to unlock + retrieve EPP codes
- [ ] You have the GCP `ingress_ip` from `terraform output` (so Cloudflare DNS points somewhere real before you flip `cloudflare_enabled=true`)

---

## 3. Per-domain transfer steps

Repeat for each domain in the order in §1.

### 3a. At GoDaddy (source registrar)

1. Sign in to GoDaddy → My Products → DNS / Domain Management
2. Open the domain → **Settings** → **Domain Lock** → **Unlock**
3. **Transfer** → **Get authorization code** (a.k.a. EPP code). GoDaddy emails it to the registrant.
4. Verify the registrant email on file is one you can read **right now**. The transfer confirmation email goes there and must be acted on within ~5 days.
5. If the domain uses GoDaddy's WHOIS privacy, **disable it temporarily** — some registries reject transfers when privacy proxies hide contact info.

### 3b. At Cloudflare (destination)

1. Cloudflare dashboard → **Domain Registration** → **Transfer Domains**
2. Enter the domain name → click **Continue**
3. Paste the EPP/auth code from GoDaddy → confirm contact info
4. Pay (single-year renewal is bundled with the transfer)
5. Cloudflare sends a confirmation request — most TLDs auto-approve within minutes; some take up to 5 days

While the transfer is in flight, Cloudflare will offer to **add the zone to DNS management** even before the registrar transfer completes. **Do this immediately** — it lets you pre-stage DNS records.

### 3c. Pre-stage DNS records at Cloudflare

For `sparx.works` specifically, before the registrar transfer completes:

1. In Cloudflare → **DNS** → **Add record** for `sparx.works`:
   - Copy the existing GoDaddy records first so nothing breaks during the cutover.
2. Note the two Cloudflare nameservers Cloudflare assigns (e.g. `ada.ns.cloudflare.com`, `bruno.ns.cloudflare.com`).
3. **Back at GoDaddy:** change the domain's nameservers to those two Cloudflare nameservers. DNS authority now sits with Cloudflare even though the registrar transfer is still pending.
4. Wait ~10 minutes, verify with `dig sparx.works NS`.

This decouples DNS migration from registrar migration — if anything goes wrong with the registrar transfer, traffic still flows via the new Cloudflare DNS.

### 3d. After transfer completes

1. In Cloudflare → domain shows as **Active**
2. Set **Auto-renew = ON** for every domain
3. For `sparx.works` and `sparx.email` — also enable **DNSSEC** (Cloudflare → DNS → Settings)

---

## 4. Flipping Sparx to Cloudflare-managed DNS

Once `sparx.works` is on Cloudflare nameservers (step 3c) — even before registrar transfer completes — Terraform can manage records.

### 4a. Create a scoped Cloudflare API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token**

- Template: **Edit zone DNS**
- Permissions: `Zone — DNS — Edit`, `Zone — Zone — Read`
- Zone Resources: **Include** → **Specific zone** → `sparx.works` (repeat token or include other zones as they land)
- TTL: no expiry (rotate manually per [docs/16-auth-security.md](16-auth-security.md))

Copy the token — it shows once.

### 4b. Store and apply

```powershell
# Add to Secret Manager so it's not in plaintext anywhere on disk
echo $CLOUDFLARE_TOKEN | gcloud secrets versions add cloudflare-api-token --data-file=-

# Set the Terraform variables
cd terraform/envs/prod
$env:TF_VAR_cloudflare_enabled = "true"
$env:TF_VAR_cloudflare_api_token = $CLOUDFLARE_TOKEN

terraform plan
terraform apply
```

Terraform will create:
- `sparx.works` records: `@`, `www`, `app`, `api`, `mcp`, `*`, `customers` — all pointing at the ingress IP from [terraform/envs/prod/main.tf](../terraform/envs/prod/main.tf)
- Cloudflare proxy ON for `app`/`api`/`mcp`/`@`/`www`; OFF for `*` and `customers` (Caddy on-demand TLS needs to terminate)

### 4c. Flip the monitoring switch

After DNS resolves, set `public_domains_active = true` so Cloud Monitoring uptime checks come online:

```hcl
# terraform/envs/prod/terraform.tfvars
cloudflare_enabled = true   # this currently doubles as the uptime-check trigger
```

(`var.public_domains_active` in the monitoring module is wired through from `var.cloudflare_enabled`.)

---

## 5. Verification

Once each domain is live:

```powershell
# DNS resolves to ingress IP
dig +short sparx.works @1.1.1.1
dig +short api.sparx.works @1.1.1.1
dig +short customers.sparx.zone @1.1.1.1
dig +short acme.sparx.zone @1.1.1.1   # any subdomain — wildcard

# SSL works (after Caddy issues certs)
curl -I https://api.sparx.works/health
curl -I https://app.sparx.works

# Nameservers are Cloudflare
dig +short NS sparx.works
```

Expected:
- All A records resolve to the same IP (the GCP L4 ingress)
- `https://` works on the proxied hostnames (Cloudflare cert)
- `https://*.sparx.zone` works for any slug that exists in the database (Caddy on-demand Let's Encrypt cert)
- `https://customers.sparx.zone` is reachable but probably returns a 404 from Caddy — it's a target, not a real host

---

## 6. Postal / sparx.email records

`sparx.email` is the email sending domain (after the `sparx.mx` plan fell through). After transferring it:

1. Get the Postal SMTP service's external IP (after `helm install postal` per [k8s/postal/README.md](../k8s/postal/README.md))
2. Add to Terraform (`terraform/envs/prod/cloudflare.tf` — currently stubbed with TODOs):
   - `mail.sparx.email` A → Postal SMTP IP
   - `@` MX → `mail.sparx.email` priority 10
   - `@` TXT (SPF) → `v=spf1 ip4:<postal-ip> ~all`
   - `dkim._domainkey` TXT → DKIM public key from Postal
   - `_dmarc` TXT → `v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email`
3. Validate via [mxtoolbox.com](https://mxtoolbox.com) (SPF, DKIM, DMARC look good)
4. Send a test email from Postal's web UI → verify it lands in Gmail/Outlook with no SPF/DKIM failures

---

## 7. Rollback

If a transfer goes wrong mid-flight:

| Stage | Reverse by |
|---|---|
| EPP code obtained, nameservers still at GoDaddy | Re-lock at GoDaddy. No customer impact. |
| Nameservers moved to Cloudflare, traffic flowing | Re-point nameservers back at GoDaddy via the GoDaddy console. ~10 min TTL recovery. |
| Registrar transfer initiated, pending | Reject the confirmation email at GoDaddy — transfer cancels. |
| Registrar transfer completed | Initiate a transfer back to GoDaddy. 60-day registrar lock applies first. |

`sparx.works` is the only one with live customer impact during the transfer window — keep the rollback window for it under one business day.

---

## 8. Tracking

Use the kanNINJA board for transfer status. One card per domain, with these states:

```
GoDaddy unlocked → EPP retrieved → Transfer initiated → NS at Cloudflare → Registrar moved → Auto-renew ON → DNSSEC ON
```
