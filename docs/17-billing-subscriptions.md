# Sparx Platform — Billing & Subscriptions

**Version:** 2.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Philosophy

Sparx billing is modular and honest. Merchants pay only for what they activate. No hidden tiers. No "you need to upgrade to access that." Every module has a clear price and a clear value proposition.

The CMS and Commerce engines are deliberately separated — a content publisher shouldn't pay for a shopping cart they'll never use, and a wholesale distributor shouldn't pay for a blog module they'll never touch.

---

## 2. Module Pricing

Each module is independently activatable:

| Module            | Monthly | Annual (20% off) | What It Includes                                                                  |
| ----------------- | ------- | ---------------- | --------------------------------------------------------------------------------- |
| **Storefront**    | $49     | $470             | Site builder, themes, visual customizer, pages, basic content, custom domain, SSL |
| **Commerce**      | $49     | $470             | Products, variants, inventory, cart, checkout, Stripe payments, discounts         |
| **CMS**           | $49     | $470             | Full content editor, blog, media library, SEO tools, navigation, landing pages    |
| **CRM**           | $49     | $470             | Customer profiles, pipeline, activity log, tasks, segmentation                    |
| **Email**         | $29     | $278             | Transactional + marketing email via Postal, automations, templates, broadcasts    |
| **B2B/Wholesale** | $99     | $950             | Account pricing, RFQ/quotes, net terms, credit limits, fleet management           |
| **AI/MCP**        | $49     | $470             | MCP server for Claude, ChatGPT, Copilot — all tools included                      |
| **Dropship**      | $29     | $278             | Supplier connectors (DSers, Spocket, Faire), catalog sync, order routing          |

### Module Rules

- Storefront is required as the base for any merchant-facing store
- Commerce requires Storefront
- CMS can be purchased standalone (no Storefront required for headless CMS use)
- All other modules require at least Storefront
- B2B requires Commerce
- Modules can be added or removed at any time (prorated)

### Transaction Fees

- Storefront + Commerce only: 0.5% per transaction
- When CRM is added: 0.3% per transaction
- When any plan hits $299+/mo equivalent: 0% transaction fee

---

## 3. Bundles

Pre-configured bundles for common use cases:

| Bundle         | Modules Included                                              | Monthly | Saves |
| -------------- | ------------------------------------------------------------- | ------- | ----- |
| **Starter**    | Storefront + Commerce                                         | $79     | $19   |
| **Content**    | Storefront + CMS                                              | $79     | $19   |
| **Growth**     | Storefront + Commerce + CRM + Email                           | $149    | $27   |
| **Pro**        | Storefront + Commerce + CMS + CRM + Email + AI/MCP + Dropship | $299    | $54   |
| **Business**   | All modules                                                   | $449    | $74   |
| **Enterprise** | All modules + custom frontend + managed hosting + SLA         | Custom  | —     |

Bundles are presented during onboarding and in billing settings. Merchants can always switch to module-by-module pricing if their needs are unusual.

---

## 4. Usage Limits

| Resource           | Starter | Growth | Pro       | Business  | Enterprise |
| ------------------ | ------- | ------ | --------- | --------- | ---------- |
| Staff accounts     | 1       | 5      | 15        | Unlimited | Unlimited  |
| Products           | 500     | 5,000  | Unlimited | Unlimited | Unlimited  |
| Customers          | 1,000   | 10,000 | Unlimited | Unlimited | Unlimited  |
| Monthly emails     | 1,000   | 10,000 | 50,000    | 100,000   | Custom     |
| Media storage      | 5GB     | 25GB   | 100GB     | 250GB     | Custom     |
| Dropship suppliers | 1       | 3      | 10        | Unlimited | Unlimited  |
| API requests/mo    | 10K     | 100K   | 1M        | Unlimited | Unlimited  |
| MCP requests/day   | —       | —      | 5,000     | 10,000    | Custom     |

### Overage Pricing

| Resource                 | Overage Rate                                        |
| ------------------------ | --------------------------------------------------- |
| Email above limit        | $0.0008/email (Postal infrastructure cost + margin) |
| Storage above limit      | $0.02/GB/month                                      |
| API requests above limit | $0.01/1K requests                                   |

Merchants notified at 80% and 100% of plan limits. Overages billed on next invoice.

---

## 5. Enterprise & Managed Hosting

### Enterprise Plan

For clients requiring custom frontends, dedicated infrastructure, or contractual SLAs:

- All modules included
- Custom frontend development (scoped separately)
- Dedicated Cloud SQL instance
- Dedicated Postal IP pool
- 99.99% uptime SLA
- Dedicated support contact
- Pricing: custom, starting ~$2,000/mo

### Managed Hosting Add-On

Available on any plan for merchants who want Sparx to operate their infrastructure:

**$750/month includes:**

- Cloud hosting (GKE, Cloud SQL, Redis, GCS)
- Uptime monitoring + alerting
- Automated backups (daily snapshots, 30-day retention)
- Security patch management
- SSL certificate management
- Platform updates and upgrades
- Direct support line (email + phone)
- Monthly performance report

Gillett Diesel Service Inc. is the first managed hosting client at $750/month, on the Enterprise plan with a custom frontend.

---

## 6. Stripe Integration

All billing handled via Stripe:

- Subscription plans defined as Stripe Products + Prices
- Modules as Stripe subscription items (add/remove mid-cycle, prorated)
- Annual plans as upfront charge with Stripe subscription
- Managed hosting as a recurring add-on line item
- Transaction fees calculated via Stripe Connect (when applicable)
- Failed payment: 3 retry attempts over 7 days → store read-only → 30 days → deactivated (data retained 90 days)

### Stripe Customer Portal

Merchants manage billing via embedded Stripe Customer Portal:

- View current modules and usage
- Add/remove modules
- Switch between monthly/annual
- Update payment method
- Download invoices
- Cancel subscription (with exit survey)

No custom billing UI — the Stripe Customer Portal is embedded into Sparx dashboard settings.

---

## 7. Trial

- 14-day free trial on Business plan (all modules)
- No credit card required to start
- Full access during trial
- Day 12: in-app prompt to choose plan
- Day 14: plan selection required to continue
- Trial data preserved 30 days after expiry

Trial-to-paid conversion is tracked as a primary business metric. Target: >30%.

---

## 8. Billing for the WizeWorks Portfolio

Each WizeWorks product (kanNINJA, HelpNinja, Sparx, etc.) has independent billing. Sparx billing is not shared with other WizeWorks products. Future consideration: a WizeWorks portfolio bundle that gives clients across multiple products a combined discount — but that's a future-state decision after each product has its own customer base.
