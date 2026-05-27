# WizeWorks Platform — Domain & SSL Automation

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

Every WizeWorks merchant gets a live HTTPS storefront the moment they sign up — no configuration required. The domain system handles three scenarios:

1. **Platform subdomain** (instant, automatic): `merchantslug.wizeworks.com`
2. **Custom domain** (self-serve, automated): `theirstore.com` or `shop.theirstore.com`
3. **Enterprise managed domain** (WizeWorks manages DNS entirely): full DNS delegation

---

## 2. Platform Subdomain (Instant)

### How It Works
At merchant signup, a `slug` is chosen or auto-generated from business name:
```
Business: "Acme Parts Co"  →  slug: "acme-parts"
Storefront URL: https://acme-parts.wizeworks.com
```

### Infrastructure
- **Wildcard DNS:** `*.wizeworks.com → GKE ingress load balancer IP` (set once, never changed)
- **Wildcard SSL:** Single wildcard cert for `*.wizeworks.com` via Let's Encrypt, auto-renewed
- **Caddy routing:** Reads `Host` header, extracts slug, looks up tenant in `domains` table, proxies to storefront

### Slug Rules
- 3–63 characters, lowercase alphanumeric + hyphens
- Must be unique across all tenants
- Slug availability checked in real-time during signup
- Reserved slugs: `www`, `api`, `app`, `admin`, `dashboard`, `mail`, `docs`, `status`, `cdn`

---

## 3. Custom Domain (Self-Serve, Automated)

### Merchant Flow (UI)
1. Merchant navigates to **Settings → Domains**
2. Enters their domain: `theirstore.com` or `shop.theirstore.com`
3. Platform displays DNS records to add:
   ```
   Type: CNAME
   Name: shop (or @)
   Value: customers.wizeworks.com
   TTL: Auto
   ```
4. Merchant adds record to their DNS provider (Cloudflare, GoDaddy, Namecheap, etc.)
5. Platform polls for propagation — shows live status indicator
6. Once verified: SSL cert issued automatically, custom domain goes live
7. Platform subdomain (`slug.wizeworks.com`) redirects 301 to custom domain

### Backend Flow

```
POST /api/domains
{
  "domain": "shop.acme.com"
}

→ Validate format (RFC 1035)
→ Check domain not already claimed by another tenant
→ Insert into domains table:
  {
    tenant_id, domain, status: "pending",
    verification_token: uuid, created_at
  }
→ Return DNS instructions to merchant
→ Enqueue domain verification job (runs every 5 min)
```

### Domain Verification Worker

```typescript
async function verifyDomain(domain: DomainRecord) {
  // Check CNAME points to our infrastructure
  const cnameTarget = await dns.resolveCname(domain.domain)
  if (!cnameTarget.includes('customers.wizeworks.com')) {
    await updateDomainStatus(domain.id, 'pending', 'CNAME not yet propagated')
    return
  }

  // Mark as verified
  await updateDomainStatus(domain.id, 'verified', null)
  
  // Trigger SSL provisioning
  await pubsub.publish('domain.verified', { domainId: domain.id })
}
```

### SSL Provisioning (Caddy On-Demand TLS)

Caddy is configured with `on_demand_tls` which issues Let's Encrypt certs on first HTTPS request:

```caddyfile
{
  on_demand_tls {
    ask http://api-service/internal/domain-check
    interval 2m
    burst 5
  }
}

:443 {
  tls {
    on_demand
  }
  reverse_proxy storefront-service:3000
}
```

The `/internal/domain-check` endpoint returns 200 only if:
- Domain exists in `domains` table
- `status = 'verified'`
- Domain belongs to an active tenant

This prevents unauthorized cert issuance.

### Cloudflare Detection (Fast Path)

If the merchant's domain is proxied through Cloudflare, we detect this and can offer an even faster setup path using the Cloudflare API to add the CNAME record automatically (requires merchant to connect their Cloudflare account via OAuth).

---

## 4. Domain Table Schema

```sql
CREATE TABLE domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  domain          VARCHAR(253) NOT NULL UNIQUE,
  type            VARCHAR(20) NOT NULL DEFAULT 'custom', -- 'subdomain' | 'custom' | 'managed'
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'verified' | 'active' | 'failed'
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  ssl_status      VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'provisioned' | 'failed'
  ssl_expires_at  TIMESTAMPTZ,
  verified_at     TIMESTAMPTZ,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_domains_tenant ON domains(tenant_id);
CREATE INDEX idx_domains_status ON domains(status) WHERE status = 'pending';
```

---

## 5. Email Domain Authentication (DKIM/SPF/DMARC)

When a merchant sets up a custom domain, WizeWorks also automates email authentication records so their transactional emails come from their own domain.

### Records Required

```
Type: TXT
Name: @
Value: v=spf1 include:_spf.wizeworks.com ~all

Type: TXT  
Name: ww._domainkey
Value: v=DKIM1; k=rsa; p=[generated-public-key]

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@wizeworks.com
```

### Flow
1. When custom domain is added, platform generates DKIM keypair per tenant
2. Private key stored in Google Secret Manager
3. Public key displayed as DNS record for merchant to add
4. Platform validates all three records (SPF, DKIM, DMARC)
5. Once validated, outbound emails use `From: store@theirdomain.com`
6. Before custom domain: emails send from `store@slug.wizeworks.com`

### Validation Worker

```typescript
async function validateEmailRecords(domain: string, tenantId: string) {
  const [spf, dkim, dmarc] = await Promise.all([
    validateSPF(domain),
    validateDKIM(domain, tenantId),
    validateDMARC(domain)
  ])
  
  await updateTenantEmailAuth(tenantId, { spf, dkim, dmarc })
  
  if (spf && dkim && dmarc) {
    await enableCustomEmailDomain(tenantId, domain)
    await pubsub.publish('email.domain.verified', { tenantId, domain })
  }
}
```

---

## 6. Domain Health Monitoring

- SSL expiry checked daily; renewal triggered 30 days before expiry
- Domain resolution checked every 15 minutes for active custom domains
- Merchant notified via email + dashboard alert if domain stops resolving
- Automatic fallback to subdomain if custom domain fails for > 1 hour

---

## 7. Enterprise: Managed DNS

Enterprise clients can delegate their entire DNS zone to WizeWorks (via Cloudflare nameservers). In this case:
- WizeWorks manages all DNS records
- Custom domain setup is instant (no merchant action required)
- Email records configured automatically
- Full DNS audit log available in dashboard
