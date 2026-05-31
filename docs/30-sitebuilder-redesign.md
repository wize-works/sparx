# Site Builder Redesign

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Purpose & scope

The Site Builder is the platform's centerpiece — the first surface a merchant touches and
the lens through which they judge everything else. The first build ([docs/29-sitebuilder-architecture.md](29-sitebuilder-architecture.md))
shipped a working backend (theme engine, section schemas, draft→publish→rollback, storefront
rendering) behind a dashboard that is assembled as **six disconnected admin screens** rather
than one creative tool — and whose core loop (change something → see it) is broken end to end.

This document is the **redesign contract**. It supersedes the dashboard/UX layer of doc 29 and
**extends** its data model. The service layer, versioning, theme engine, and section-schema
registry from doc 29 are sound and are reused; the work is concentrated in (a) the dashboard
module's composition, (b) the preview transport, (c) a new **layout/template** abstraction that
turns the Site Builder into the platform's layout layer, and (d) lifting **brand** into a
tenant-level source of truth (§6).

Doc 29 remains the as-built reference for the backend it describes; where this doc and doc 29
disagree on dashboard structure, module ownership of navigation, or the page model, **this doc
wins** and doc 29 is amended in the phase that lands the change.

### What's wrong today (evidence-based)

A live walkthrough of `app.sparx.works` (tenant: E2E Shop) plus a full read of the module
confirmed seven issues, each traced to a concrete cause:

| #   | Symptom                        | Root cause                                                                                                                                                                                               |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No work-area padding           | `sitebuilder/layout.tsx` wraps children in `py-10` only — vertical padding, no horizontal gutter, no container.                                                                                          |
| 2   | Layout feels sparse/unbalanced | Fixed two-column grids with no empty-state composition; the "site" is never shown as a whole.                                                                                                            |
| 3·6 | Flow is fragmented             | Six sibling routes, each a standalone page-load with its own data fetch + preview. No shared canvas.                                                                                                     |
| 4   | Weak functionality             | `@dnd-kit` installed but unused (reorder is ▲▼ buttons); image fields are raw id text boxes; no duplicate/undo/inline edit.                                                                              |
| 5   | Rough UX                       | Section editor is a modal that **covers** the preview; two Light/Dark toggles in the customizer; self-contradicting copy.                                                                                |
| 7   | **"It doesn't apply"**         | Preview iframe hardcodes `?sparxPreview=1`; the storefront expects a JWT preview token and **falls back to the published snapshot** on an invalid token, so draft edits never appear. **Verified live.** |

---

## 2. North star

> Stop presenting the store as six admin forms. Present it as **one living thing the merchant
> edits in place**, where every change is reflected immediately in an honest preview, and where
> a layout designed once can be applied to many items across Commerce and CMS.

Three commitments follow:

1. **One screen.** A single unified editor replaces the six-route hub.
2. **Direct manipulation.** Select in the canvas, edit in a docked inspector beside the live
   result — never a modal over the preview. Drag to reorder.
3. **The preview tells the truth.** It renders the **draft** via a real preview token and
   updates the instant a save lands.

And two expansions of mission:

4. **Site Builder is the platform's layout layer.** It authors reusable, scoped page
   **layouts**; Commerce and CMS assign those layouts to their content.
5. **Brand is one source of truth.** Identity (logo, palette, type, name) is a tenant-level
   primitive every surface reads and none may override (§6).

---

## 3. The unified editor

A single full-bleed workspace at `/sitebuilder`, composed of four regions. All chrome is built
from `@sparx/ui` components (CVA + Radix + tokens per [docs/23-frontend-component-architecture.md](23-frontend-component-architecture.md));
no raw Tailwind appears in feature code, and the workspace sits inside `<ModuleProvider module="storefront">`.

```
┌──────────────────────────────────────────────────────────────────────┐
│  STATUS BAR   draft · unpublished changes · published   [Schedule][Publish ▾] │
├───────────────┬──────────────────────────────────────┬───────────────┤
│  STRUCTURE    │                                       │  INSPECTOR    │
│  RAIL         │            LIVE CANVAS                │  (contextual) │
│               │   (draft storefront, real preview     │               │
│  ▸ Brand      │    token, device toggles, click a     │  settings for │
│  ▸ Theme      │    section to select it)              │  the selected │
│  ▸ Layouts    │                                       │  section /    │
│    · Home     │                                       │  layout /     │
│    · Products │                                       │  theme        │
│    · Collections                                      │               │
│    · Pages    │                                       │               │
│    · Custom   │                                       │               │
│  ▸ Sections   │                                       │               │
│  ▸ Nav slots  │                                       │               │
└───────────────┴──────────────────────────────────────┴───────────────┘
```

- **Canvas (center).** The tenant's storefront in draft mode, one persistent iframe (replacing
  the two separate preview harnesses). Device toggles (desktop/tablet/mobile) and a light/dark
  switch live once, here. Clicking a section in the canvas selects it; the inspector opens for it.
- **Structure rail (left).** What you're editing: **Brand** (the tenant identity, §6), the active
  **layout** (grouped by scope — Home, Products, Collections, Pages, Custom), its **sections**,
  the **nav slots** (header/footer/announcement), and global **Theme**. Reorder sections by drag
  (`@dnd-kit`, already a dependency). Add sections from a **visual gallery** with thumbnails,
  not a text list.
- **Inspector (right).** Settings for the current selection — section config, layout assignment,
  slot appearance, brand fields, or theme tokens — docked beside the live result so a change is
  always visible as it's made. Image fields use the existing CMS **media picker**, never a raw id box.
- **Status bar (top).** One owner of publish state and actions: Draft / Unpublished changes /
  Published, plus Publish, Schedule, and version history in one menu. Replaces the duplicated/
  missing `PublishBar`.

Themes, Pages, and Navigation cease to be destinations; they become rail entries and panels
within this one screen.

---

## 4. The layout/template model

Today the Site Builder composes a section list bound to a single slug (`pageKey` = `"home"` or
one CMS slug), and product/collection pages are 100% hardcoded React. The redesign introduces a
**reusable, scoped layout** that other modules assign to content.

### 4.1 Scope

Every layout is typed by **scope**, which determines the data context and the set of section
types allowed inside it:

| Scope                    | Renders                                   | v1                                  |
| ------------------------ | ----------------------------------------- | ----------------------------------- |
| `home`                   | The storefront homepage                   | ✅                                  |
| `product`                | A product detail page, bound to a product | ✅                                  |
| `collection`             | A collection/category page, bound to one  | ✅                                  |
| `cms-page`               | A CMS `page`-typed entry                  | ✅                                  |
| `custom`                 | A standalone landing page at a slug       | ✅ (generalizes today's slug pages) |
| `blog-post`, `search`, … | later                                     | —                                   |

**Email is a natural future scope.** The composer the Email module is prototyping is this same
model with a different render target: its "static / dynamic / personalized" blocks are exactly
static vs bound, with the **recipient** as the assigned item. Folding email authoring in as an
`email` scope would give the platform one design surface — and one brand — across storefront
_and_ email, retiring the separate email builder. The seam: Site Builder owns the **authoring**
(composition + bindings + brand/theme); the Email module keeps all email **functionality** —
sending, automations, recipients, deliverability, assignment of template→automation, and
crucially the **email renderer** (React-Email/MJML with _inlined_ styles, since `var(--…)`
doesn't survive in mail clients). One authoring model, scope-specific section libraries, two
renderers. Deferred — recorded here, not in the current phases (§12); coordinate with the Email
module's roadmap before committing.

### 4.2 Static vs. bound sections — the crux

What makes a layout a _template_ and not a one-off page is that it mixes two kinds of section:

- **Static sections** — authored once, identical for every item the layout applies to (hero,
  rich text, image banner, newsletter, testimonials). These already exist in the doc-29
  `SECTION_REGISTRY`.
- **Bound sections** — resolve from the **assigned item** at render time. These are the **core
  new build**. For v1:
  - `product` scope: product gallery, title/price/availability, add-to-cart + variants, product
    meta, fitment table, reviews, related products.
  - `collection` scope: collection header, the product grid, filters/sort, pagination.

Bound section types are **scope-restricted** — a product gallery cannot be dropped into a `home`
layout. The current hardcoded PDP/PLP become the **seeded default templates** for their scopes,
expressed as bound-section compositions, so existing storefronts render identically on day one.

**Two senses of "bound" — and both are total in the real build.** _Style_ is always bound:
every section, static or bound, draws its colors, type, spacing and radii from the brand + theme
tokens (§6), never hardcoded values (the platform token rule, [docs/23-frontend-component-architecture.md](23-frontend-component-architecture.md)).
Change the brand once and every section reflects it. _Content_ binding is available everywhere
too: "static" denotes only a section's **default content source** (authored, same for every
item) — not a wall. A static heading or CTA can still interpolate fields (`{{product.title}}`,
`{{brand.name}}`) or target a dynamic destination. The static-vs-bound distinction is about where
a section's content comes from _by default_, not whether it may bind. (The static/bound colour
legend in the editor concept is a teaching device for content source, not a hardcoded-vs-dynamic
wall.)

### 4.3 Editing a scoped layout

When editing a `product` (or `collection`) layout, the canvas previews it **bound to a
representative sample item** the merchant picks (`preview against [sample product ▾]`). Bound
sections render that sample's real data; static sections render their authored content.

---

## 5. Assignment & ownership

A layout applies to **one or many** items. Ownership of the binding follows the same principle
as navigation (§8) and brand (§6): **Site Builder owns the layouts; the data module owns which
of its records uses which layout.**

| Concern                                          | Owner              | Mechanism                                                                                                |
| ------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------- |
| The layouts themselves (catalog, many per scope) | **Site Builder**   | `SiteTemplate` rows.                                                                                     |
| The **default** layout per scope / content type  | **Site Builder**   | A default mapping (scope/type → `templateId`). "Products default → Layout A"; "Article type → Layout C". |
| A **specific** per-item or per-group override    | **Commerce / CMS** | The override pointer lives on the record the module already owns (a product, a collection, an entry).    |

**Resolution at render** (storefront site-resolver): `item/group override (module-owned) → type
default (Site-Builder-owned) → seeded scope default → safety fallback`.

This satisfies both motivating stories: _"certain products have a special layout that highlights
them"_ (per-item override, Commerce-owned) and _"articles look different than blogs"_
(per-content-type default, Site-Builder-owned).

**Boundary preservation (binding).** Per doc 29 §2 and [docs/02-architecture-overview.md](02-architecture-overview.md),
Commerce/CMS must not grow Site-Builder-specific schema. The **default mapping table is
Site-Builder-owned**, and consuming modules never read it directly — the storefront's
site-resolver performs the join at render. The **per-item override** is the one pointer that
lives on the consuming record, owned and written by that module's API. (Open question 13.1:
finalize whether the override is a nullable FK on the entity vs. a small module-owned
assignment table — to be settled when §11 is specced.)

---

## 6. Brand (tenant-level)

Brand is the merchant's **identity** — business name, logo (light/dark), favicon, core color
palette, typography, tagline, social links. It is **vital and cross-cutting**: it must read
identically on the storefront, in transactional + marketing email, the customer account area,
invoices/PDFs, the B2B portal, and anywhere else the merchant is represented. It is **not** a
Site Builder concept, a Commerce concept, or an Email concept.

### 6.1 Ownership — a tenant-level source of truth

Brand is **owned at the tenant/platform level, above every module.** Three forces require it:

- **Module gating.** A disabled module stores no rows. If brand lived in Site Builder or
  Commerce, disabling that module would orphan the brand that Email and CRM still need. Brand
  must survive any single module being off.
- **Onboarding.** Brand (business name → logo → colors) is captured in the 5-minute onboarding
  flow ([docs/15-merchant-onboarding-prd.md](15-merchant-onboarding-prd.md)), before the merchant
  touches any module, and outlives every one of them.
- **It already fragments.** Brand is spread across Commerce `StorefrontTheme` (`logoMediaId`,
  `logoDarkMediaId`, `faviconMediaId` + color tokens) and a per-module
  `EmailSettings.brandingOverride`. `resolveEmailBrand` cascades Commerce `StorefrontTheme` →
  the email override → Sparx defaults; the intended Site-Builder-snapshot source is documented
  but `not yet exposed — falls through`. There is no single record a merchant sets, the email
  override is precisely the kind of per-module brand redefinition §6.2 forbids, and a merchant
  without a storefront has no shared identity for email. A tenant-level brand removes the
  fragmentation and the override.

### 6.2 Consumers read, never override (binding)

Brand is **read-only to every consumer.** CMS, Commerce, Email, the customer area, PDFs — **none
may override the brand.** They reference it; they never redefine it. This is the rule that makes
brand a _source of truth_ rather than another layer of defaults, and it is hard.

- The storefront **theme** _applies_ brand as its foundation and may add **presentation** tokens
  on top (layout, spacing, surfaces, dark-mode variants) — but it cannot redefine the brand's
  identity tokens (logo, brand/primary color, typography, business name, favicon). Brand color =
  brand color, everywhere.
- Email's `brandingOverride` is **removed**; `resolveEmailBrand` reads the tenant brand directly.
  (Email-specific, non-identity settings such as the CAN-SPAM footer stay in the email config —
  they are not brand.)
- Commerce's `StorefrontTheme` logo/favicon/palette **source from** brand rather than being
  independently editable identity.

### 6.3 Presence — primary, but editing a tenant record

Brand is surfaced **prominently** — set in onboarding and editable as a first-class **Brand**
rail entry in the Site Builder editor, plus a platform/settings Brand area for merchants without
the Storefront module. Every one of these surfaces _edits the single tenant brand record_; none
owns it (the same pattern as navigation in §8 — a consuming surface edits content it doesn't own).

The storefront theme then resolves as: **brand (identity foundation, read-only) → storefront
presentation tokens (theme) → merchant presentation overrides → write-through to `StorefrontTheme`.**

---

## 7. Preview transport — fixing "it doesn't apply"

This is the single highest-leverage fix and lands first.

**Root cause.** `preview-frame.tsx` and `customizer.tsx` set the iframe src to
`?sparxPreview=1`. The storefront treats `sparxPreview` as a **JWT preview token**, forwards it
as `Authorization: Preview <jwt>`, and on an invalid/expired token **deliberately retries
without preview**, returning the _published_ snapshot ([apps/storefront/lib/content.ts](../apps/storefront/lib/content.ts)).
`1` is never a valid token, so the preview always renders published. Section edits save
correctly but never appear; token (color) edits only _seem_ to work because the customizer
injects them via `postMessage` CSS variables, bypassing the snapshot fetch entirely.

**Fix.** The CMS already mints preview tokens (`/v1/content/preview-tokens`, consumed by the CMS
preview button). The Site Builder must do the same:

1. Mint a tenant/scope/page-scoped preview-token JWT server-side and put it in the canvas iframe
   src (replacing the literal `1`).
2. The storefront's draft path already honors a valid token — no storefront change required for
   structural content; it begins returning the **draft** composition.
3. Keep the `postMessage` channel for instantaneous token (color/font) feedback; structural and
   content edits reflect on save via the now-valid draft fetch.
4. On save, refresh/re-fetch the canvas so the change is visible immediately.

Acceptance: edit any section, save, and the canvas shows the new value without a manual reload.

---

## 8. Navigation ownership flip (Phase 1)

Moving navigation **into** Site Builder (doc 29 §2) was wrong. Navigation menus are information
architecture — **content**. The corrected split:

- **CMS owns the menus** — the `NavigationMenu` / `NavigationItem` trees and their editor.
- **Site Builder owns the slots** — the header/footer/announcement regions, their appearance,
  and which menu fills each (`SiteLayoutBlock.navigationMenuId`).

The seam already exists (the `navigationMenuId` FK), and the runtime is already aligned: the
storefront resolves menus live via `/v1/public/content/navigation/:id` and the SB version
snapshot stores only the menu _reference_. So the flip is a **forward refactor with no data
migration and no storefront change**.

**Scope of the move**

| Moves → CMS (`/cms`, `@sparx/cms-editor`)                                                       | Stays → Site Builder                                               | Unchanged (module-neutral)                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `NavigationMenu` + `NavigationItem` models (schema file → CMS domain, `@@map` unchanged)        | `SiteLayoutBlock` model                                            | Tables `navigation_menus` / `navigation_items` + RLS                    |
| `navigation/[location]/page.tsx`, `menu-editor.tsx`, `menu-detail.tsx`, `menu-actions.ts`, list | `layout-editor.tsx` (slots), `upsertLayout` action + slot MCP tool | `PUT /v1/navigation/menus/:location` (admin)                            |
| "Navigation" manifest section + `menu` entityType → `cmsManifest`                               | publish snapshot of slot→menu refs                                 | `GET /v1/public/content/navigation/:id`, storefront `getNavigationMenu` |

**Steps:** relocate the two models to `16-cms-navigation.prisma` (verify `prisma migrate diff`
is empty — no migration); move the four editor files to `/cms/navigation` and repoint
`revalidatePath`; split the old `/sitebuilder/navigation` hub (Menus → CMS, slot `LayoutEditor`
stays in SB); move the manifest section + entityType to `cmsManifest`; repoint cross-links (the
SB slot editor's "edit this menu's links" → `/cms/navigation/:location`); amend doc 29 §2 +
schema/code header comments (with a version bump on doc 29).

**Accepted consequence — two publish rhythms.** After the flip, menu **link edits go live
immediately** (CMS content, read live by id), while the **slot→menu binding + slot styling are
versioned** and go live on a Site Builder publish. This is already the runtime behavior and is
the correct outcome — nav links should not require a full site re-publish.

---

## 9. Publish lifecycle

Unchanged in mechanism, generalized in subject. The doc-29 draft → publish → schedule →
rollback pipeline is reused: a **layout** is just another versioned, scoped snapshot keyed by
`(scope, templateId)` instead of `pageKey = "home"`. The write-through to `StorefrontTheme` and
the scheduled-publish tick are untouched. Version history and rollback in the status-bar menu
operate over the same `SiteVersion` table.

---

## 10. Craft details (Phase 1, non-negotiable)

The details that separate "prototype" from "product," each small and collectively decisive:

- Real work-area padding + a max-width container in the module layout.
- Guided **empty states** that lead to a first section.
- A **visual section gallery** (thumbnails) instead of a text list.
- The CMS **media picker** wired into every image field.
- Sensible **section defaults** so a freshly added section looks good before it's touched.
- A single light/dark toggle and a single device-toggle bar (de-duplicated).

---

## 11. Data model changes

New / changed models (all tenant-scoped, `ENABLE + FORCE` RLS with a `<table>_tenant_isolation`
policy on `current_tenant_id()`; RLS is **hand-edited into the migration SQL** — Prisma does not
generate it, per the established pattern):

- **`TenantBrand`** (new, tenant-level, **not** module-gated) — business name, logo light/dark +
  favicon (media FKs), core color palette, typography, tagline, socials. The single source of
  truth (§6). Migration **consolidates** Commerce `StorefrontTheme.{logoMediaId, logoDarkMediaId,
faviconMediaId}` + Email `brandingOverride` into it; `resolveEmailBrand`, the storefront theme
  resolver, and the SB theme foundation all read it (no consumer override). Exact home (dedicated
  table vs. `tenants.settings.brand`) — see open question 13.4.
- **`SiteTemplate`** (new) — a reusable layout. `scope` (`home | product | collection | cms-page
| custom`), `name`, `key`, draft/published state consistent with the existing config model.
  Sections for a template live in `SiteSection` re-keyed from `pageKey` to a `templateId` +
  scope (migration generalizes the existing `pageKey` column).
- **Default mapping** (new, Site-Builder-owned) — `(scope, contentTypeId?) → templateId`. The
  per-scope/per-type default. Read by the storefront resolver only.
- **Per-item override** (module-owned) — see §5 / open question 13.1.
- **Bound section schemas** (new, in `@sparx/sitebuilder-schemas`) — Zod schemas + registry
  entries for the product/collection bound section family (§4.2), scope-restricted.
- **Navigation relocation** — `NavigationMenu` / `NavigationItem` move to `16-cms-navigation.prisma`
  (no table change, no migration).

`SiteVersion` snapshots gain template/scope keying; `SiteLayoutBlock` is unchanged.

Migrations are authored locally against docker Postgres and applied via the DB Migrate workflow
(Cloud SQL is private-IP only) — see [packages/db/README.md](../packages/db/README.md) and
[docs/29-sitebuilder-architecture.md](29-sitebuilder-architecture.md) §3.

---

## 12. Delivery phases

Built in independently shippable phases (per the "deploy early, deploy small" practice). Each
phase is a coherent, deployable slice.

**Phase 1 — Foundation & truth.** Preview-token fix (§7); work-area padding/container + craft
details (§10); navigation ownership flip (§8); establish the **tenant-level Brand** source of
truth — new brand record, consolidate the scattered logo/color fields, rewire `resolveEmailBrand`
to read it, surface a Brand editing panel (§6). _Outcome: the existing screens stop lying and
stop looking like a prototype; module boundaries are corrected; brand is unified._

**Phase 2 — The one screen.** The unified editor shell (§3): persistent canvas with in-canvas
selection, structure rail, docked inspector, single status bar, drag reorder, visual section
gallery. Existing static-section composition runs inside it. _Outcome: one creative tool replaces
the hub._

**Phase 3 — Layouts as templates.** The `SiteTemplate` model + scope (§4.1); the bound section
family for `product` and `collection` (§4.2); sample-item preview binding (§4.3); the storefront
switches PDP/PLP from hardcoded React to template-driven rendering with the seeded defaults as
fallback. _Outcome: the storefront becomes fully composable._

**Phase 4 — Assignment.** The default mapping + per-item override (§5); the storefront
resolver's cascade; the "Layout: [template ▾]" control surfaced in Commerce/CMS item editors.
_Outcome: design once, apply to many._

Phases 3–4 each get their own implementation spec before build; this doc is the contract they
must honor.

---

## 13. Open questions

- **13.1 Override storage.** Per-item override as a nullable `templateId` FK on each entity vs. a
  small module-owned assignment table. Lean: nullable FK for simplicity; revisit if group-level
  rules (per-collection, per-tag) demand a table.
- **13.2 Group-level rules.** Whether v1 supports "a whole collection → layout" beyond per-item +
  per-type default, and which module owns the group binding.
- **13.3 Admin API path.** The admin route is `/v1/navigation/menus` while the public read is
  under `/v1/public/content/navigation`. Leave the module-neutral admin route as-is (renaming is
  a breaking change for no real benefit) — noted, not actioned.
- **13.4 Brand storage shape.** Dedicated `TenantBrand` table (clean media FKs, queryable, RLS)
  vs. a `tenants.settings.brand` sub-object (consistent with onboarding state). Lean: dedicated
  table for the media FKs + queryability.

## 14. Non-goals

- Replacing the theme engine, section-schema registry, or publish/version backend — all reused.
- A from-scratch storefront renderer — bound sections plug into the existing
  `section-renderer.tsx` switch.
- Custom-domain self-serve, Stripe Connect OAuth, dropship import (flagged follow-ons in doc 29 §9).
