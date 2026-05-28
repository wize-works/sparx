# Cloudflare DNS for all Sparx-owned zones.
#
# Gated by var.cloudflare_enabled. Flip to true once:
#   1. Zones are added in Cloudflare (data sources look them up by name)
#   2. var.cloudflare_api_token is set (Zone:DNS:Edit scoped to these zones)
#
# Proxied vs DNS-only:
#   - sparx.works (app/api/mcp/marketing) → proxied = true (Cloudflare CDN + WAF)
#   - sparx.zone (*.sparx.zone, customers.sparx.zone) → proxied = false
#     Caddy on-demand TLS needs Let's Encrypt to reach origin directly,
#     and tenant custom domains CNAME to customers.sparx.zone expecting
#     a real origin (per docs/04 §3).
#
# Domain split (Shopify-style):
#   - sparx.works = platform itself (dashboard, API, marketing, MCP server)
#   - sparx.zone  = where tenant storefronts actually run (acme.sparx.zone)
#     Reputation isolation: a tenant getting flagged doesn't hit the platform's
#     domain reputation. Cookie scoping: app.sparx.works sessions cannot leak
#     into tenant stores.
#
# Sister zones (sparx.host, sparx.software, etc.) get apex + www A records
# pointing at the ingress IP — Caddy host-matches and 301-redirects them
# to the correct sparx.works path (see k8s/caddy/configmap.yaml).
#
# sparx.email is special — it's the Postal sending domain. The MX/SPF/DKIM/
# DMARC records are stubbed as TODO until Postal is deployed and its SMTP IP
# and DKIM public key are known. See docs/26-domain-transfer-runbook.md §6.

# =========================================================================
# sparx.works — primary platform domain
# =========================================================================

data "cloudflare_zone" "sparx_works" {
  count = var.cloudflare_enabled ? 1 : 0
  name  = "sparx.works"
}

resource "cloudflare_record" "sparx_works_root" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_works[0].id
  name            = "@"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
  comment         = "Marketing site"
}

resource "cloudflare_record" "sparx_works_www" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_works[0].id
  name            = "www"
  type            = "CNAME"
  content         = "sparx.works"
  ttl             = 1
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "sparx_works_app" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_works[0].id
  name            = "app"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
  comment         = "Merchant dashboard"
}

resource "cloudflare_record" "sparx_works_api" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_works[0].id
  name            = "api"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "sparx_works_mcp" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_works[0].id
  name            = "mcp"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
}

# NOTE: Tenant subdomain storefronts moved to sparx.zone (Shopify-style split).
# No wildcard or customers records on sparx.works anymore — see sparx.zone block below.

# =========================================================================
# sparx.zone — tenant storefronts (the customer's "zone of control")
# =========================================================================
# Reputation/cookie isolation from sparx.works. Default merchant URL is
# acme.sparx.zone (was acme.sparx.works in the original design).

data "cloudflare_zone" "sparx_zone" {
  count = var.cloudflare_enabled ? 1 : 0
  name  = "sparx.zone"
}

# Apex points at ingress so the catch-all Caddy site responds. The marketing
# app 301s sparx.zone → sparx.works (this is the platform's home; the .zone
# domain is meant for tenant subdomains, not direct apex traffic).
resource "cloudflare_record" "sparx_zone_root" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_zone[0].id
  name            = "@"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
}

# Wildcard for tenant stores (slug.sparx.zone).
# Caddy on-demand TLS issues per-slug Let's Encrypt certs — Cloudflare proxy
# would intercept the TLS handshake, so this MUST be DNS-only.
resource "cloudflare_record" "sparx_zone_wildcard" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_zone[0].id
  name            = "*"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = false
  allow_overwrite = true
}

# CNAME target for merchant custom domains. Same reason as the wildcard:
# Caddy needs to terminate TLS, so DNS-only.
resource "cloudflare_record" "sparx_zone_customers" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_zone[0].id
  name            = "customers"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = false
  allow_overwrite = true
  comment         = "Tenant custom-domain CNAME target — see docs/04-domain-ssl-automation.md"
}

# =========================================================================
# sparx.email — Postal sending infrastructure + merchant-facing emails
# =========================================================================
# Replaces the originally-planned sparx.mx (which was already taken).
# The mail records (MX, SPF, DKIM) are added once Postal is deployed and
# the SMTP IP + DKIM public key are known.

data "cloudflare_zone" "sparx_email" {
  count = var.cloudflare_enabled ? 1 : 0
  name  = "sparx.email"
}

resource "cloudflare_record" "sparx_email_root" {
  count           = var.cloudflare_enabled ? 1 : 0
  zone_id         = data.cloudflare_zone.sparx_email[0].id
  name            = "@"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
  comment         = "Marketing landing for Sparx email infrastructure"
}

# TODO when Postal lands:
#   resource "cloudflare_record" "sparx_email_mail_a" { ... mail.sparx.email A → postal SMTP IP, proxied=false }
#   resource "cloudflare_record" "sparx_email_mx"     { ... @ MX → mail.sparx.email priority 10 }
#   resource "cloudflare_record" "sparx_email_spf"    { ... @ TXT → "v=spf1 ip4:<postal-ip> ~all" }
#   resource "cloudflare_record" "sparx_email_dkim"   { ... dkim._domainkey TXT → "v=DKIM1; k=rsa; p=<public>" }
#   resource "cloudflare_record" "sparx_email_dmarc"  { ... _dmarc TXT → "v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email" }

# =========================================================================
# Module marketing zones — apex + www → ingress (Cloudflare-proxied)
# =========================================================================
# Caddy looks at the Host header and serves the right marketing site.

locals {
  marketing_zones = var.cloudflare_enabled ? toset([
    "sparxcms.com",
    "sparxcrm.com",
    "sparxemail.com",
    "sparxb2b.com",
    "sparx.host",
    "sparx.software",
    "sparx.exchange",
    "sparx.market",
  ]) : toset([])
}

data "cloudflare_zone" "marketing" {
  for_each = local.marketing_zones
  name     = each.value
}

resource "cloudflare_record" "marketing_root" {
  for_each        = local.marketing_zones
  zone_id         = data.cloudflare_zone.marketing[each.value].id
  name            = "@"
  type            = "A"
  content         = google_compute_address.ingress.address
  ttl             = 1
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "marketing_www" {
  for_each        = local.marketing_zones
  zone_id         = data.cloudflare_zone.marketing[each.value].id
  name            = "www"
  type            = "CNAME"
  content         = each.value
  ttl             = 1
  proxied         = true
  allow_overwrite = true
}
