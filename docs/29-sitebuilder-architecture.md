# Site Builder Architecture

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Purpose & scope

This document is the implementation contract for the **Site Builder** (the `storefront`
module). [docs/08-site-builder-spec.md](08-site-builder-spec.md) is the product vision; this
is _how it is built_ on top of the already-shipped platform.

The Site Builder gives merchants a theme system, a visual customizer, section-based page
composition, light/dark theming, and a draft → publish → schedule → rollback lifecycle —
all rendered by the existing tenant-aware storefront.

### What already exists (consume, do not rebuild)

| Capability                | Where                                                                                      | Site Builder relationship                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| TipTap content pages      | `Page` model (10-cms-pages), CMS dashboard, storefront `[...slug]` + `PageView`            | CMS keeps prose pages; Site Builder owns _section-composed_ pages                                      |
| Media library             | `MediaAsset` (15-cms-media), `mediaUrl()`, CMS media-picker                                | Reused for logos / section images                                                                      |
| Navigation menus          | `NavigationMenu`/`NavigationItem` (16-cms-navigation), CMS menu-editor (`/cms/navigation`) | Owned by CMS; Site Builder binds a menu into a layout slot by id (read-only); storefront consumes them |
| Redirects, preview tokens | `Redirect`, `PreviewToken`, `?sparxPreview=`                                               | Reused for draft preview                                                                               |
| Limited theme tokens      | `StorefrontTheme` (47-commerce-storefront), `themeToCss()`                                 | **Write-through target** — see §4                                                                      |
| Onboarding state          | `GET/PATCH /v1/tenant/onboarding`, `tenants.settings.onboarding`                           | Extended by the onboarding wizard                                                                      |

### What this build adds

Theme catalog + switching, homepage/page section composition, the visual customizer, the
draft/publish/schedule/rollback lifecycle, light/dark theming, the storefront section &
mode rendering, and the 5-step onboarding wizard.

---

## 2. Module boundaries (binding)

- **Commerce owns `StorefrontTheme`.** Site Builder never adds columns to
  `commerce_storefront_themes`; it only upserts a _derived projection_ of the published
  light tokens into that row, inside the same `withTenant` transaction as the publish.
  Once a tenant has a `SiteConfig`, the customizer is the only writer of that row.
- **CMS owns navigation menus; Site Builder owns the layout slots.** The
  `NavigationMenu`/`NavigationItem` models live in `16-cms-navigation.prisma` and the menu
  editor is under `/cms/navigation` (menus are information architecture — content). Site Builder
  owns only the layout SLOTS: `SiteLayoutBlock` references a menu by nullable FK
  (`navigationMenuId`) and the slot editor at `/sitebuilder/navigation` reads the menu list
  read-only to populate that picker — it never edits a menu tree. The `/v1/navigation/*` REST
  endpoints are module-neutral and unchanged (the storefront consumes the same rows); table
  names (`navigation_menus`/`navigation_items`) are unchanged, so the ownership move is a
  no-op at the database level. A `NavigationItem` may link to a CMS `ContentEntry` — now an
  intra-module reference. See [docs/30-sitebuilder-redesign.md](30-sitebuilder-redesign.md) §8.
- **Schema domain split.** Site Builder models live in `49-sitebuilder.prisma`; navigation
  menus live in `16-cms-navigation.prisma` (CMS domain). Only inverse-relation arrays touch the
  tenant hub (`02-tenant.prisma`).
- **One service, many transports.** REST and MCP are thin wrappers over the
  `packages/sitebuilder` service layer (mirrors the CRM contract). No business logic in
  routes.
- **Module gating.** Every admin and public route gates on `isModuleEnabled(tenantId,
'storefront')`; a disabled tenant returns the standard 404.

---

## 3. Data model

`packages/db/prisma/schema/49-sitebuilder.prisma` — five tenant-scoped models, all
`ENABLE + FORCE` RLS with a `<table>_tenant_isolation` policy on `current_tenant_id()`.

- **`SiteConfig`** (PK = `tenantId`) — the editable source of truth. `themeKey`,
  `appearancePolicy`, `draftSettings` JSONB (both light + dark palettes, fonts, layout,
  custom CSS), `publishedVersionId` FK.
- **`SiteVersion`** — immutable published snapshots for history + rollback.
  `versionNumber` (unique per tenant), `themeKey`, `appearancePolicy`, `settingsSnapshot`,
  `sectionsSnapshot`, `layoutSnapshot`, `compiledTokens` `{ light, dark }`.
- **`SiteSection`** — draft page composition: `pageKey` (`"home"` or a CMS page slug),
  `sectionType`, `position`, `visible`, `config` JSONB. Published copies live in
  `SiteVersion.sectionsSnapshot`.
- **`SiteLayoutBlock`** — header / footer / announcement per slot, with a nullable
  `navigationMenuId` reference. Unique `(tenantId, slot)`.
- **`SitePublishSchedule`** — `scheduledAt`, `status` (pending/published/cancelled/failed),
  `resultVersionId`, `error`. Index `(status, scheduledAt)` drives the due-scan.

**Versioning = separate snapshot table** (not per-field history, not a JSONB array on the
config row): cheap "list versions", rollback is one upsert, and a scheduled publish can FK
a specific version.

A `find_due_site_publishes(int)` `SECURITY DEFINER` function (mirroring CMS
`find_due_scheduled_entries`) lets the `sparx_app` role scan due schedules across tenants
without RLS bypass; per-row writes still ride `withTenant`.

---

## 4. Theme engine & write-through

`packages/storefront-themes` holds the six themes (apex, industrial, drift, market, fleet,
drop) as dependency-light TS presets. Each preset declares a settings schema (field types:
`color | font | select | text | number | boolean`) and **token defaults for both `light`
and `dark`**.

`compileTokens(themeKey, overlay)` returns `{ light, dark }` — each mode merges that mode's
preset defaults with the merchant's overlay into a flat CSS-custom-property map.

**Write-through on publish:** `publish-service.publishNow` compiles, writes a `SiteVersion`,
and upserts the **light** subset that maps to existing `StorefrontTheme` columns — all in
one `withTenant` transaction. The storefront's current `themeToCss()` `:root` injection is
unchanged. The **dark** map and richer detail travel via the public read endpoint (§6).

Rationale for write-through over superseding or extending `StorefrontTheme`: it keeps the
storefront token read path untouched ("deploy small"), preserves the commerce-owned
override contract, and avoids putting versioning/JSONB on a commerce table that has no draft
concept.

---

## 5. Sections

`packages/sitebuilder-schemas` is the single source of truth for section config — one Zod
schema per type (`hero`, `featured-products`, `testimonials`, `collection-grid`,
`rich-text`, `image-banner`, `email-signup`) plus a `SECTION_REGISTRY` consulted by the
customizer (form generation), the service (validation), and the storefront (rendering).

The storefront renders an ordered, visible-filtered section list through
`components/section-renderer.tsx`, switching `sectionType` against a component map. The
current hardcoded commerce homepage remains the **empty-store fallback** when no sections
are configured.

---

## 6. Publish lifecycle & preview transport

```
edit ─▶ draftSettings / SiteSection rows (autosave, ETag-guarded)
          │ publishNow / scheduled tick
          ▼
       SiteVersion N (immutable)  ──compile──▶ StorefrontTheme (light tokens, write-through)
          │                                     └─ dark tokens + sections via public endpoint
          ▼
   SiteConfig.publishedVersionId = N
          │ rollback(versionId) → copy snapshot back into draft → publishNow
          ▼
       SiteVersion N+1
```

- **Public read:** `GET /v1/public/storefront/site?tenant=<slug>` returns the published
  snapshot (layout + per-page sections + `appearancePolicy` + dark tokens). With
  `?sparxPreview=<token>` it returns the **draft** composition, reusing the existing
  preview-token mechanism.
- **Customizer preview:** the dashboard hosts the draft storefront in an iframe. Token
  edits push to the iframe via `postMessage` CSS-var injection (no reload) for the shown
  mode; structural edits debounce-PATCH the draft then refresh; a theme swap reloads.
- **Scheduled publish:** an in-process advisory-locked tick in `services/api-rest`
  (mirroring `scheduled-publish.ts`, distinct lock key) scans `find_due_site_publishes`
  and runs `publishNow` per due tenant. No Pub/Sub worker, no new Cloud Run service.

---

## 7. Light / dark

Each merchant picks an `appearancePolicy`:

| Policy       | Runtime behavior                                                              |
| ------------ | ----------------------------------------------------------------------------- |
| `light-only` | `data-theme="light"` fixed                                                    |
| `dark-only`  | `data-theme="dark"` fixed                                                     |
| `auto`       | Follows the shopper's `prefers-color-scheme`                                  |
| `toggle`     | Shopper switch in the header; choice persisted in a cookie so SSR stays right |

The storefront layout injects `:root { … }` (light, via write-through) **and** a
`[data-theme="dark"] { … }` block from the dark token map, plus an inline no-flash script
that resolves the initial `data-theme` from the policy. The toggle is a small client island
rendered only when policy = `toggle`.

---

## 8. CMS pages vs. Site Builder pages

Both can produce a storefront page; they are different tools and must never present two
competing "Pages" UIs:

- **CMS Pages** — long-form prose (About, policies, blog landing) authored in TipTap.
  Owned by the CMS module.
- **Site Builder Pages** — marketing/landing pages _composed from sections_ (hero, product
  grids, testimonials). Owned by Site Builder, distinguished by `type_key`.

The dashboard cross-links the two with a callout so a merchant always lands in the right
editor; the storefront catch-all renders whichever exists for a slug, with sections
composed around `PageView` when both are present.

---

## 9. Delivery phases

Built in independently shippable phases (see the project plan): data model → theme/section
libs → service package → REST routes → scheduled publish → public endpoint → storefront
rendering → dashboard customizer → MCP tools → onboarding wizard.

Flagged follow-ons (out of the first build): Stripe Connect OAuth, custom-domain self-serve,
dropship supplier import, a first-class `Tenant.category` column.
