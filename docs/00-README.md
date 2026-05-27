# Sparx Platform — Documentation Index

**Platform:** Sparx (sparx.works)
**Company:** WizeWorks (wize.works)
**Author:** Brandon Korous (me@brandonkorous.com)
**Last Updated:** 2026-05-27

---

## What Is Sparx?

Sparx is WizeWorks' unified commerce operating system — a modular platform that gives merchants a live storefront, CRM, CMS, email, B2B wholesale, dropshipping, and AI integration in one place. Built and operated by WizeWorks.

Sparx is to WizeWorks what Shopify is to its parent company — except Sparx is modular, open to headless use, MCP-native, and never charges merchants for features they don't need.

## Domain Portfolio

| Domain | Purpose |
|--------|---------|
| `sparx.works` | Primary brand: marketing site, `app`, `api`, `mcp` |
| `sparx.zone` | Tenant storefronts (`acme.sparx.zone`) + `customers.sparx.zone` (custom-domain CNAME target). Shopify-style split for reputation isolation. |
| `sparx.email` | Postal sending infrastructure + platform→merchant transactional emails (replaces planned `sparx.mx` which was unavailable) |
| `sparx.host` | Managed hosting product marketing (301 → sparx.works/hosting until built) |
| `sparx.software` | Developer portal: SDK docs, API reference, MCP guides (301 → sparx.works/docs until built) |
| `sparx.exchange` | Defensive registration (301 → sparx.works) |
| `sparx.market` | Future theme/plugin/connector marketplace |
| `sparxcms.com` | CMS module marketing site |
| `sparxcrm.com` | CRM module marketing site |
| `sparxemail.com` | Email module marketing site |
| `sparxb2b.com` | B2B/wholesale module marketing site |

## WizeWorks Portfolio Context

Sparx is one of several products under the WizeWorks umbrella:
- sparx.works — Commerce platform (this platform)
- kanninja.com — Project management
- helpninja.ai — AI support
- stumbleable.com — TBD
- agconn.com — TBD
- splits.network — TBD
- applicant.network — TBD
- employment-networks.com — TBD

## Core Design Principles

1. **Live in 5 minutes** — Default experience gets a merchant to a live store faster than any competitor
2. **Modular by design** — Merchants pay only for what they use; modules activate independently
3. **Progressive disclosure** — Power features exist but never block the simple path
4. **API-first** — Every feature accessible via API; the UI is one consumer among many
5. **MCP-native** — AI integration is a first-class citizen, not a plugin
6. **Own your data** — Merchants own their data; Sparx is the platform, not the warden
7. **Single pane of glass** — Every active module visible in one unified dashboard

## Module Structure

Sparx is built around independently activatable modules:

| Module | Standalone | Marketing Domain |
|--------|-----------|-----------------|
| Storefront | $49/mo | sparx.works |
| Commerce | +$49/mo | sparx.works |
| CMS | $49/mo | sparxcms.com |
| CRM | +$49/mo | sparxcrm.com |
| Email | +$29/mo | sparxemail.com |
| B2B/Wholesale | +$99/mo | sparxb2b.com |
| AI/MCP | +$49/mo | sparx.works |
| Dropship | +$29/mo | sparx.works |

## Key v2 Decisions

Decisions locked in during the v2 documentation pass (vs. the original WizeWorks-Platform draft):

- **Platform name:** Sparx (`sparx.works`) — was "WizeWorks Platform"
- **Email infrastructure:** Postal (self-hosted) — was Resend
- **Auth:** Better Auth (self-hosted, open source) — was custom JWT only
- **Pricing:** Modular per-module — was tiered plans
- **CMS:** Standalone module, no Commerce required — was bundled
- **Commerce:** Separate module from CMS — was combined

## Document Index

| # | Document | Description |
|---|----------|-------------|
| 01 | Platform Vision & Strategy | Why Sparx exists, who it's for, how it competes |
| 02 | Architecture Overview | System design, infrastructure, tech stack |
| 03 | Infrastructure & Deployment | GKE, Terraform, CI/CD, environments |
| 04 | Domain & SSL Automation | Subdomain provisioning, custom domains, cert management |
| 05 | Data Model | Core entities, relationships, multi-tenancy |
| 06 | API Specification | REST + GraphQL, auth, versioning, webhooks |
| 07 | MCP Server Spec | AI integration for Claude, ChatGPT, Copilot |
| 08 | Site Builder Spec | Theme system, visual customizer, headless SDK |
| 09 | E-Commerce Engine PRD | Products, orders, cart, checkout, payments |
| 10 | B2B & Wholesale PRD | Accounts, pricing, quotes, net terms, fleet |
| 11 | CRM PRD | Contacts, pipeline, activity log, automation |
| 12 | CMS PRD | Content, media, SEO, blog, landing pages |
| 13 | Email Platform PRD | Postal infrastructure, automations, domain auth |
| 14 | Dropship Integration PRD | Supplier connectors, catalog sync, order routing |
| 15 | Merchant Onboarding PRD | 5-minute signup flow, progressive disclosure |
| 16 | Multi-Tenancy & Security | Isolation, Better Auth, RBAC, audit logs |
| 17 | Billing & Subscriptions | Modular pricing, Stripe, managed hosting |
| 18 | Frontend Architecture | Next.js, design system, monorepo |
| 19 | Testing Strategy | Unit, integration, E2E, load testing |
| 20 | Operational Runbook | Monitoring, incidents, backup, restore |
| 21 | Cost & Scaling Guide | Phased infrastructure, cost ceilings, upgrade triggers |
| 22 | Typesense Search Specification | Day-1 search index, schemas, sync workers |
| 23 | Frontend Component Architecture | CVA + Shadcn + ModuleProvider, tokens, variants |
| 24 | Domain Purchase & Management | GoDaddy Reseller integration, instant connect, lifecycle |
| 25 | Monorepo Structure | pnpm workspaces + Turborepo layout, bootstrap order |
| 26 | Domain Transfer Runbook | GoDaddy → Cloudflare migration, ordered checklist, rollback paths |
