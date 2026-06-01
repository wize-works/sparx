# Site Builder Layering Model

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

---

## 1. Purpose & relationship to doc 30

[docs/30-sitebuilder-redesign.md](30-sitebuilder-redesign.md) established the Site Builder as the
platform's layout layer and shipped it through Phases 1–3: the unified editor, the preview-truth
fix, brand as a tenant-level source of truth, and **layouts-as-templates** for `product` /
`collection` pages. Building Phase 3 surfaced a sharper model than doc 30 §4–§5 sketched, and a
design pass with the owner locked it. This document is that model.

It **refines doc 30 §4 (the layout/template model) and §5 (assignment & ownership)** and reshapes
doc 30's Phase 4. Where this doc and doc 30 disagree on the layout abstraction, its vocabulary, the
set of page types, or how assignment resolves, **this doc wins** and doc 30 §4/§5 are amended in the
phase that lands the change. Everything else in doc 30 (the editor shell, preview transport, brand
ownership, publish lifecycle) stands unchanged.

The one-sentence shift: **the "page designer" is a _page-layout_ designer.** A merchant designs a
layout for a _kind of page_ (a product, a collection, a content type, a taxonomy, later a B2B page),
sets a tenant default per kind, and overrides per item where they want to. The kinds are **data-
driven** — modules declare them — so new page types (B2B) arrive by registration, with **zero Site
Builder schema change**.

---

## 2. The three tiers that compose the experience

A storefront page is produced by three independent layers. Each answers a different question, each
is owned and edited separately, and together they are the whole merchant experience.

| Tier            | Question it answers              | What it owns                                                                                                    | Status                                                   |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Brand+Theme** | _What does it look like?_        | Identity (logo, palette, type, name) + presentation tokens (surfaces, spacing, radius, effects).                | ✅ Built (doc 30 §6; token model v2).                    |
| **SiteLayout**  | _What are the page regions?_     | The skeleton every page shares — header, footer, logo slot, announcement, ad/sidebar slots, the content region. | ◻ Future tier (partial: `SiteLayoutBlock`).              |
| **PageLayout**  | _What fills the content region?_ | The composition of sections for one kind of page — static + bound sections, in order.                           | ✅ Built as `SiteTemplate` today; **renamed here** (§5). |

- **Brand+Theme** is the look. It exists and is read-only to every consumer (doc 30 §6.2). Nothing
  below may redefine identity tokens.
- **SiteLayout** is the regions/skeleton — the chrome that wraps every page. Today only a thin slice
  exists (`SiteLayoutBlock`: header / footer / announcement slots + which menu fills each, doc 30 §8).
  It is **not yet properly defined** as a tier and is deferred (§11). When built, a SiteLayout names
  the regions a page is assembled from (header, footer, logo, announcement, ad/sidebar, content) and
  binds appearance + menu references to each.
- **PageLayout** is the content composition — what doc 30 / Phase 3 call a `SiteTemplate` today.
  This is the near-term work and the subject of the rename (§5).

> **Diagram.** The tier model + the preset→instance relationship per tier is rendered at
> `~/.agent/diagrams/sitebuilder-layering-model.html`.

---

## 3. Template vs. Layout — preset and instance

Two words have been used loosely ("template," "layout"). This model fixes them, and the fix is
**symmetric across all three tiers**:

- A **Template** (preset) is a **platform-authored**, predefined starting point — a catalog entry we
  ship to get a merchant to a great result fast. It is read-only; a merchant does not edit a Template
  in place. It is "begin here."
- A **Layout** (instance) is the **tenant's own editable thing**, created by **instantiating a
  Template** (copy-to-edit) — or from scratch. Editing happens here.

Applied per tier:

| Tier            | Template (preset, platform-authored)              | Layout (instance, tenant-editable)      |
| --------------- | ------------------------------------------------- | --------------------------------------- |
| **Brand+Theme** | Theme presets (`industrial`, `apex`, …)           | the tenant's Brand + Theme (exists)     |
| **SiteLayout**  | **Site Templates** (predefined region skeletons)  | the tenant's **SiteLayout** (future)    |
| **PageLayout**  | **Page Templates** (predefined page compositions) | the tenant's **PageLayout** (near-term) |

**Site & Page Templates are how we get merchants to gold quickly** (owner's words). They are a
curated catalog of good starting points; a merchant picks one, it is instantiated into an editable
Layout, and they take it from there.

Today's code already has the seed of this: `DEFAULT_TEMPLATES` (in `@sparx/sitebuilder-schemas`) is
the **built-in default Page Template** for `product` and `collection` — a code-defined composition
that the storefront falls back to and that "Customize this layout" materializes into real rows. The
generalization: `DEFAULT_TEMPLATES` becomes one entry in a **Page Template catalog**, and
`templateService.materializeDefault` generalizes to **`instantiateFromTemplate(templateId)`**.

**The catalog is code-first, catalog-ready (§10).** We author Templates in code now; a DB-backed,
merchant-extensible catalog is a later, additive step that doesn't change the model.

---

## 4. Targets are data-driven, not a hardcoded enum

This is the load-bearing decision. Today a layout is typed by a fixed `scope` enum
(`home | product | collection | cms-page | custom`, [section-registry.ts](../packages/sitebuilder-schemas/src/section-registry.ts)).
That enum is replaced by a **layout-target registry**: modules **declare** the kinds of page a layout
can be authored for and assigned to. Site Builder owns the registry and the layout storage; it does
**not** enumerate the targets.

### 4.1 What a target is

A **layout target** is an addressable _kind of page_, contributed by a module:

| Module       | Targets it registers                                             | Kind                           |
| ------------ | ---------------------------------------------------------------- | ------------------------------ |
| **Commerce** | product detail, collection, category, warehouse                  | static (one per kind)          |
| **CMS**      | one target **per content type** (page, article, blog…), taxonomy | data-driven (per content type) |
| **B2B**      | (its page kinds, TBD) — _arrives by registering, no SB change_   | static + data-driven           |

Two flavors of target coexist:

- **Static module targets** — `product`, `collection`, `category`, `warehouse`. One layout-kind each,
  declared statically by the module. These are today's scopes, generalized.
- **Data-driven targets** — a CMS **content type** is data, so each content type registers its own
  target. This is what makes _"articles look different than blogs"_ resolve cleanly: the layout
  default is keyed by the content-type's target id, not a single `cms-page` bucket. Commerce
  categories/collections/warehouses are likewise data — their **target kind** is static, but specific
  records are assigned individually (§6).

### 4.2 Target identity

A target is identified by a stable, namespaced **target id** — e.g. `commerce:product`,
`commerce:collection`, `cms:content-type:<id>`, `cms:taxonomy`. The existing
`SiteTemplate.scope` `VarChar(31)` column generalizes to carry the target id (its domain stops being
a fixed enum). The exact id grammar is an open question (§12.1) but the column already exists and is
a string, so the storage need not change to admit new targets.

**Binding — modules register, Site Builder consumes (the registry seam).** Per doc 02 / doc 29 §2,
consuming modules must not grow Site-Builder schema. The registry is the inverse: a module **declares
its targets to Site Builder** (a registration call / a code-level provider the SB layer reads), and
Site Builder stores layouts keyed by target id. B2B "just comes in by pointing the table right"
because the table is keyed by an opaque target id, and B2B registers its targets the same way
Commerce and CMS do. **No SB schema change per new module.**

### 4.3 Cross-module bound sections

Because targets are data-driven and a layout is just a composition, **bound sections become cross-
module**. The static/bound section distinction (doc 30 §4.2) is unchanged, but the section registry's
`scopes` restriction (today `['product']`, `['collection']`, or `ALL_SCOPES`) generalizes to target
ids — and a section may be allowed in targets from more than one module.

The motivating case (owner): _a CMS page is content to display (image, text, links), **and** that
page can host a "related products" section, or "related blog posts," or "similar taxonomy pages."_ So
a `related-products` bound section — today restricted to commerce — becomes available inside a CMS
content-page layout, resolving against a configured product set. The renderer already supports this:
bound sections render purely from `SectionContext` and don't care where the data came from
([section-renderer.tsx](../apps/storefront/components/section-renderer.tsx)). Cross-module availability
is a registry change (which targets a section declares), not a renderer change.

---

## 5. The rename: `SiteTemplate` → `PageLayout`

Today's `SiteTemplate` model is, by the §3 vocabulary, an **instance** (the tenant's editable thing),
not a preset. It is misnamed, and the name `SiteTemplate` is needed for the SiteLayout-tier preset.
**Rename it now** — there are zero merchants, so there is no migration risk or customer churn, and
doing it before the catalog and assignment land avoids reclaiming the word later under load.

| Today                                                                   | Renamed to                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| model `SiteTemplate`                                                    | model `PageLayout`                                                        |
| table `sitebuilder_templates`                                           | table `sitebuilder_page_layouts`                                          |
| `SiteSection.templateId` (FK)                                           | `SiteSection.pageLayoutId`                                                |
| `template_id` column                                                    | `page_layout_id` column                                                   |
| `template-service.ts` / `templateService`                               | `page-layout-service.ts` / `pageLayoutService`                            |
| `CreateTemplateInput`, `MaterializeTemplateInput`, `ListTemplatesQuery` | `CreatePageLayoutInput`, `InstantiateLayoutInput`, `ListPageLayoutsQuery` |
| `GET/POST /v1/sitebuilder/templates`                                    | `/v1/sitebuilder/page-layouts`                                            |
| MCP `get_sections`/`add_section` target args                            | unchanged shape, `templateId`→`pageLayoutId`                              |
| dashboard `_lib` `listTemplates`/`resolveTemplate`/`SiteTemplateDto`    | `listPageLayouts`/`resolvePageLayout`/`PageLayoutDto`                     |

**The word "Template" is reclaimed for presets** — `Page Template` (the platform-authored Page-Layout
preset, code-first per §10) and `Site Template` (the SiteLayout-tier preset, future). `DEFAULT_TEMPLATES`
stays correctly named: it is the built-in default **Page Template**.

The rename is mechanical and large but low-risk (DB table rename + symbol churn across schema /
service / inputs / routes / MCP / dashboard `_lib`). It is the first increment of the PageLayout-tier
build (§11) so everything after it speaks the right names. The DB table rename goes through the DB
Migrate workflow like every migration (Cloud SQL is private-IP; never the laptop).

> Reserve **`SiteLayout`** strictly for the regions tier (§2). Do not reuse it for content
> composition.

---

## 6. Assignment & ownership

Doc 30 §5 is correct in principle and is sharpened here. **Site Builder owns the layouts and the
assignment; the data module owns its records.** Assignment tables are **Site-Builder-owned** — not
FKs grown onto Commerce/CMS records (this revises doc 30 Open Q 13.1's "lean: nullable FK"; the owner
chose SB-owned tables, keeping the doc-02 boundary clean and letting B2B participate without schema
work in its own module).

| Concern                                  | Owner          | Mechanism                                                                                                      |
| ---------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| The layouts (catalog, many per target)   | Site Builder   | `PageLayout` rows.                                                                                             |
| The **tenant default** layout per target | Site Builder   | SB-owned default table: `(targetId) → pageLayoutId`. "Products default → Layout A"; "Article type → Layout C". |
| A **per-item** override                  | Site Builder   | SB-owned assignment table: `(targetId, itemRef) → pageLayoutId`. "This product → Spotlight layout."            |
| Which of its records exist (the items)   | Commerce / CMS | unchanged — the module owns its data; SB references items by id.                                               |

**Resolver cascade (storefront site-resolver), per page render:**

```
per-item override (SB) → tenant default for the target (SB) → seeded/code default (Page Template) → safety fallback
```

This is the doc 30 §5 cascade with assignment moved fully into Site-Builder-owned tables. Consuming
modules never read SB assignment tables; the storefront's site-resolver performs the join at render,
exactly as Phase 3's storefront already resolves a layout from the published snapshot.

**The picker.** A `Layout: [▾]` control appears in the item editors a module already owns — the
Commerce product editor, the CMS entry editor — letting a merchant pin a specific layout to a specific
record (writing the SB-owned per-item assignment via the SB API). The tenant default is set in the
Site Builder Layouts surface, per target.

---

## 7. Home is a content page at `/`

There is **no special `home` scope/target.** The homepage is a **content page** (a CMS content-page
target instance) that happens to be **designated as home** — served at `/`. The only special bit is
the designation, a tenant setting (`isHome` / a `homePageId` on tenant settings), not a distinct
layout kind.

Consequence: doc 30 §4.1's `home`, `cms-page`, and `custom` scopes **collapse into one content-page
target.** A standalone landing page, an "about" page, and the homepage are all content pages; they
differ only in their slug and whether one is designated home. The 3.3b `home` layout becomes the
content-page layout assigned to the home content page.

> **Migration nuance (open).** Today the homepage renders from SB `SiteSection` rows under a
> `(home, default)` layout, not from a CMS entry. Folding home into the content-page target means
> either (a) the home PageLayout simply uses the content-page target and the tenant designates it
> home, keeping today's SB-authored home content, or (b) home content becomes a CMS entry. Lean: (a)
> first (smaller, no CMS coupling), with (b) available once layout-driven CMS authoring (§8) lands.
> Tracked in §12.2.

---

## 8. Layout-driven authoring

The payoff of the model: **content is authored _through_ its layout.** When a merchant creates or
edits a CMS content page — and eventually a product — the editor renders the content **in the form of
its selected (or default) layout**, and the content slots are editable in place. That is how the
merchant sets the text / image / links / etc. — they see the page as it will render and edit it
directly, instead of filling a flat form divorced from presentation.

### 8.1 The boundary — content type owns the fields, layout owns the arrangement

This is the binding rule that keeps the two concerns from fighting:

- **The content type owns the _data_** — the fields an entry has (title, body, hero image, gallery,
  author, links). This is the CMS content-type schema. It is the source of truth for _what content
  exists_.
- **The layout owns the _arrangement_** — which sections render, in what order, with what
  presentation, plus any dynamic/layout-owned sections (related products, newsletter). It is the
  source of truth for _how content is presented_.

Sections **bind to content fields by name** — the same mechanism bound product sections already use
(`product.images`, `product.description`, see the `bindings` descriptors in the registry). Because the
binding is by name, **swapping a layout never loses content**: the new layout's content slots re-bind
to the same named fields; fields a layout doesn't surface simply aren't shown (the data is untouched).

### 8.2 Two kinds of section inside a layout

| Section kind             | Bound to                           | Edited where                           | Shared across entries?                    |
| ------------------------ | ---------------------------------- | -------------------------------------- | ----------------------------------------- |
| **Content slot**         | a named entry field                | **in-canvas, per entry** (this is §8)  | No — per entry                            |
| **Layout-owned section** | authored config / a configured set | the **layout designer** (Site Builder) | Yes — shared by every entry on the layout |

A content slot (e.g. the body, the hero image) is per-entry: editing it edits _this_ entry's content.
A layout-owned section (e.g. a "related products" block, a newsletter CTA, a shared footer band) is
edited once in the layout designer and is the same for every entry the layout applies to.

### 8.3 Cross-module seam & the product case

- **Ownership.** Site Builder owns the layout + the binding registry; the **CMS editor consumes** the
  layout to render its create/edit surface. Same seam as everywhere else — a consuming surface edits
  content (the entry's fields) it owns, through a layout it doesn't own.
- **Products are the same pattern, with a carve-out.** A product page is also authored through its
  layout — but **structured commerce fields keep their dedicated editors.** Price, variants,
  inventory, fitments are not free-form content slots; they stay in the Commerce product editor's
  purpose-built controls. Only the **descriptive** slots (title, description, gallery) author
  in-canvas through the layout. So: descriptive content → layout-driven in-canvas; structured commerce
  data → dedicated editor. The product detail page renders both via the bound product sections that
  already exist.

Layout-driven authoring is the largest piece and lands **after** the PageLayout tier (§11) — it needs
the registry, assignment, and the rename in place, plus CMS-editor coordination.

---

## 9. Sample-data preview (always-on)

A merchant cannot design a product / collection / content layout before the store has data — and
storefront PDP/PLP filter `status:'active'`, so even a draft product 404s in preview (the 3.3b sample
picker hits exactly this: a fresh store shows the catalog/home fallback, never a real bound page).
**This is the wrong order** (owner). The fix: preview bound layouts against **code-defined sample
data**, always.

- **Always-on**, not conditional on having data — so the design surface is consistent whether or not
  the tenant has products yet.
- A storefront **URL flag** (e.g. `sparxSampleData=1`), **gated behind the existing `sparxSitePreview`
  preview token** so it only ever affects authenticated preview, never the public site. When set, the
  storefront **skips the commerce/CMS fetch** and feeds `SectionContext` a code-defined fixture —
  `SAMPLE_PRODUCT`, `SAMPLE_COLLECTION`, `SAMPLE_CONTENT` (mirroring how `DEFAULT_TEMPLATES` lives in
  code).
- **Storefront-only change.** The renderer needs nothing new — bound sections already resolve purely
  from `SectionContext`. The dashboard Layouts editor appends the flag.

This is **independent of the rest of this doc** and ships first, as its own small slice, because it
unblocks designing every bound layout. (It also stands in for §7's home and §8's content pages once
those land — a `SAMPLE_CONTENT` fixture previews a content layout with no entries.)

---

## 10. The template catalog — code-first, catalog-ready

Site & Page Templates (§3) start as a **code-first** catalog: presets authored in the repo (the
generalization of `DEFAULT_TEMPLATES`). This keeps the first build tractable and versioned with the
code, and matches the platform's "infra is phased — start cheap" instinct.

The catalog is **catalog-ready**: the model (a Template is instantiated into a Layout) does not change
when a DB-backed, merchant- or partner-extensible catalog is added later. That later step is purely
additive — a `PageTemplate` / `SiteTemplate` table read alongside the code catalog — and is **not** in
the near-term scope.

---

## 11. Delivery — revised phasing

This supersedes doc 30's single "Phase 4 — Assignment." The work splits into independently shippable
slices, deploy-small, each keeping the live e2e store working.

**Now (independent, ships first):**

- **S0 · Sample-data preview (§9).** Storefront fixture source + `sparxSampleData` flag (token-gated)
  - dashboard toggle. Storefront-first; no schema change. _Unblocks designing every bound layout._

**The PageLayout tier (revises doc 30 Phase 4):**

- **P-A · Rename (§5).** `SiteTemplate` → `PageLayout` end to end, incl. the DB table rename via the
  DB Migrate workflow. Mechanical, low-risk, first so everything after speaks the right names.
- **P-B · Target registry (§4).** Generalize the fixed `scope` enum to data-driven target ids; a
  registration seam modules declare targets through; generalize section-registry `scopes` to target
  ids (cross-module bound sections). Near-term targets: `commerce:product`, `commerce:collection`, the
  CMS content-page target; design category/warehouse/taxonomy/per-content-type as the registry admits
  them. **Spec: [docs/handoffs/sitebuilder-pb-spec.md](handoffs/sitebuilder-pb-spec.md)** (grammar +
  registration resolved; full-re-key migration; built in two increments P-B1/P-B2).
- **P-C · Assignment & resolver (§6).** SB-owned default + per-item assignment tables; the storefront
  resolver cascade; the `Layout: [▾]` picker in the Commerce product editor + CMS entry editor.
- **P-D · Unified Layouts surface.** Fold 3.3b's per-scope nav entries (Product pages / Collection
  pages / Homepage / Pages) into one **Layouts** surface organized by target, listing the tenant's
  PageLayouts + a "begin from a Page Template" catalog (code-first, §10) + the per-target default
  control.

**Future tiers (deferred, after the PageLayout tier):**

- **SiteLayout (regions) tier (§2).** Define regions properly (header, footer, logo, announcement,
  ad/sidebar, content) beyond today's `SiteLayoutBlock`; add **Site Templates** (region presets).
- **Layout-driven authoring (§8).** CMS create/edit (then product descriptive slots) rendered through
  the layout, content slots editable in place; needs the registry + assignment + CMS-editor
  coordination.
- **Home as a CMS entry (§7 option b).** Once layout-driven CMS authoring exists.
- **Email scope (doc 30 §4.1)** and **§2.5 retire email designer** — unchanged, still deferred until a
  replacement email-authoring surface exists.

Each tier/slice that touches the data model gets its migration authored locally against docker
Postgres and applied via the DB Migrate workflow.

---

## 12. Open questions

- **12.1 Target id grammar. — RESOLVED (P-B, [docs/handoffs/sitebuilder-pb-spec.md](handoffs/sitebuilder-pb-spec.md) §2).**
  Namespaced `<module>:<kind>[:<key>]`, lowercase: `site:home`, `commerce:product`, `commerce:collection`,
  `cms:content-page` (absorbs the old redundant `cms-page` + `custom`), and data-driven
  `cms:content-type:<contentTypeId>` **keyed by the stable content-type id** (a rename never re-keys layouts).
- **12.2 Home migration (§7).** Keep today's SB-authored home content under a content-page-target
  layout designated home (lean), vs. make home a CMS entry. Settle when P-D / layout-driven authoring
  is specced.
- **12.3 Group-level assignment.** Whether a target supports "a whole collection / tag → layout"
  beyond per-item + per-target default (doc 30 Open Q 13.2). The SB-owned assignment table can model
  it (`itemRef` = a group ref); defer until a real need appears.
- **12.4 Registration mechanism. — RESOLVED (P-B, [docs/handoffs/sitebuilder-pb-spec.md](handoffs/sitebuilder-pb-spec.md) §2).**
  Code-level provider (the lean): a static target catalog + a `cms:content-type:<id>` factory in
  `@sparx/sitebuilder-schemas`. Runtime registration is a later, additive step, only if/when modules deploy
  independently of SB.
- **12.5 Catalog storage (§10).** When (not whether) the code-first Template catalog gains a DB table.
  Out of near-term scope.

---

## 13. Non-goals

- Re-deriving the renderer, theme engine, publish/version backend, or preview transport — all reused
  unchanged from doc 30 / Phase 3.
- The DB-backed Template catalog, the SiteLayout regions tier, and layout-driven authoring are
  **modeled here but not built near-term** (§11).
- Email authoring in Site Builder — deferred per doc 30 §4.1.
