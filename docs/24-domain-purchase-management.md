# Sparx Platform — Domain Purchase & Management Spec

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

Sparx integrates with the GoDaddy Reseller API to allow merchants to search, purchase, and instantly connect a custom domain during onboarding or from the dashboard. Domain goes live with HTTPS and email authentication in under 60 seconds. No DNS configuration required. No registrar login. No CNAME records to add manually.

This is a genuine differentiator. No other commerce platform does native domain purchase with instant automatic connection.

**Why GoDaddy Reseller (not Cloudflare Registrar):** WizeWorks has held a GoDaddy reseller account for 20 years. Wholesale pricing established, account standing proven, full TLD catalog, API access already in good standing. Build against it immediately.

---

## 2. The Merchant Experience

During onboarding Step 4, instead of just showing the `sparx.works` subdomain:

```
Search input: [acme parts] [Search]

Results:
  acmeparts.com     $12.99/yr  ✅ Available  [Purchase & Connect]
  acme-parts.com    $12.99/yr  ✅ Available  [Purchase & Connect]
  acmeparts.shop     $3.99/yr  ✅ Available  [Purchase & Connect]
  acmeparts.co       $9.99/yr  ✅ Available  [Purchase & Connect]

Already have a domain? [Connect existing domain →]
```

After clicking **Purchase & Connect**:

- ✅ Domain registered
- ✅ DNS configured automatically
- ✅ SSL certificate issued
- ✅ Email authentication active

> Your store is now live at: `https://acmeparts.com`

Total time from click to live HTTPS store: **under 60 seconds**.

---

## 3. GoDaddy Reseller API Integration

**Auth:** `sso-key {GODADDY_API_KEY}:{GODADDY_API_SECRET}` header. Credentials in Secret Manager.

- **OTE (staging):** `api.ote-godaddy.com`
- **Production:** `api.godaddy.com`

### Domain Availability Check

```
GET /v1/domains/available?domain={domain}&checkType=FAST
```

Returns: `domain`, `available` (bool), `price` (cents), `currency`, `period` (years), `tld`.

### Domain Suggestions

```
GET /v1/domains/suggest?query={query}&tlds=com,net,org,co,io,shop,store,app&limit=10
```

Returns array of domain suggestions with availability and pricing for each.

### Domain Purchase

```
POST /v1/domains/purchase
```

Body fields: `domain`, `period` (years), `renewAuto: true`, `privacy: false`, `consent` (`agreedAt`, `agreedBy`, `agreementKeys: ['DNRA']`), `contactAdmin`/`Billing`/`Registrant`/`Tech` (`firstName`, `lastName`, `email`, `phone`, `address`, `city`, `state`, `postalCode`, `country`).

Returns: `orderId`.

### Automatic DNS Configuration

After purchase, immediately call `PUT /v1/domains/{domain}/records` to replace ALL DNS with Sparx config:

| Type  | Name              | Value                                   | TTL  |
|-------|-------------------|-----------------------------------------|------|
| CNAME | `@`               | `customers.sparx.zone`                 | 600  |
| CNAME | `www`             | `customers.sparx.zone`                 | 600  |
| TXT   | `@`               | `v=spf1 include:_spf.sparx.email ~all`     | 3600 |
| TXT   | `sparx._domainkey`| `v=DKIM1; k=rsa; p={tenant-public-key}` | 3600 |
| TXT   | `_dmarc`          | `v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email` | 3600 |
| MX    | `@`               | `mail.sparx.email` (priority 10)           | 3600 |

GoDaddy DNS propagates in seconds for newly registered domains (GoDaddy controls authoritative NS). Domain live in under 30 seconds.

---

## 4. The Full Purchase Flow

1. Stripe charge (domain price + Sparx convenience fee) → payment confirmed
2. GoDaddy Reseller API: purchase domain → `orderId` returned (~2–5 seconds)
3. GoDaddy DNS API: configure all records → ~1–2 seconds, propagates in seconds
4. Sparx DB: create domain record, `status: pending_ssl`
5. Pub/Sub: `domain.purchased` event → domain worker → validates DNS → marks `verified`
6. Caddy on-demand TLS: cert issued on first HTTPS request
7. Domain status: `active`, `ssl_status: provisioned`
8. **Total:** ~30–60 seconds from purchase to live HTTPS store

---

## 5. Domain Lifecycle Management

### Renewal

Nightly cron checks domains expiring within 30 days. Email notifications at: 30 days, 14 days, 7 days, day of expiry. GoDaddy handles auto-renewal (`renewAuto: true` at purchase). Sparx charges merchant's saved payment method before GoDaddy charges us.

### Transfer Out (Merchant Cancels Sparx)

Merchant owns their domain and can take it:

1. `PATCH /v1/domains/{domain}` → `locked: false`
2. `GET /v1/domains/{domain}/transferOut` → returns `authCode`
3. Email auth code to merchant
4. Merchant transfers to their own registrar

### WHOIS Privacy (Optional Upsell)

```
PATCH /v1/domains/{domain} → privacy: true
```

Price: ~$7.99/yr. Shown as optional add-on at purchase time.

---

## 6. Pricing & Revenue

Display: reseller wholesale cost + Sparx convenience fee (~$1.50–3.00 depending on TLD).

Suggested markups:

| TLD            | Markup  |
|----------------|---------|
| `.com`/`.net`/`.org` | +$2.00 |
| `.io`/`.app`         | +$3.00 |
| `.shop`/`.store`     | +$1.50 |

Domain purchases are separate Stripe charges (not subscription items). PaymentIntent with customer's saved payment method, confirm immediately, metadata includes `domain`/`years`/`tenantId`.

---

## 7. Database Schema Updates

Add to `domains` table:

- `registrar` (VARCHAR 50: `'godaddy'` | `null`)
- `registrar_order_id` (VARCHAR 255)
- `type` (VARCHAR 20: `'subdomain'` | `'custom'` | `'purchased'`)
- `registered_at` (TIMESTAMPTZ)
- `expires_at` (TIMESTAMPTZ)
- `auto_renew` (BOOLEAN DEFAULT true)
- `whois_privacy` (BOOLEAN DEFAULT false)
- `renewal_price_cents` (INTEGER)

New table `domain_purchases`:

- `id` (UUID PK) | `tenant_id` (FK) | `domain` | `registrar` | `registrar_order_id`
- `stripe_payment_intent_id` | `amount_cents` | `years` | `type` (`registration`/`renewal`/`transfer`) | `status` | `created_at`

---

## 8. API Endpoints

| Method | Path                          | Body                            | Returns                              |
|--------|-------------------------------|---------------------------------|--------------------------------------|
| POST   | `/v1/domains/search`          | `{ query }`                     | `DomainSuggestion[]`                 |
| POST   | `/v1/domains/check`           | `{ domain }`                    | `DomainAvailability`                 |
| POST   | `/v1/domains/purchase`        | `{ domain, years, privacy }`    | `{ domain, orderId, expiresAt }`     |
| POST   | `/v1/domains/:id/renew`       | `{ years }`                     | `{ domain, expiresAt }`              |
| POST   | `/v1/domains/:id/transfer-out`| —                               | `{ authCode }`                       |
| PATCH  | `/v1/domains/:id/privacy`     | `{ enabled }`                   | `{ domain, privacy }`                |
| PATCH  | `/v1/domains/:id/auto-renew`  | `{ enabled }`                   | `{ domain, autoRenew }`              |

---

## 9. Dashboard UI

**Onboarding Step 4:** Search input with 300ms debounced suggestions, results with pricing, "Purchase & Connect" button → payment confirmation modal → progress steps → success screen.

**Settings → Domains panel:** List all domains with status indicators (`Active`, `Pending DNS`, `SSL provisioning`, `Expiring soon`), per-domain actions (Set primary, Renew, Enable privacy, Transfer out, Remove), "Find a new domain" button, renewal calendar.

Status badges: **orange** = expiring < 30 days, **red** = expiring < 7 days.

---

## 10. GoDaddy OTE (Test Environment)

Full test environment at `api.ote-godaddy.com` — no real money, no real domains, full API parity. All development and staging testing uses OTE.

Secret Manager keys:

- `GODADDY_API_KEY_OTE` / `GODADDY_API_SECRET_OTE`
- `GODADDY_API_KEY_PROD` / `GODADDY_API_SECRET_PROD`

Application reads OTE in staging, production credentials in prod environment.

---

## 11. MCP Integration

Tools exposed to AI/MCP server:

- `get_domains()` → lists all merchant domains
- `check_domain_availability(domain)` → availability + pricing
- `suggest_domains(query)` → available suggestions for business name
- `purchase_domain(domain, years)` → **requires explicit confirmation before executing**

Example:

```
"Find me a good domain for my diesel parts business"
→ suggest_domains("diesel parts")
→ "Found dieselpartsco.com for $12.99/yr. Confirm purchase?"
→ On confirm: purchases, configures DNS, domain live in 60 seconds
```

---

## 12. Implementation Checklist

- [ ] Store GoDaddy OTE + Prod API credentials in Secret Manager
- [ ] Implement GoDaddy client with auth header
- [ ] Implement `checkAvailability`, `getDomainSuggestions`, `purchaseDomain`, `configureDNS`
- [ ] Implement DKIM keypair generation per tenant
- [ ] Update domain DB schema + migrations
- [ ] Implement Stripe charge for domain purchase
- [ ] Implement renewal worker (nightly cron)
- [ ] Implement renewal notification emails via Postal
- [ ] Implement transfer-out flow (unlock + get auth code)
- [ ] Implement WHOIS privacy toggle
- [ ] Build onboarding Step 4 domain search UI
- [ ] Build Settings → Domains management panel
- [ ] Add domain expiry dashboard badges
- [ ] Test full flow in GoDaddy OTE before production
- [ ] Add domain purchase events to audit log
- [ ] Add MCP tools: `get_domains`, `check_domain_availability`, `suggest_domains`, `purchase_domain`
