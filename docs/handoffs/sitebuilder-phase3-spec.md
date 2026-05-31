# Site Builder Phase 3 — Layouts as Templates (Implementation Spec)

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

> Implementation spec for **Phase 3** of the Site Builder redesign. The architecture contract is
> [docs/30-sitebuilder-redesign.md](../30-sitebuilder-redesign.md) §4; this doc is the *how* and must
> honor that *what*. The cross-session task tracker is
> [docs/handoffs/sitebuilder-redesign-plan.md](sitebuilder-redesign-plan.md). Phase 2 (the unified
> editor shell + Theme/Brand inspectors + in-canvas editing of **static** sections) is done and green;
> this spec sits on that foundation. Phase 4 (assignment: default-mapping table + per-item override +
> resolver cascade) is explicitly **out of scope** here — see §11.

---

## 1. Goal & the one-sentence shape

**Goal (doc 30 §12).** The storefront stops being half-hardcoded React. A **product** page and a
**collection** page each become a *composable, scoped layout* the merchant edits in the same one-screen
editor they already use for the homepage — with **bound** sections that pull from the page's assigned
item at render. Day one, the seeded default layouts render **pixel-identical** to today's hardcoded
PDP/PLP, so nothing visibly changes until a merchant chooses to edit.

**The shape, in one sentence.** Re-key the section model from a flat `pageKey` string to a
`SiteTemplate` (typed by `scope`), add a **scope-restricted bound section family** to the registry,
teach the storefront's existing `section-renderer` to resolve bound sections from a binding context,
and switch `products/[handle]` + `collections/[handle]` from bespoke JSX to template-driven rendering
with a **code-defined** seeded default as the fallback.

What we are **not** doing (doc 30 §14, reaffirmed): no new theme engine, no from-scratch renderer
(bound sections plug into the existing `section-renderer.tsx` switch), and the publish/version/schedule
backend is reused — generalized in subject (a layout is a scoped snapshot), unchanged in mechanism
(doc 30 §9).

---

## 2. Ground truth — what Phase 3 touches (as-built)

Confirmed by reading the current code. Every decision below is anchored here.

| Concern | Today | File |
| --- | --- | --- |
| Section model | `SiteSection.pageKey` = `"home"` or a slug; flat, no template concept | [49-sitebuilder.prisma](../../packages/db/prisma/schema/49-sitebuilder.prisma) `model SiteSection` |
| Registry | Flat `Record<SectionType, SectionDefinition>`; 7 **static** types; no scope field | [section-registry.ts](../../packages/sitebuilder-schemas/src/section-registry.ts) |
| Storefront render seam | `SectionRenderer` switches on `sectionType`; `SectionContext = { tenantSlug, currency, locale }`; unknown types skipped | [section-renderer.tsx](../../apps/storefront/components/section-renderer.tsx) |
| Home composition | `sectionsForPage(snapshot, 'home')` → `SectionRenderer`; empty-store fallback is composed-commerce JSX | [app/page.tsx](../../apps/storefront/app/page.tsx), [lib/site.ts](../../apps/storefront/lib/site.ts) |
| PDP | 100% hardcoded JSX: `<ProductDetail>` (gallery+variants+add-to-cart, client) + description + `<FitmentTable>` + reviews (`<RatingStars>`/`<ReviewForm>`) + Q&A (`<QuestionForm>`) + related rail. Loads `getProduct`, `listRelatedProducts`, `listProductQuestions`, `listFitmentDomains`. Emits Product/Breadcrumb JSON-LD. | [products/[handle]/page.tsx](../../apps/storefront/app/products/[handle]/page.tsx) |
| PLP | Hardcoded JSX: breadcrumbs + hero `<header>` + count toolbar + `<ProductGrid>` + `<Pagination>`. Loads `getCollection`, `listCollectionProducts`. | [collections/[handle]/page.tsx](../../apps/storefront/app/collections/[handle]/page.tsx) |
| Publish snapshot | `PublishedSnapshot.sections[]` keyed by `pageKey`; `readDraft` orders by `(pageKey, position)`; `SiteVersion.sectionsSnapshot` is opaque JSON | [publish-internals.ts](../../packages/sitebuilder/src/services/publish-internals.ts) |
| Section CRUD | `sectionService` keys everything by `pageKey` (`list`, `create`, `reorder`) | [section-service.ts](../../packages/sitebuilder/src/services/section-service.ts) |
| Binding surface | `PublicProduct` (options, variants, images, fitments + list fields), `PublicCollection`, `PublicQuestion`, `PublicFitmentDomain` | [lib/commerce.ts](../../apps/storefront/lib/commerce.ts) |

**Key realization:** the storefront already owns presentational components for every bound section the
screenshot shows (`ProductDetail`, `FitmentTable`, `RatingStars`, `ReviewForm`, `QuestionForm`,
`ProductCard`/`ProductGrid`, `Pagination`). Phase 3 is mostly **re-housing existing components as
bound sections behind the registry** — not building new UI from scratch. That is what keeps day-one
parity cheap and the risk contained.

---

## 3. Data model — `SiteTemplate` + re-keying `SiteSection`

### 3.1 New model

```prisma
// A reusable, scoped page layout. Sections (SiteSection) hang off a template
// instead of a bare pageKey string. Tenant-scoped, ENABLE+FORCE RLS.
model SiteTemplate {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid

  // home | product | collection | cms-page | custom  (doc 30 §4.1)
  scope String @db.VarChar(31)
  // Stable identifier within (tenant, scope). "default" for a scope's single
  // Phase-3 layout; a slug for cms-page / custom standalone pages.
  key   String @db.VarChar(255)
  name  String @db.VarChar(255)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  tenant   Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  sections SiteSection[]

  @@unique([tenantId, scope, key])
  @@index([tenantId, scope])
  @@map("sitebuilder_templates")
}
```

### 3.2 `SiteSection` re-key

`SiteSection.pageKey` (a bare string) becomes `templateId` (FK → `SiteTemplate`). Everything else on
the row (`sectionType`, `position`, `visible`, `config`) is unchanged.

```prisma
model SiteSection {
  id         String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String @map("tenant_id") @db.Uuid
  templateId String @map("template_id") @db.Uuid   // was: pageKey String

  sectionType String  @db.VarChar(63)
  position    Int
  visible     Boolean @default(true)
  config      Json    @default("{}")
  // …timestamps…

  template SiteTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, templateId, position])
  @@map("sitebuilder_sections")
}
```

### 3.3 Migration (hand-edited SQL, applied via the DB Migrate workflow)

Authored locally against docker Postgres (`pnpm db:up` + `prisma migrate dev`), RLS hand-edited in,
then prod via `gh workflow run db-migrate.yml` (Cloud SQL is private-IP only — never the laptop). The
migration is **data-driven** so it is correct regardless of which `pageKey`s exist in a tenant's data:

1. `CREATE TABLE sitebuilder_templates (…)` + `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
   + `CREATE POLICY sitebuilder_templates_tenant_isolation … USING (tenant_id = current_tenant_id())`.
   (Mirror the established pattern — see [feedback_sparx_db_rls_pattern]; Prisma does not generate RLS.)
2. **Backfill templates from existing sections:**
   ```sql
   INSERT INTO sitebuilder_templates (id, tenant_id, scope, key, name)
   SELECT gen_random_uuid(), tenant_id,
          CASE WHEN page_key = 'home' THEN 'home' ELSE 'custom' END AS scope,
          CASE WHEN page_key = 'home' THEN 'default' ELSE page_key END  AS key,
          CASE WHEN page_key = 'home' THEN 'Home'    ELSE page_key END  AS name
   FROM (SELECT DISTINCT tenant_id, page_key FROM sitebuilder_sections) d;
   ```
   Rationale: today `pageKey='home'` is the SB homepage composition; any other key is a standalone slug
   page, which doc 30 §4.1 maps to the `custom` scope. (CMS-page-scope templates have no existing rows;
   they are a forward capability seeded on demand, not by this backfill.)
3. `ALTER TABLE sitebuilder_sections ADD COLUMN template_id UUID;` then backfill by joining on
   `(tenant_id, page_key)` ↔ the template's `(tenant_id, key-with-home-mapping)`; then
   `SET NOT NULL`, add the FK (`ON DELETE CASCADE`), add the `(tenant_id, template_id, position)` index,
   and **drop `page_key`** + its old index.

**Reversibility note.** Dropping `page_key` is the one irreversible step. It is safe because (a) the
template's `key` preserves the exact slug, and (b) the read path (§6) maps scope/key back to the prior
behavior. The down-migration recreates `page_key` from `template.key`/`scope`.

### 3.4 Snapshot keying (publish backend, reused)

`SiteVersion.sectionsSnapshot` stays opaque JSON; we **enrich the SectionSnapshot shape** rather than
add a column (§9 of doc 30: "a layout is just another versioned, scoped snapshot"). Each snapshotted
section gains `scope` + `templateKey` (and `templateId`); legacy `pageKey` is dropped from *new*
snapshots but still **read** from old ones via a back-compat shim (§6.4). `readDraft` joins
`SiteSection → SiteTemplate`; `toPublishedSnapshot` reads the enriched shape. No new column, old
versions stay renderable, rollback unchanged.

---

## 4. The bound section family

### 4.1 Scope-restriction in the registry

`SectionDefinition` gains `scopes: Scope[]` — the scopes a section may appear in. The registry's flat
`Record` is kept; a helper `sectionsForScope(scope)` filters it for the editor's gallery and for
service-side validation (reject a `product-buy-box` dropped into a `home` template).

- **Static sections** (the existing 7) are allowed **everywhere**: `scopes: ['home','product',
  'collection','cms-page','custom']`. Per doc 30 §4.2, "static" denotes a section's *default content
  source*, not a wall — a hero can live above a product buy-box.
- **Bound sections** are scope-locked to exactly the scope whose data they resolve.

```ts
export const SCOPES = ['home', 'product', 'collection', 'cms-page', 'custom'] as const;
export type Scope = (typeof SCOPES)[number];

export interface SectionDefinition {
  type: SectionType;
  label: string;
  description: string;
  icon: string;
  scopes: Scope[];        // NEW — which scopes may contain this section
  binding?: 'product' | 'collection'; // NEW — set on bound sections; drives the binding context
  schema: z.ZodType;
  fields: SectionField[];
}
```

### 4.2 v1 bound section types

Config schemas hold **presentation options only** — the *data* arrives from the binding context at
render (doc 30 §4.2). Each maps onto an existing storefront component (the parity lever).

**`product` scope** (binding: `product`):

| Type | Renders (existing component) | Config (presentation only) | Resolves from |
| --- | --- | --- | --- |
| `product-buy-box` | `<ProductDetail>` (gallery + title + price + variants + add-to-cart, **client**) | `galleryLayout` (stacked\|thumbs-left\|thumbs-below), `stickyBuyBox` (bool), `showSku`, `showVendor` | `product.{title,images,variants,options,price*,inStock}` |
| `product-description` | description block (today's "Details") | `heading` (default "Details"), `showHeadingWhenEmpty` (bool) | `product.description` |
| `product-fitment` | `<FitmentTable>` | `heading` (default "Compatibility") | `product.fitments` + `fitmentDomainsBySlug` |
| `product-reviews` | `<RatingStars>` + `<ReviewForm>` | `heading`, `showForm` (bool), `emptyText` | `product.{averageRating,reviewCount}` + form |
| `product-questions` | Q&A list + `<QuestionForm>` | `heading`, `showForm`, `emptyText` | `productExtras.questions` |
| `product-related` | related rail of `<ProductCard>` | `heading` (default "You may also like"), `limit` (default 4) | `productExtras.related` |

**`collection` scope** (binding: `collection`):

| Type | Renders (existing component) | Config | Resolves from |
| --- | --- | --- | --- |
| `collection-header` | hero image + name + description `<header>` | `showDescription` (bool), `overlayStyle` | `collection.{name,description,heroMediaId}` |
| `collection-products` | count toolbar + `<ProductGrid>` + `<Pagination>` | `perPage` (default 24), `showCount` (bool), `showSort` (bool, deferred-rich) | `collectionExtras.{items,total,page,perPage}` |

Granularity rationale: the buy-box stays one section (gallery+variants+cart are one client unit today
in `<ProductDetail>` — splitting them would fork that component for no day-one benefit). The
collection grid+pagination stay one section for the same reason (`<ProductGrid>` + `<Pagination>` are a
unit driven by the same paged fetch). Filters/sort richness is a config flag now, a follow-on later.

**Breadcrumbs + JSON-LD are page chrome, not sections.** They are SEO/navigation concerns the page
shell keeps emitting around the rendered template (the merchant doesn't compose or remove them). This
keeps `generateMetadata` and structured data out of the section model.

### 4.3 Two senses of "bound" (doc 30 §4.2, preserved)

*Style* is always bound for **every** section (static or bound) via the `--sf-*` tokens already
injected by the theme — Phase 3 changes nothing here. *Content* binding is what `binding` denotes: a
bound section's **default** data source is the assigned item. The editor's static/bound legend is a
teaching device for content source, not a hardcoded-vs-dynamic wall.

---

## 5. Seeded default templates — code-defined, not seeded rows

**Decision (locks doc 30 §4.2 "seeded default templates"): the day-one default product/collection
layout is a `const` composition in code, not DB rows.**

- A `DEFAULT_TEMPLATES: Record<'product'|'collection', SectionSnapshot[]>` lives in
  `@sparx/sitebuilder-schemas` (shared shape) and is consumed by the storefront resolver as the
  fallback when the snapshot carries no template for that scope.
- The product default expresses today's PDP exactly: `product-buy-box` → `product-description` →
  `product-fitment` → `product-reviews` → `product-questions` → `product-related`. The collection
  default: `collection-header` → `collection-products`.
- When a merchant first **edits** the product/collection layout, the editor **materializes** the code
  default into real `SiteSection` rows under a `(scope, key='default')` `SiteTemplate` ("duplicate to
  edit"). Until then, **zero rows** exist for that scope.

**Why code-defined, not a seed migration:** it honors the platform rule that a module stores no rows
until used (CLAUDE.md), mirrors the existing empty-store composed-commerce fallback in
[app/page.tsx](../../apps/storefront/app/page.tsx), gives exact parity with no per-tenant data
migration, and means a tenant who never touches Site Builder carries no template rows. The cost — the
default composition exists once in code and once (after edit) as rows — is acceptable and matches how
the homepage already behaves.

---

## 6. Storefront rendering

### 6.1 Binding context

`SectionContext` is widened with the optional resolved item + supplementary data. Bound section
components assert their slice is present (they only ever render inside their scope).

```ts
export interface SectionContext {
  tenantSlug: string;
  currency: string;
  locale: string;
  // Present only when rendering a `product`-scope template:
  product?: PublicProduct;
  productExtras?: {
    related: PublicProductListItem[];
    questions: PublicQuestion[];
    fitmentDomainsBySlug: Record<string, PublicFitmentDomain>;
  };
  // Present only when rendering a `collection`-scope template:
  collection?: PublicCollection;
  collectionExtras?: { items: PublicProductListItem[]; total: number; page: number; perPage: number };
}
```

### 6.2 `section-renderer` switch — additive

The existing switch gains the bound cases; the static cases and the unknown-type skip are unchanged.
Bound cases render the **existing** components, fed from `ctx`. The `data-section-id`/`-type` wrappers
(for the §1 preview-bridge click-to-select) already wrap every section uniformly — bound sections get
selection in the canvas for free.

### 6.3 PDP / PLP cutover

`products/[handle]/page.tsx` becomes (PLP analogous):

1. Resolve tenant + product (unchanged). `notFound()` semantics unchanged.
2. `getPublishedSite(tenant.slug, sp.sparxSitePreview)` — **new**: the PDP now reads the site snapshot
   (the draft when a preview token is present, else published).
3. Resolve the product template's ordered sections: `sectionsForScope(snapshot, 'product')` → if empty,
   `DEFAULT_TEMPLATES.product` (§5).
4. Load supplementary data exactly as today (`listRelatedProducts`, `listProductQuestions`,
   `listFitmentDomains`) — but only what the resolved section list actually needs (skip the related
   fetch if there's no `product-related` section).
5. Render `<SectionRenderer sections={templateSections} ctx={{…product, productExtras}} />` inside the
   same `sf-container`. Keep `generateMetadata` + the JSON-LD `<script>` + `<Breadcrumbs>` as page
   chrome around it.

**Parity is the acceptance bar (§10):** with no published template, the seeded default must render
byte-for-byte what ships today. The bound section components are lifted from the current JSX, so this is
a re-housing, not a re-implementation.

### 6.4 Back-compat shim

`sectionsForScope(snapshot, scope, key='default')` filters snapshot sections by `scope`+`templateKey`.
For **pre-Phase-3 published versions** (sections carry only `pageKey`, no `scope`), a read-time shim
maps `pageKey==='home' → scope='home'/key='default'`, else `scope='custom'/key=pageKey` — so an old
snapshot still resolves. `sectionsForPage(snapshot,'home')` is replaced by
`sectionsForScope(snapshot,'home')` in [app/page.tsx](../../apps/storefront/app/page.tsx); the helper is
kept as a thin alias for any other caller during transition.

---

## 7. Editor — the "Layouts" scope (the screenshot)

This is the surface in the reference screenshot, built on the **Phase 2 shell** (persistent canvas +
two-tier dashboard nav + docked inspector + `useEditorCanvas()`), not a new shell.

- **A "Layouts" manifest section** joins the Site Builder contextual panel (alongside Theme / Pages /
  Header&footer / Brand). It lists the scopes — **Home**, **Products**, **Collections**, plus existing
  Pages/Custom — and is added to `CANVAS_SCOPES` so the live canvas shows beside it.
- **Scope picker → bound canvas.** Selecting **Products · Default** sets the canvas preview path to a
  **sample product** (`/products/<sample-handle>?sparxSitePreview=<token>`) and the inspector to the
  product template's section list. Same machinery as Pages today (`setPreviewPath` + `reload`), just
  pointed at a PDP route with a scope-restricted section set.
- **Scope-restricted section gallery.** The "add section" gallery is filtered by
  `sectionsForScope(scope)` — a product template offers the bound product family + static sections; it
  cannot offer a collection grid. The Static/Bound legend from the screenshot is rendered from the
  registry's `binding` field.
- **Bindings in the inspector.** A bound section's inspector shows its **data bindings read-only**
  (e.g. `product.images`, `product.title · price`) above its editable presentation options — exactly
  the screenshot's "Product spotlight → Data bindings" panel. The read-only binding rows come from the
  section definition (a static descriptor per bound type), the editable controls from `fields` as
  today.
- **"Preview against [sample product ▾]".** A picker (reusing the dashboard product list/search API)
  chooses the sample item the canvas binds to; the choice is editor-local (a UI preference, not site
  data). Default = first product.
- **First edit materializes the default** (§5): opening a never-edited Products layout shows the seeded
  default; the first mutation writes the `(product, default)` template + its section rows, then behaves
  like any other section list.

Assignment ("THIS LAYOUT APPLIES TO … 142 products · 3 overrides") shown in the screenshot is **Phase
4** — §11. Phase 3 ships the single default layout per scope; the "applies to" panel arrives with the
mapping table + override pointer.

---

## 8. Service & API changes

- **`sectionService`** re-keyed `pageKey` → `templateId` (`list`, `create`, `reorder`, audit entity
  ids). A new **`templateService`** owns CRUD for `SiteTemplate` (list by scope, get-or-create default,
  materialize-from-code-default, rename). Validation rejects a section whose `sectionType` is not
  allowed in the template's `scope` (registry `scopes`).
- **api-rest** `/v1/sitebuilder/*` section routes take `templateId` (or `scope`+`key`) instead of
  `pageKey`. The **public** `/v1/public/storefront/site` endpoint's published + draft branches both
  emit `templates[]` (sections grouped by template with `scope`/`key`/`name`). MCP tools that wrap the
  section service inherit the new keying (boundary unchanged).
- **`publish-internals`**: `readDraft` joins template metadata onto each section; `SectionSnapshot`
  gains `scope`+`templateKey`+`templateId`; `toPublishedSnapshot` + `materializeWithinTx` (rollback)
  carry them. `publishWithinTx` mechanism unchanged.

---

## 9. Build increments (each independently shippable)

Per deploy-early/deploy-small. The risky storefront cutover (3.2) ships and bakes **before** any merchant
can edit (3.3), and **parity is verifiable before edit exists**.

- **3.0 — Schema + migration.** `SiteTemplate` + re-key `SiteSection`; hand-edited RLS; data-driven
  backfill; service/api re-key. *Backward-safe:* home still renders; no storefront behavior change. Ship.
- **3.1 — Registry: scopes + bound schemas.** Add `scopes`/`binding` to `SectionDefinition`, the bound
  section Zod schemas + fields, `sectionsForScope`, `DEFAULT_TEMPLATES`. Pure additive; no runtime
  wiring yet. Ship (covered by `section-registry.test.ts` extensions).
- **3.2 — Storefront template-driven PDP/PLP (the parity milestone).** Bound renderers + binding
  context; PDP/PLP fetch the snapshot and render the resolved template, code default as fallback.
  Storefront looks **identical**; now flows through the template path. Ship + verify parity.
- **3.3 — Editor: Layouts scope.** Products/Collections scopes in the SB shell, scope-restricted
  gallery, bindings inspector, sample-item picker, first-edit materialization. Ship.
- **3.4 — Acceptance** (§10).

---

## 10. Acceptance

- **Parity (3.2):** with nothing published for `product`/`collection`, a PDP and a PLP render
  byte-for-byte identical to today (visual diff on a real tenant — E2E Shop). Related/Q&A/fitment
  conditionals behave as today.
- **Composability (3.4):** edit the product template (reorder, hide `product-related`, change a
  heading) → **every** product reflects it after publish; the sample-item preview shows it live (draft)
  before publish via the §1 token transport.
- **Scope safety:** the editor cannot add a `collection-products` to a product template; the service
  rejects it if attempted via API/MCP.
- **No regressions:** home composition + CMS/custom slug pages still resolve (the §6.4 shim); rollback
  restores a template'd snapshot.
- **Green gate throughout:** `format:check` + `lint` + `typecheck` + unit tests (run `pnpm format`, never
  bypass the hook).

---

## 11. Out of scope — deferred to Phase 4 (assignment)

Explicitly **not** built here (these are the screenshot's "applies to" surface):

- The Site-Builder-owned **default mapping table** `(scope, contentTypeId?) → templateId`.
- The **per-item override** pointer on Commerce/CMS records (Open Q 13.1: nullable FK vs module-owned
  assignment table).
- The storefront **resolver cascade** (`item/group override → type default → seeded scope default →
  safety fallback`). Phase 3's resolver is the trivial case: *the single template for the scope, else
  the code default.*
- The **"Layout: [template ▾]"** control in the Commerce product editor / CMS entry editor.
- More than one named layout per scope (Phase 3 ships exactly the `default`).

Phase 4 gets its own spec (tracker). When it lands, Phase 3's `sectionsForScope(snapshot, scope)`
generalizes into the cascade with no change to the bound section family or render seam.

---

## 12. Open decisions needing sign-off before build

1. **Migration drops `page_key`.** §3.3 re-keys cleanly (template `key` preserves the slug; §6.4 shim
   keeps old snapshots renderable). The alternative — keep `page_key` as a denormalized mirror
   alongside `template_id` — avoids the irreversible drop but leaves two sources of truth. *Lean: drop
   it.* Confirm.
2. **Code-defined defaults (§5) vs seeded rows.** *Lean: code-defined* (no-rows-until-used, exact
   parity, no per-tenant data migration). Confirm — this is the load-bearing call for the whole phase.
3. **Snapshot shape: enrich `SectionSnapshot` (scope/templateKey) vs add a `templatesSnapshot`
   column.** *Lean: enrich the existing JSON* (no column, old versions stay renderable, matches doc 30
   §9). Confirm.

All three honor doc 30; none reopen the contract. With sign-off, the build order is §9.
