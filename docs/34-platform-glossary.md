# Platform Glossary & Concept Model

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

---

## 1. Why this exists

Several core nouns in Sparx are overloaded — most of all **"storefront"**, which is used for
a paid module, a runtime app, a tenant's public website, and (loosely, in prose) "the shop."
That overload has already produced wrong statements in design discussions (e.g. "a storefront
is required for a brand," which inverts the real dependency — see §4).

This doc is the **canonical concept model**. When any other doc, chat, or PR uses one of these
terms ambiguously, this doc wins and that usage is corrected. It is descriptive of the
architecture already committed in [01-platform-vision.md](01-platform-vision.md),
[29-sitebuilder-architecture.md](29-sitebuilder-architecture.md),
[30-sitebuilder-redesign.md](30-sitebuilder-redesign.md), and
[33-token-model-v2.md](33-token-model-v2.md) — it does not change any design.

---

## 2. The layer model (read this first)

Sparx is, at its root, a **website platform**. The website is the base; every other capability
is a feature layered onto it. Concretely:

```
TENANT ─────────────  one merchant / organization (Better Auth org, RLS tenant_id)
  │
  ├─ BRAND ──────────  identity: name, logo, palette, type, shape, rhythm, effect
  │                    tenant-level; every surface READS it, none OVERRIDES it
  │                    (30 §6, 33 §1 decision 4)
  │
  └─ SITE ───────────  the website itself: themes, layouts, pages, sections, nav slots
       │               authored by the Site Builder; this is the "Storefront" module
       │               (a content-only tenant still has a full SITE — it just has no products)
       │
       ├─ CMS          adds prose pages, blog, media
       ├─ Commerce     adds products, cart, checkout, orders  ← this is "the shop"
       ├─ CRM          adds customers, pipeline, activity
       ├─ Email, B2B, AI/MCP, Dropship …
```

Three rules fall out of this and are **binding**:

1. **The site is the base, not the shop.** The website exists with zero commerce. Selling is
   the **Commerce** module, layered on. A merchant on Storefront + CMS has a complete site with
   no store.
2. **Brand sits above the site.** Brand is a tenant primitive. The site (and dashboard, email,
   every surface) reads it. You do **not** need a site/storefront to have a brand; the
   dependency runs the other way.
3. **Theme ≠ brand.** Brand is _identity_ (who the merchant is). Theme is _presentation_ (how a
   given site renders). Per [33-token-model-v2.md](33-token-model-v2.md): brand owns
   color/type/shape/rhythm/effect (the depth scale); the theme owns surfaces, neutral, status
   colors, border, container width. One brand, potentially many presentations.

---

## 3. Canonical terms

| Term                         | Means                                                                                                                                                  | Does NOT mean                                                                                     | Where it lives                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Tenant**                   | One merchant/organization. The RLS isolation boundary; 1:1 with a Better Auth org.                                                                     | A user. A site. (A tenant _has_ a site.)                                                          | `tenant_id` everywhere; `02-tenant.prisma`                                          |
| **Brand**                    | Tenant-level **identity**: name, logo, palette, type, shape, rhythm, effect (depth). Read by every surface, overridable by none.                       | A theme. A storefront-only concept.                                                               | `TenantBrand`; [30 §6](30-sitebuilder-redesign.md), [33](33-token-model-v2.md)      |
| **Site**                     | The merchant's **website** — the base layer: themes, layouts, pages, sections, nav. Synonym for "the Storefront module's output."                      | The shop. (Commerce is separate.) A separate hidden website under the storefront — there is none. | `SiteConfig`/`SiteVersion`/`SiteSection`/`SiteLayoutBlock`; `49-sitebuilder.prisma` |
| **Storefront (module)**      | The paid module whose job is "site builder, themes, pages, live in 5 min." The base **website** capability. Internally the module key is `storefront`. | Commerce. The shop.                                                                               | `isModuleEnabled(tenantId, 'storefront')`; [01 §2](01-platform-vision.md)           |
| **Site Builder**             | The dashboard **tool** that authors the site (one-screen editor, theme, brand, layouts, sections). The admin-side surface of the Storefront module.    | The rendered public site.                                                                         | `apps/dashboard/.../sitebuilder`; `packages/sitebuilder`                            |
| **`apps/storefront`**        | The runtime **app** that renders the tenant's public website (tenant-aware, draft/published).                                                          | The admin/editor. The dashboard.                                                                  | `apps/storefront`                                                                   |
| **Storefront (public site)** | A tenant's live public website, e.g. `acme.sparx.zone`. The rendered output of the SITE for visitors.                                                  | The shop specifically (it shows products only if Commerce is on).                                 | `sparx.zone` per [00-README](00-README.md)                                          |
| **Theme**                    | A **presentation** preset (apex, industrial, drift, market, fleet, drop) + the merchant's overlay. How the site looks.                                 | Brand/identity.                                                                                   | `packages/storefront-themes`; `StorefrontTheme`                                     |
| **Commerce**                 | The module that adds products, cart, checkout, orders — "the shop."                                                                                    | The site. The storefront module.                                                                  | `commerce` module; `09-ecommerce-engine-prd.md`                                     |
| **Module**                   | An independently activatable capability (Storefront, Commerce, CMS, CRM, Email, B2B, AI/MCP, Dropship). Feature-flagged, not separately deployed.      | A microservice. A deploy unit.                                                                    | module flags; `CLAUDE.md`                                                           |

---

## 4. The "storefront" overload, stated plainly

The single word **storefront** legitimately appears at four levels:

1. **Module** — `storefront` = the website-building capability (base layer).
2. **Admin tool** — the Site Builder authors that module's data.
3. **Runtime app** — `apps/storefront` renders it.
4. **Public site** — `acme.sparx.zone`, the visitor-facing website.

**None of the four mean "commerce / the shop."** Selling is always the separate **Commerce**
module. When you see "storefront," read **"the website / the site,"** not "the store."

The earlier claim that **"a storefront is required for a brand" is backwards.** Brand is a
tenant primitive that the site reads; the site depends on the brand, not the reverse. A tenant
can hold a brand with no site published at all.

---

## 5. Open decision (deferred)

Whether to **rename the `storefront` module to `Site`/`Website`** to kill the overload at the
source is intentionally left open. It touches docs (01/08/29/30), the module flag
(`isModuleEnabled('storefront')`), `apps/storefront`, and several packages — a real refactor,
not a doc edit. Until that's decided, the names stay and **this glossary is the source of truth
for what they mean.** Revisit when the Site Builder redesign ([30](30-sitebuilder-redesign.md))
and Token Model v2 ([33](33-token-model-v2.md)) land, since both already lean on the
brand-vs-presentation split this doc formalizes.
