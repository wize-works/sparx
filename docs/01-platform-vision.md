# Sparx Platform — Vision & Strategy

**Version:** 2.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. The Problem

The commerce platform market is dominated by tools that have optimized for feature breadth at the expense of usability and honest pricing. Shopify's merchant onboarding now takes hours. HubSpot requires a dedicated admin. Combining them requires Zapier, custom integrations, and ongoing maintenance. The result: small and mid-size businesses paying $2,000–$3,000/month for a fragmented stack that still doesn't give them a unified view of their business.

Worse: merchants are forced to buy features they don't need. A blogger who wants to sell a single digital product pays the same as a wholesale distributor managing 500 SKUs and 200 fleet accounts.

AI tools (Claude, ChatGPT, Copilot) have become indispensable — but they have zero visibility into business data. A merchant cannot ask their AI "what are my top 10 customers this quarter" because no platform exposes that natively.

## 2. The Solution — Sparx

Sparx is a modular commerce operating system. Merchants activate only what they need. Every module shares the same data layer, the same dashboard, and the same API — so there's never a sync problem, never a missing integration, never a "you need the $2,400/month plan for that."

**The modules:**
- **Storefront** — Site builder, themes, pages, live in 5 minutes
- **Commerce** — Products, cart, checkout, orders, payments
- **CMS** — Content editor, blog, media library, SEO (standalone — no shop required)
- **CRM** — Customer intelligence, pipeline, activity log, automation
- **Email** — Transactional and marketing email, tied to merchant's own domain, powered by Postal
- **B2B/Wholesale** — Account pricing, RFQ, net terms, fleet management, service scheduling
- **AI/MCP** — Native MCP server; Claude, ChatGPT, and Copilot speak your business data
- **Dropship** — Supplier connectors, catalog sync, automated order routing

Each module is independently activatable. A merchant running a content site pays for Storefront + CMS. A wholesale distributor pays for Commerce + B2B + CRM. A dropship entrepreneur pays for Commerce + Dropship.

## 3. The WizeWorks Context

Sparx is built and operated by WizeWorks (wize.works), based in Visalia, California, incorporated in 2026. WizeWorks owns and operates a portfolio of software products including kanNINJA (project management), HelpNinja (AI support), and others. Sparx is the flagship commerce platform.

The first Enterprise client is Gillett Diesel Service Inc. (Bluffdale, Utah) — migrating from Shopify + HubSpot ($35,400/year) to Sparx (custom frontend, managed hosting). Gillett's requirements drove the initial B2B, fleet, and MCP feature set.

## 4. Target Market

**Primary: SMB Merchants ($50K–$5M ARR)**
Currently on Shopify + HubSpot + Mailchimp + Zapier. Paying $1,500–$3,000/month for a fragmented stack. Want things to just work.

**Secondary: Content Publishers & Creators**
Want a fast, beautiful CMS with optional commerce. Don't need a full Shopify setup. Currently on WordPress + WooCommerce or Webflow + Stripe — paying for complexity they don't need.

**Tertiary: Industrial / B2B Businesses**
Fleet accounts, wholesale buyers, complex pricing. Currently using manual processes or legacy ERP. Underserved by every existing platform.

**Quaternary: Dropship Entrepreneurs**
Building product businesses without inventory. Need supplier sync, margin calculation, automated fulfillment.

## 5. Competitive Differentiation

| Capability | Sparx | Shopify | HubSpot | WordPress |
|------------|-------|---------|---------|-----------|
| Store live < 5 min | ✅ | ❌ | ❌ | ❌ |
| Modular pricing | ✅ | ❌ | ❌ | ❌ |
| Per-module activation | ✅ | ❌ | ❌ | ❌ |
| CMS standalone | ✅ | ❌ | ❌ | ✅ |
| Built-in CRM | ✅ | ❌ | ✅ | ❌ |
| Native MCP / AI | ✅ | ❌ | ❌ | ❌ |
| Built-in email (Postal) | ✅ | ❌ | ✅ | ❌ |
| B2B / Wholesale native | ✅ | +$2,400/mo | ❌ | ❌ |
| Dropship native | ✅ | Via apps | ❌ | Via plugins |
| Headless / API-first | ✅ | +cost | ❌ | Via REST |
| Single monthly bill | ✅ | ❌ | ❌ | ❌ |
| Self-hosted option | ✅ | ❌ | ❌ | ✅ |

## 6. Pricing Model

### Module Pricing
| Module | Price |
|--------|-------|
| Storefront | $49/mo |
| Commerce | +$49/mo |
| CMS | $49/mo (standalone) |
| CRM | +$49/mo |
| Email | +$29/mo |
| B2B/Wholesale | +$99/mo |
| AI/MCP | +$49/mo |
| Dropship | +$29/mo |

### Bundles (for simplicity)
| Bundle | Modules | Price |
|--------|---------|-------|
| **Starter** | Storefront + Commerce | $79/mo |
| **Content** | Storefront + CMS | $79/mo |
| **Growth** | Storefront + Commerce + CRM + Email | $149/mo |
| **Pro** | All modules except B2B | $299/mo |
| **Business** | All modules | $449/mo |
| **Enterprise** | All modules + custom frontend + managed hosting + SLA | Custom |

### Transaction Fees
- Starter / Growth: 0.5% per transaction
- Pro / Business / Enterprise: 0%

### Managed Hosting Add-On
For clients who want Sparx to operate their infrastructure:
- $750/month — hosting, uptime, backups, security patches, support, updates
- Gillett Diesel is the first managed hosting client

## 7. The Sparx Promise

> A merchant signs up, picks a theme, activates the modules they need, adds their first product, and is taking orders — in under 5 minutes. No developer required. No app store required. No Zapier required.

Every product decision is evaluated against this promise. If a feature slows the 5-minute path, it goes behind "Advanced Settings." If it enables it, it gets prioritized.

## 8. Domain Strategy

Sparx owns a portfolio of domains creating independent SEO acquisition channels:

- **sparx.works** — Primary brand and platform home (dashboard, API, MCP, marketing)
- **sparx.zone** — Tenant storefronts (`acme.sparx.zone` + custom-domain CNAME target). Shopify-style split keeps tenant reputation/cookies/SEO isolated from the platform brand.
- **sparxcms.com** — CMS module acquisition ("headless CMS for small business")
- **sparxcrm.com** — CRM module acquisition ("CRM built for commerce")
- **sparxemail.com** — Email module acquisition ("email marketing built in")
- **sparxb2b.com** — B2B module acquisition ("wholesale platform")
- **sparx.email** — Postal sending infrastructure + platform-to-merchant transactional emails (`sparx.mx` was unavailable; `sparx.email` now plays both roles)
- **sparx.host** — Managed hosting product marketing (currently 301 → sparx.works/hosting)
- **sparx.software** — Developer portal: SDK docs, API reference, MCP guides (currently 301 → sparx.works/docs)
- **sparx.exchange** — Defensive registration (currently 301 → sparx.works)
- **sparx.market** — Future theme/plugin/connector marketplace
