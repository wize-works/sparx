# sparx Platform — Multi-Site per Tenant

**Version:** 1.11 (Phases 1–6 + 7a + 8a/8b built; 7b email render path + per-site blueprint install + new-site wizard built 2026-06-12; `EmailEvent.property_id` now persisted per send + new-site discard-confirm; order-trigger payoff tracked as Phase 9; only 7b authoring/overrides remain — BLOCKED on email-defaults. **§3·B added 2026-06-13: the customer-facing site name is `Property.name`, never `Tenant.name`** — storefront + email leaks fixed, `businessName` deprecated as a name source)
**Author:** Brandon Korous
**Last Updated:** 2026-06-13

> **Status: BUILT — Phases 1–4 shipped (2026-06-04); Phase 5 (Model B per-site catalog + content, search facet, make-primary subdomain-follow) built 2026-06-05.**
>
> **⚠️ CRITICAL CORRECTION (2026-06-12): per-site _application_ was only partially built.** Model A promised per-site theme + brand, but the theme/publish layer (`SiteConfig`→`SiteVersion.compiledTokens`→`SiteTheme`) was left **tenant-level** (the "sitebuilder is retiring" decision, §2/§4) — and that is exactly what the site reads its applied tokens from. Net effect today: **every site in a tenant shares one applied theme, and emails are tenant-wide.** That breaks the multi-site promise. The governing rule and the fix are now §3·A; the work is **Phases 6–8** (§10). **RESOLVED (2026-06-12):** Phases 6–8 landed — per-site applied theme (6a), `SiteSettings` (6b), legal footer (6c), email render path + broadcast brand (7a/7b), per-site blueprint install (8a), and the **new-site create wizard** (8b) are built; a new site now honestly gets its own theme, brand, settings, legal, and email branding. The only remainder is 7b's per-site email **authoring + built-in overrides**, BLOCKED on the email-defaults (Builder-authored vs coded `DEFAULT_AUTOMATIONS`) decision.
>
> **Remaining (pre-correction list, now folded into Phases 6–8):** per-site module_scope, billing metering, per-site SiteSettings/nav, explicit cross-site sharing.
> One tenant can run **more than one website** (e.g. a main brand site + a campaign microsite, a
> wholesale site and a retail site over the same catalog, a publisher with several publications).
>
> **Implementation naming:** the entity ships as **`Property`** (table `properties`), NOT `Site` —
> `Site*` collides with the legacy sitebuilder `SiteConfig`/`SiteVersion`/`SiteTheme` tables, and
> "Property" reads as broader than a store (content-or-commerce). User-facing copy says **"Site"**;
> the code identifier is `Property`/`property_id`. Read `Site` ≙ `Property` throughout this doc.
>
> **Scope note vs. doc 32.** This re-key was applied **Builder-only** (go-forward render path:
> `builder_pages`/`builder_layouts`/`builder_page_assignments` gained `property_id`). The legacy
> `sitebuilder_*` layer (`SiteConfig.tenantId @id`, …) was **left single-site** since it is
> retiring — it is NOT re-keyed. This still directly revisits doc 32 §2's "no `Site` model" — that
> decision was about a _different axis_ (multiple workspaces a user belongs to); the `Property`
> entity lives _inside_ a tenant and the two don't conflict (§2).
>
> **What's built:** `properties` + `domains` tables (+ RLS/partial-unique/host-resolution);
> per-property Builder render path; host→property routing + Caddy authorization; create-site /
> make-primary APIs; the dashboard **Sites** settings hub + in-builder site switcher; BYO custom
> domain connect + DNS-TXT verify; per-site **brand override** (`Property.brand_override`, Phase 4).
> **Deferred (Phase 5):** Model B catalog/content `property_id` scoping (additive, enforcement
> deferred per §3), per-site module scope, the site-scoped search facet. See §10.

---

## 1. Why

Today a tenant has exactly one website. The whole site-authoring layer encodes that literally:
`SiteConfig`'s primary key **is** `tenant_id`, and every sibling table is uniquely keyed
`(tenant_id, …)` — `SiteVersion`, `PageLayout`, `SiteLayoutBlock`, `SiteTheme`,
`SiteLayoutDefault`, `SiteLayoutAssignment`, `TenantSectionDefinition`, plus the Builder
(`BuilderPage`, `BuilderLayout`) and the commerce-owned `SiteSettings`/`SiteTheme`
(all `Tenant @relation` one-to-one or one-per-tenant). Domain resolution maps a hostname to a
**tenant**, and that tenant has one site to render.

Real tenants outgrow one site:

- **Multiple brands, one back office** — a company runs two sites with different names,
  themes, and domains but one catalog, one customer list, one set of orders and one bill.
- **Microsites / campaign sites** — a separate landing site for a product launch or event, on
  its own domain, that should not clutter the main site's page tree.
- **Wholesale vs. retail** — a B2B site and a D2C site over the same products with different
  presentation and pricing visibility ([10-b2b-wholesale-prd.md](../10-b2b-wholesale-prd.md)).
- **Multi-publication content** — a CMS-only tenant ([12-cms-prd.md](../12-cms-prd.md)) running
  several publications with distinct themes and navigation from one editorial back end.
- **Agencies** — one account managing several client-facing sites without making each a fully
  separate, separately-billed workspace.

Each of those wants **a second site that shares the back office**, not a second tenant.

---

## 2. Two axes — this is NOT multi-workspace (read first)

sparx has two orthogonal "more than one" needs. Conflating them is the trap doc 32 §2 was
guarding against. They are different and both legitimate:

| Axis                         | "One **\_ has many _**"         | Isolation boundary                                               | Shares                                                            | Mechanism                                                             |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Multi-workspace** (doc 32) | one **user** → many **tenants** | **Hard** — separate RLS `tenant_id`, separate org, separate bill | nothing (each tenant is its own world)                            | Better Auth org membership + active-org switch                        |
| **Multi-site** (this doc)    | one **tenant** → many **sites** | **None between sites** — same `tenant_id`, same RLS, same bill   | back office (catalog, customers, orders, staff, billing) — see §3 | a new `Site` sub-entity + a `site_id` scope on the presentation layer |

So:

- **One Better Auth org still maps 1:1 to one tenant** (CLAUDE.md is unchanged). A `Site` is a
  child of a tenant, not a new org.
- **RLS is unchanged.** `tenant_id` remains the only security boundary. `site_id` is an
  _application-tier scoping_ column within a tenant, **not** a security boundary — two sites in
  the same tenant can read each other's rows as far as Postgres is concerned; the app scopes by
  `site_id`. (Anyone needing hard isolation between two sites should use two **workspaces**, not
  two sites. State this loudly in the UI.)

> Doc 32 §2's "no Site model" was the right call **for the workspace switcher** — it kept
> workspace == tenant == org clean. This doc adds a Site model _below_ the tenant for the
> presentation axis, which doesn't disturb that mapping. [32](../32-workspace-switching-breadcrumb.md)
> §2 and [34-platform-glossary.md](../34-platform-glossary.md) need a note pointing at this doc when
> it lands (§9).

---

## 3. The central question: what's shared vs. per-site

Introducing `Site` forces one decision per category of data: does it live at the **tenant** level
(shared by all sites) or the **site** level (one per site)? There's a spectrum of ambition:

**Model A — Presentation-only multi-site (recommended starting point).**
A site is a distinct **presentation + domain + page tree** over the _same shared back office_.
Per-site: theme/brand presentation, layouts, page/section composition, navigation, domain,
site settings (currency, policies), appearance policy. Shared (tenant-wide): catalog &
products, CRM customers, orders, inventory, pricing, billing/subscription, staff users,
search index. This is the **smallest structural change** and covers multi-brand / microsite /
multi-publication out of the box. Recommended first, per the platform's "deploy small" discipline.

**Model B — Scoped multi-site. ✅ BUILT (catalog + content), 2026-06-05.**
Scope a _subset_ of shared data to a site: which products a site exposes, which content entries
publish to which site. Mechanism (shipped): a **site↔entity JOIN** — `commerce_product_properties`
(product↔site) and `content_entry_properties` (entry↔site), composite-PK junctions with NO
`tenant_id` (tenant isolation rides the FK parents, like `commerce_collection_products`).
**Semantics: EMPTY join = visible on ALL sites** (the default — existing catalogs/content stay
global with zero backfill); one-or-more rows = visible ONLY on those sites. The site read
filters `propertyLinks none OR some(propertyId)` (`api-rest/src/lib/property.ts`), resolved for
EVERY public read so the primary shows only global + primary-scoped items. Assigned per-item from
the dashboard ("Visible on sites" control) and via the product/content APIs (`propertyIds` /
`property_ids`). Lets a wholesale and a retail site show different slices of one catalog.

> **Still tenant-wide (not yet per-site):** per-site _pricing visibility_, per-site _module scope_,
> and the Typesense _search facet_ (search results are post-filtered in Postgres for now, so the
> hit count can skew slightly until a `property_ids` facet lands in the index — docs/49 §9).

> **🔖 BOOKMARK — future: explicit SHARING modes (share by choice).** Today the model is
> binary: empty = everywhere, listed = only-those. A future iteration should let a tenant choose
> how catalog/content is shared across sites, rather than assuming one default:
>
> - **Per-site default policy** — a site flag for "starts empty, opt products/content IN" (curated
>   microsite) vs. today's "starts with everything, opt OUT" (the current global default).
> - **Shared collections/segments** — assign a whole COLLECTION or content TAXONOMY to a set of
>   sites in one action, instead of per-item (the junction already supports it; needs a bulk UI +
>   a collection↔site / taxonomy↔site join).
> - **Inheritance / linked catalogs** — a site that mirrors another's catalog by reference (changes
>   propagate) vs. a one-time copy.
> - **Per-site pricing visibility** — show a product on two sites but at different price-list
>   visibility (ties into the deferred pricing-visibility item above).
>   The junction tables are forward-compatible with all of these — they are additive on top of the
>   shipped model, no migration of existing scope rows required.

**Model C — Fully isolated sites.**
Separate customers, separate orders, separate everything per site. **This is just
multi-workspace** (doc 32) — do not build it as multi-site. If a tenant needs full isolation,
they create a second workspace.

Recommendation: **ship Model A, design the schema so Model B is additive** (nullable `site_id`
scoping is forward-compatible), and explicitly route Model C to workspaces.

### Brand is the hard sub-question

[34-platform-glossary.md](../34-platform-glossary.md) and
[33-token-model-v2.md](../33-token-model-v2.md) say **brand is a tenant primitive, "read by every
surface, overridable by none."** Multi-brand multi-site breaks that by definition — two sites with
different identities need different brands. Resolution: keep `TenantBrand` as the **default**, and
allow an **optional per-site brand override** (`SiteBrand?`) that a site reads in preference to the
tenant brand. This is a genuine amendment to the doc-34 rule and must be made deliberately, not
silently — it is the single biggest conceptual change here.

---

## 3·A. The per-site _application_ rule (2026-06-12 correction)

The Model A split above was only **partially implemented**, and the gap is a **critical flaw**.
Pages, layouts, and content were re-keyed per-property (Phase 1/5), but the **theme/publish layer
was deliberately left tenant-level** (§2 scope-note, §4 — `sitebuilder_*` "retiring, not
re-keyed"). That layer is exactly what the site reads its applied tokens from
(`SiteVersion.compiledTokens` → the `SiteTheme` write-through). **Emails are tenant-wide
too.** So today every site in a tenant renders one shared theme and one shared set of emails — the
opposite of what "multi-site" promises.

The governing rule, stated explicitly so it binds all future work:

> **A theme, email, blueprint, or brand is a tenant-wide _library_ — browsable and selectable
> across the whole tenant — but it only affects a site when it is _applied to that site_.
> Selection is tenant-wide; application is per-property.**

Pick from a shared shelf; mount it on the site you choose. Pages, layouts, and navigation are
authored _on_ a site, so they are per-property by nature (and already are). `tenant_id` stays the
only security boundary; `property_id` is application-tier scoping (§2) — **none of this adds RLS
policies or a new GUC.**

What "library" vs. "applied" means per artifact:

| Artifact             | Tenant-wide **library** (browse / select)    | **Applied** / owned per-property                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Theme**            | `SiteTheme` (saved themes) stays tenant-wide | _which_ theme is applied + the published tokens — `SiteConfig` (draft), `SiteVersion` (published snapshot), `SiteTheme`/`SiteSettings` (write-through) → **per-property**                                                                                                                         |
| **Brand**            | `TenantBrand` = the tenant default           | the site's applied brand = `Property.brand_override` (already per-property, Phase 4)                                                                                                                                                                                                              |
| **Email**            | (optional future shared template library)    | authored emails + broadcasts + the published email → **per-property** (`BuilderEmail`, `Broadcast`, `ScheduledSend`). The from-identity / sending domain stays tenant-wide for now (§9)                                                                                                           |
| **Blueprint**        | the blueprint catalog stays tenant-wide      | the install + everything it provisions → **per-property** (the installer already scopes content/products/pages/layout and writes a per-site `brand_override` for secondary sites; only the install **route** still hardcodes the primary, and theme-apply must follow the per-property theme fix) |
| **Pages/Layout/Nav** | —                                            | always per-property (already)                                                                                                                                                                                                                                                                     |

This **corrects, not contradicts, §4's "leave `sitebuilder_*` single-site."** Whether or not the
sitebuilder layer is eventually replaced by a Builder-native theme, the **applied theme must become
per-property now**: the publish state (`SiteConfig`/`SiteVersion`) and the write-through
(`SiteTheme`/`SiteSettings`) gain a `property_id`; the `SiteTheme` _library_ stays
tenant-wide. The Builder layer already demonstrates the exact per-property pattern to copy
(`builder_layouts` composite PK `(tenant_id, property_id)`; the public builder routes resolve
`?property=` / `x-sparx-property-id`). Phases 6–8 (§10) carry this out.

**Blueprint corollary.** Because the installer already scopes per-property (it writes a per-site
`brand_override` for a secondary site — _"installing onto one site never rebrands its siblings"_ —
and scopes content/products/pages/layout to the target), the only blockers to per-site blueprints
are (a) the install **route** hardcoding the primary property, and (b) theme-apply being
tenant-wide — both resolved by Phases 6 + 8. Per-site blueprints are then nearly free.

### 3·B. The site NAME is `Property.name` — never the tenant name (2026-06-13)

A tenant is the **legal entity** (a business, or an individual); `Tenant.name` is its
legal/org name and is **billing/ownership only** — it is never rendered to a customer or sent
in a customer email. The **customer-facing name is `Property.name`** — every storefront surface
(browser title, header, footer, OpenGraph, JSON-LD, `llms.txt`) and every customer email
(wordmark, footer, `{{site.name}}` body copy) reads it.

> **Resolution rule (storefront AND email):** customer-facing name = the **active property's
> `name`**, falling back to the tenant's **primary** property's `name`. Never `Tenant.name`,
> never the brand `businessName`.

Mechanics: the primary site's `name` is **seeded from the tenant name** at provisioning, so a
single-site tenant reads a sensible name out of the box, and the merchant refines it in
**Settings → Sites** (or the onboarding Workspace step). Server-side the rule is
`resolveActivePropertyName(tenantId, propertyId?)` (api-rest `lib/property.ts`); the public
`/v1/public/tenants/:slug` payload carries `propertyName`, which `wizeworks/apps/site` collapses into the
single name every surface already reads. The brand `businessName`
(`TenantBrand.business_name` / `Property.brand_override.businessName`) is **deprecated as a name
source** — it survives only for brand/document rendering (e.g. invoices). A one-time data
backfill (`@wizeworks/db db:backfill:property-name`) copies any custom `businessName` into a
placeholder `Property.name` so no merchant sees a regression, and strips the dead override key.

There is deliberately **no builder and no email at the tenant level** — both are authored against
a property; a "tenant-wide" email simply renders on behalf of the tenant's primary site.

---

## 4. Data model sketch

A new `Site` entity, and a re-key of the presentation layer from `(tenant, …)` to `(site, …)`.

```sql
CREATE TABLE sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  slug          VARCHAR(63) NOT NULL,     -- stable per-tenant handle
  name          VARCHAR(255) NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false, -- exactly one per tenant
  status        VARCHAR(20) NOT NULL DEFAULT 'active', -- active | paused | archived
  -- which tenant-enabled modules this site exposes (subset of the tenant's set);
  -- null/empty = all enabled modules. Defer enforcement to a later phase.
  module_scope  JSONB DEFAULT '{}',
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_sites_tenant ON sites(tenant_id);
-- partial unique: exactly one primary per tenant
CREATE UNIQUE INDEX uniq_sites_primary ON sites(tenant_id) WHERE is_primary;
```

> The `is_primary` partial unique index mirrors the pattern already used for the active builder
> layout (see the "Builder multi-layouts" work) — one row flagged per tenant, enforced in the DB.

**Re-key (one site → many of each).** Every table that is one-per-tenant in the presentation layer
gains `site_id UUID NOT NULL REFERENCES sites(id)` and its unique key changes from `(tenant_id, …)`
to `(tenant_id, site_id, …)` (keep `tenant_id` for RLS; add `site_id` for scoping):

- Sitebuilder: `SiteConfig` (PK becomes `site_id`, not `tenant_id`), `SiteVersion`, `PageLayout`,
  `SiteLayoutBlock`, `SiteTheme`, `SiteLayoutDefault`, `SiteLayoutAssignment`,
  `TenantSectionDefinition`, `SitePublishSchedule`.
- Builder: `BuilderPage`, `BuilderLayout`.
- Commerce site: `SiteSettings`, `SiteTheme` (these are one-per-tenant today and
  drive the public render → must become per-site).
- CMS navigation: `NavigationMenu`/`NavigationItem` are referenced by `SiteLayoutBlock`; navigation
  is inherently per-site, so these re-key too (or gain a `site_id`).

**Stays tenant-level (Model A):** `Tenant`, `TenantBrand` (+ optional new `SiteBrand`), users,
catalog (`Product`/`ProductVariant`/collections), CRM (`Customer`/`B2BAccount`), orders, pricing,
inventory, billing, email sending domains, audit. These are the "shared back office."

**RLS:** every re-keyed table keeps `ENABLE + FORCE` RLS on `tenant_id` exactly as today. `site_id`
gets **no** RLS policy — it is scoped in application queries, not by Postgres (§2).

---

## 5. Routing & domains

Today: hostname → **tenant**, render its one site. With multi-site the resolver maps hostname →
**site** (→ its tenant):

- The domain/host mapping ([02-architecture-overview.md](../02-architecture-overview.md) routing,
  [24-domain-purchase-management.md](24-domain-purchase-management.md),
  [04-domain-ssl-automation.md](../04-domain-ssl-automation.md)) gains a `site_id`: each site has its
  own custom domain and/or its own `*.sparx.zone` subdomain.
- `wizeworks/apps/site` resolves `host → site`, loads that site's published `SiteVersion` + site theme,
  and `withTenant(site.tenantId)` for all data reads. `site_id` scopes the presentation reads;
  RLS still isolates the tenant.
- The primary site keeps the tenant's existing subdomain for backward compatibility; additional
  sites get new hostnames.
- Confirm (doc 32 §9 open question 2): switching the **active workspace** in the dashboard must
  never affect site host→site resolution — they're independent lookups.

---

## 6. Dashboard UX — a site switcher (distinct from the workspace switcher)

The dashboard already plans a **workspace** switcher in breadcrumb segment 1 (doc 32). Multi-site
adds a **site** scope _within_ a workspace. Proposed shape:

- A **site selector** scoped to the site-facing modules — Site Builder, Builder, site
  settings, navigation, CMS publishing targets. It picks "which site am I editing."
- **Back-office modules** that are tenant-wide in Model A (Commerce catalog, CRM, orders, billing)
  are **not** site-scoped and show no selector — they're the same across sites. This keeps the
  mental model honest: the selector only appears where the data is actually per-site.
- Breadcrumb (tentative): `Workspace › Site › Module › Section`, with the Site segment **only
  rendered for site-scoped modules**. Coordinate with [24-dashboard-shell.md](../24-dashboard-shell.md)
  and doc 32's segment model so the two switchers don't read as the same control.
- Single-site tenants (the default, and all tenants at migration) see **no site switcher at all** —
  it appears only once a second site exists. Zero friction for the common case.

---

## 7. Billing

Per [17-billing-subscriptions.md](../17-billing-subscriptions.md), billing is per tenant + per
enabled module. A second site is a natural **add-on line item** (a per-additional-site fee), the
same coordination concern doc 32 flagged for creating a second workspace (R5).

**Decision (2026-06-04): flat per-additional-site add-on**, NOT a higher plan tier. The tenant's
**primary** site is included in the base plan; each **additional** site (`properties` rows where
`is_primary = false`) is one recurring add-on line item. Rationale: keeps the mental model honest
(you pay per extra site, regardless of plan), mirrors the per-module add-on shape already in doc
17, and makes the "create a second site" CTA a clear, predictable upsell. Enforcement (metering
the add-on, gating create-site behind the subscription) lands with the billing build — until then
create-site is open. The Sites settings page is where the count surfaces.

---

## 8. Migration

Backfill is mechanical and low-risk because every tenant has exactly one site today:

1. Create one `sites` row per existing tenant, `is_primary = true`, `slug = 'primary'` (or derived
   from the tenant slug), `id` newly generated.
2. Add `site_id` (nullable first), backfill every re-keyed presentation row with that tenant's
   primary `site.id`, then set `NOT NULL` and swap the unique keys.
3. Point the tenant's existing domain/subdomain mapping at the primary site.
4. Hand-author the SQL for the PK change on `SiteConfig` (tenant_id → site_id) and the unique-key
   swaps — Prisma won't generate the RLS policies or the partial unique index, so those are
   hand-edited into the migration ([wizeworks/packages/db/README.md](../../packages/db/README.md)). Run it
   through the **DB Migrate pipeline**, never a local Auth Proxy (Cloud SQL is private-IP).

After migration the platform behaves identically for every existing tenant (one primary site);
multi-site is purely additive from there.

---

## 9. Open questions / out of scope

- **⚠️ Per-site _applied_ theme + emails** — RESOLVED as the governing rule in §3·A and scheduled as
  **Phases 6–8** (§10). The earlier "leave `sitebuilder_*` tenant-level" stance is superseded for
  the _applied_ theme (the `SiteTheme` library stays tenant-wide; the publish state + write-through
  go per-property). This was the critical flaw; it is no longer open.
- **Per-site brand override** (§3) — ✅ shipped Phase 4 (`Property.brand_override`, presentation
  identity: display name + brand colors + logo, merged over the tenant brand). The §3·A rule makes
  it the canonical _applied_ brand for a site.
- **Model B scoping** — ✅ BUILT 2026-06-05 (catalog + content) via per-site junction tables
  (EMPTY = all sites). Implemented as join tables rather than a nullable `site_id` column so an
  item can be on _several_ sites, not just one. Whether **pricing visibility** is per-site is still
  open (the junctions don't carry price). Explicit cross-site **sharing** modes are the §3 🔖
  bookmark.
- **Per-site module scope** — can a site expose a subset of the tenant's enabled modules
  (`sites.module_scope`)? Enforcement deferred.
- **Customer accounts across sites** — one shopper logging into two sibling sites
  ([27-customer-accounts-site-auth.md](27-customer-accounts-site-auth.md)): shared
  login across the tenant's sites, or per-site? (Leaning shared, since customers are tenant-level.)
- **Search** — ✅ BUILT 2026-06-05. The site `products` collection gained a `property_ids`
  facet; a global product carries the `__all__` sentinel, a scoped product its property ids, and
  the site filters `property_ids:=[__all__,<propertyId>]` so per-site search (incl. the
  `found` count) is site-correct. Admin/dashboard search stays unscoped (sees every product).
  `ensureSchemas` self-heals the additive field on the next indexer boot. Universal/⌘K search
  ([39-universal-search.md](../39-universal-search.md)) is admin-facing, so it stays tenant-scoped.
- **Email from-identity per site** — Phase 7 makes email **content** per-site (authored emails,
  broadcasts, the published email), but the **from-identity** — a per-site sending domain /
  from-address ([13-email-platform-prd.md](../13-email-platform-prd.md)) — stays tenant-wide for now.
  Per-site sending domain is still deferred (a Mailgun-domain-per-site concern, not a content one).
- **Hard isolation** is explicitly **not** a multi-site feature — that's multi-workspace (§2).

---

## 10. Phasing

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Depends on                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 ✅  | `Property` entity + migration (one primary site per tenant); re-key the **Builder** presentation layer (`builder_pages`/`builder_layouts`/`builder_page_assignments`) to `property_id`; **no UX change**. Legacy `sitebuilder_*` left single-site (retiring).                                                                                                                                                                                                                                                                                                                                      | DB Migrate pipeline; hand-authored RLS/keys SQL                                      |
| 2 ✅  | Host→property routing (`domains` dispatch table + resolver + Caddy authorization); create-additional-site flow; per-site `*.sparx.zone` subdomain + BYO custom-domain connect/verify; site renders the resolved site (`wizeworks/apps/site` host→property threading).                                                                                                                                                                                                                                                                                                                              | Phase 1; [04](../04-domain-ssl-automation.md)/[24](24-domain-purchase-management.md) |
| 3 ✅  | Dashboard **Sites** settings hub + in-builder **site switcher** (cookie → `x-sparx-property-id`); single-site tenants see nothing new.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Phase 2; doc 32 breadcrumb; [24](../24-dashboard-shell.md)                           |
| 4 ✅  | Per-site **brand override** (`Property.brand_override` JSON; presentation-only identity — display name + theme colors + logo; merged over the tenant brand in the public payload). Amends [34](../34-platform-glossary.md)/[33](../33-token-model-v2.md).                                                                                                                                                                                                                                                                                                                                          | Phase 3                                                                              |
| 5 ✅  | **Model B per-site scoping — BUILT (2026-06-05).** Per-site **catalog + content** via `commerce_product_properties` / `content_entry_properties` junctions (EMPTY = all sites, the default); site reads + **sitemap** + **Typesense `property_ids` facet** all site-scoped; dashboard **"Visible on sites"** control on the product + Pages + content-entry editors; **make-primary** now re-points the bare host (subdomain-follow). **Still deferred:** per-site `module_scope`, billing add-on metering, per-site SiteSettings/nav, explicit cross-site **sharing** modes (the §3 🔖 bookmark). | [17](../17-billing-subscriptions.md), [39](../39-universal-search.md)                |

**Phases 6–8 — the per-site _application_ correction (specced 2026-06-12).** These realise §3·A;
same layout language as the table above. Build in order, deploy each small.

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Depends on                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 6a ✅ | **Per-site _applied_ theme — BUILT (2026-06-12).** `property_id` on `SiteConfig` (composite PK `(tenant_id, property_id)`), `SiteVersion` (version numbers per `(tenant, property)`), `SitePublishSchedule`, and the write-through `SiteTheme`; backfilled each to the tenant's **primary** property (migration `20260809000000_sitebuilder_per_property`, RLS-loop backfill). `PropertyContext` threaded through `publishService`, `savedThemeService.apply`, `scheduleService`, `themeService` + the sitebuilder MCP (`toPropertyContext`, optional `propertyId` tool arg); `toSitebuilderPropertyContext` reads `x-sparx-property-id`. The scheduled-publish tick reads `propertyId` off the schedule row. `GET /v1/public/site/site` gained optional **`?property=`**; `wizeworks/apps/site` threads `propertySlug` (incl. per-site cache tag). Commerce `getTheme`/`updateTheme` + the public tenant payload read the active site's `SiteTheme`. `SiteTheme` _library_ stays tenant-wide. RLS unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Phase 5; DB Migrate pipeline                   |
| 6b ✅ | **Per-site `SiteSettings` — BUILT (2026-06-12).** `property_id` on `commerce_site_settings` (composite PK; migration `20260810000000_site_settings_per_property`, RLS-loop backfill to primary) with **primary-fallback inheritance** — `siteService.resolveSettingsRow(tx, tenant, property)` resolves own row → primary's → code defaults, shared by every reader so a new site never silently resets currency/locale/policy. `getSettings`/`updateSettings` take `propertyId` (dashboard route resolves `x-sparx-property-id`); the public tenant payload, the cart's origin-site currency, and the tenant-wide search projector (primary's currency) all route through the resolver.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 6a                                       |
| 6c ✅ | **Per-site legal footer placements — BUILT (2026-06-12).** `property_id` (nullable) on `SiteDocPlacement` (migration `20260811000000_legal_placements_per_property`; purely additive — null = tenant-wide, every pre-rollout row stays so; per-site unique adds `property_id`). The public `GET /v1/public/legal/placements` gained `?property=` and returns `(null ∪ resolved site)`, so a site never shows a sibling site's exclusive legal links; `wizeworks/apps/site` threads the active `propertySlug` (+ per-site cache tag). Dashboard `/v1/legal/placements` is property-aware: GET shows tenant-wide + active-site rows (returns `propertyId`), POST takes a `siteScoped` flag (default off = tenant-wide) scoping the placement + dup-check to the active site; the starter-template auto-placement stays tenant-wide. Dashboard "this-site-only" toggle UI is a thin frontend follow-on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Phase 6a; [42](../42-legal-and-consent.md)     |
| 7a ✅ | **Per-site broadcast brand — BUILT (2026-06-12).** `property_id` (nullable, SetNull) on `Broadcast`/`ScheduledSend`/`EmailEvent` (migration `20260812000000_email_per_property`, additive). `brandService.resolveEmailBrand(ctx, propertyId?)` merges `Property.brand_override` field-by-field over the tenant brand (the site merge), so an email sent on behalf of a site renders that site's name/colors/fonts/logo (null → primary). A broadcast captures the active site at create (`x-sparx-property-id`); the static render brands once with the site brand, deferred (personalized) sends carry `property_id` so the dispatch tick brands per-recipient in the right site brand.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 7a                                       |
| 7b ◐  | **Per-site emails — render path BUILT (2026-06-12); authoring + overrides remain.** _Built:_ the **email-worker** brands `template` sends from `email.send.property_id` (the dispatch tick carries `ScheduledSend.property_id` into the published event; `resolveEmailBrand` resolves the **site** brand). The **email-worker** also stamps `property_id` as a Mailgun user-variable on every send, and the **webhook receiver** persists it on `EmailEvent` (per-site engagement analytics; broadcast-derived fallback for pre-stamp sends). **Both** automation engines stamp `ScheduledSend.property_id` from the source event — the lean `@wizeworks/email-sends` `enqueueSend` gained `propertyId`, the docs/81 `email.send_campaign`/`send_internal` executors probe `propertyId`/`order.propertyId`/`customer.propertyId` in the resolved fields, and the legacy `email-platform` `evaluateTrigger` probes `propertyId`/`order.propertyId`. The campaign + transactional render path is now per-site **end-to-end**; it stays **dormant** for order/checkout-triggered sends until those events carry `property_id` (orders aren't property-scoped yet — a separate Commerce slice), then lights up with no further change. _Remaining:_ `property_id` on `BuilderEmail` + email-builder authoring scoped per-site; built-in transactional overrides per-site with a tenant-wide fallback (`(tenant, property, key)` → `(tenant, key)`) — **BLOCKED** on settling email-defaults = Builder-authored node-trees vs coded `DEFAULT_AUTOMATIONS`. `EmailSettings`/`SendingDomain` stay tenant-wide (per-site sending domain deferred, §9). | Phase 7a                                       |
| 8a ✅ | **Per-site blueprint install — BUILT (2026-06-12).** `POST /v1/blueprints/:key/install` accepts an optional target **`property_id`** in the body — validated strictly to the tenant (`requireTenantProperty`, 404 on miss; an explicit target never silently retargets to primary the way a header does), else the **active** site (`x-sparx-property-id`), else primary. The catalog `GET /v1/blueprints` now reads the **active** site's install state (per-site installed/available badges, not the primary's). The installer itself was already property-aware (Phase 6a `propCtx` threading + the primary→tenant-brand / secondary→`brand_override` split), and the `(tenant, property, blueprint)` install-row key already allows the same blueprint on multiple sites — so a secondary-site install themes + brands + scopes content/products to that site without touching its siblings (supersedes docs/54 D6 "always primary").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Phases 6–7                                     |
| 8b ✅ | **New-site create wizard — BUILT (2026-06-12).** The platform modal `SurfaceFrame` (docs/86, Builder-Indigo rail) in three steps: **starting point** (blank, or a blueprint from `GET /v1/blueprints` — a themed site with its own pages/products/content/emails), **name & address** (name + handle with a live `<handle>.<tenant>.sparx.zone` preview), **review** (a Publish-immediately switch, then create). One server action `createSiteWithBlueprint` runs the whole arc — create `Property` → install the blueprint **into the new site** (8a's explicit `property_id` target) → optional go-live → switch the dashboard to it — best-effort about never losing the created site if a later step fails, and a success panel deep-links into the Builder / the live site / Review-&-go-live. **Replaced** the inline create form in Settings › Sites (`sites-manager.tsx` now opens the wizard; e2e updated to drive it). A custom domain is connected afterward on the site card (the zone subdomain is instant). Dismissing the wizard (backdrop / Esc / Cancel) after entering any detail prompts a discard-confirm, so an in-progress site is never lost.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase 8a; [86](../86-surface-frame-pattern.md) |

**Phase 9 (follow-on) — order-triggered per-site emails (tracked dependency, not started).** The 7b
render path is per-site **end-to-end** but **dormant** for order/checkout-triggered sends: `order.*`
events don't yet carry `property_id`, so `evaluateTrigger` / the docs/81 executors resolve `null` →
the tenant's **primary** brand (fails safe — never a sibling site's brand). A small **Commerce**
slice — stamp the originating site's `property_id` on the order at checkout and on `order.created` /
`order.paid` / `order.fulfilled` — lights up order-confirmation + shipping emails in the buying
site's brand, and makes `EmailEvent.property_id` carry the real site for those sends, with **no
email-side change** (the worker already forwards whatever `property_id` the event supplies). Until it
lands, those sends correctly fall back to the primary brand. See
[09-ecommerce-prd.md](../09-ecommerce-engine-prd.md) checkout/order events.

---

## 11. Docs to update when this lands

- ✅ [32-workspace-switching-breadcrumb.md](../32-workspace-switching-breadcrumb.md) §2 — softened the
  "no Site model" statement to "no Site model _for the workspace axis_"; points here for the site axis.
- ✅ [34-platform-glossary.md](../34-platform-glossary.md) — **Site** added as a first-class term ("a
  tenant has one _or more_ sites"); brand-override amendment recorded.
- ✅ [05-data-model.md](../05-data-model.md) — `properties` table + the `property_id` scoping column +
  the Model B junction tables noted (the model is junction-table, not a single `site_id` column).
- ✅ [02-architecture-overview.md](../02-architecture-overview.md) / [04](../04-domain-ssl-automation.md) /
  [24-domain-purchase-management.md](24-domain-purchase-management.md) — host→site resolution noted.
- ✅ [17-billing-subscriptions.md](../17-billing-subscriptions.md) — per-additional-site add-on noted.
- [00-README.md](../00-README.md) — index entry (already stale; see note in §9 of doc 48 work).
