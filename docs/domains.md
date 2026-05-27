# Sparx Domain Portfolio

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

Current registrations (all in Cloudflare DNS):

## Platform — sparx.works

| Hostname | Purpose |
|---|---|
| `sparx.works` | Public marketing site (SSG/ISR, edge-cached) |
| `app.sparx.works` | Merchant dashboard (authenticated Next.js) |
| `api.sparx.works` | REST + GraphQL API |
| `mcp.sparx.works` | MCP server (AI integration) |
| `status.sparx.works` | Status page |

## Tenant storefronts — sparx.zone

Shopify-style split: tenant content lives on a different registrable domain from the platform brand. Keeps reputation, cookies, and SEO cleanly isolated.

| Hostname | Purpose |
|---|---|
| `*.sparx.zone` | Tenant subdomain storefronts (`acme.sparx.zone`) |
| `customers.sparx.zone` | CNAME target for merchant custom domains |
| `sparx.zone` | Apex 301s to sparx.works (not a destination itself) |

## Email — sparx.email

Postal sending infrastructure **and** platform-to-merchant transactional emails. `sparx.mx` was the original plan; it was unavailable, so `sparx.email` plays both roles.

| Hostname | Purpose |
|---|---|
| `mail.sparx.email` | Postal SMTP ingress |
| `sparx.email` | SPF, DKIM, DMARC, MX → mail.sparx.email |

## Module marketing sites

Each module has its own marketing/landing domain — independent SEO channels.

| Domain | Module |
|---|---|
| `sparxcms.com` | CMS |
| `sparxcrm.com` | CRM |
| `sparxemail.com` | Email |
| `sparxb2b.com` | B2B / Wholesale |

## Future / placeholder

Currently 301-redirect to the corresponding section on `sparx.works`. Replaced with real sites as the products mature.

| Domain | Eventual purpose | Today |
|---|---|---|
| `sparx.host` | Managed hosting product marketing | 301 → sparx.works/hosting |
| `sparx.software` | Developer portal (SDK, API reference, MCP guides) | 301 → sparx.works/docs |
| `sparx.market` | Theme/plugin/connector marketplace | 301 → sparx.works/market |
| `sparx.exchange` | Defensive registration | 301 → sparx.works |

## Not acquired

- `sparx.mx` — original plan for Postal sending; already registered to a third party. Replaced by `sparx.email`.
