# Site Builder P-B — Target Registry (implementation spec)

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

---

## 1. Goal

Per [docs/36-sitebuilder-layering-model.md](../36-sitebuilder-layering-model.md) §4 and §11: replace the
Site Builder's fixed `scope` enum (`home | product | collection | cms-page | custom`) with **data-driven
target ids** declared by modules through a **code-level registry**, and generalize section availability
from scopes to targets so bound sections can be **cross-module**. This is the load-bearing decision of
doc 36 (§4). It resolves doc 36 **Open Q 12.1** (target-id grammar) and **12.4** (registration mechanism).

It does **not** build assignment/resolver (P-C), the unified Layouts surface (P-D), the §7 home-collapse,
or §8 layout-driven authoring — those stay deferred.

## 2. Locked decisions

- **Grammar (resolves §12.1).** Namespaced `<module>:<kind>[:<key>]`, lowercase. Near-term registered:
  - `site:home` (← old `home`; stays a distinct target — the §7 home-as-content-page collapse stays deferred to P-D)
  - `commerce:product` (binding: product), `commerce:collection` (binding: collection)
  - `cms:content-page` (← old `cms-page` **and** `custom`, which were redundant: same label, both keyed by slug)
  - `cms:content-type:<contentTypeId>` — **data-driven**, one per CMS content type, **keyed by the stable
    content-type id** (not slug, so a rename never re-keys layouts). Modeled + admitted by the registry now;
    live per-type targets get wired when CMS-editor coordination lands (P-C/§8).
  - Future, admitted by registration with zero SB change: `commerce:category`, `commerce:warehouse`,
    `cms:taxonomy`, `b2b:*`.
- **Registration mechanism (resolves §12.4).** Code-level provider (the doc's lean). A
  `STATIC_LAYOUT_TARGETS` catalog constant + a `cmsContentTypeTarget(id, label)` factory for data-driven
  targets, all in `@sparx/sitebuilder-schemas`. No runtime/DB registry — added later only if modules deploy
  independently of SB (§12.5-style additive step).
- **Section availability.** Drop `SectionDefinition.scopes: Scope[]`. Availability derives from the existing
  `binding?: 'product' | 'collection'`: a **static** section (no binding) is allowed in **every** target; a
  **bound** section is allowed in targets whose descriptor `binding` matches. The cross-module case (§4.3 — a
  product-bound section opted into a content page against a configured set) is modeled via an optional
  `alsoTargets?: string[]` but **deferred** until a real cross-module section needs it (no near-term section does).
- **Storage = full re-key (owner decision 2026-05-31).** Rename column `scope` → `target_id` (widen
  `VarChar(31)` → `VarChar(63)`), re-key the draft `PageLayout` values, **and rewrite the
  `sections_snapshot` JSON** on stored `SiteVersion`s so every persisted value is a namespaced target id —
  **no bare-scope→target-id compat shim left behind.** Fold in the physical rename P-A deferred
  (`sitebuilder_templates` → `sitebuilder_page_layouts`, `template_id` → `page_layout_id`). The older,
  orthogonal **pre-3.0 `pageKey`→target fallback** stays (it predates `scope` entirely; it now produces
  target ids).

## 3. Build order (two increments)

- **P-B1 — registry + section generalization (no migration, backward-compatible).** New
  `layout-targets.ts` (descriptors + static catalog + factory + helpers). Generalize `SectionDefinition`
  (drop `scopes`, keep `binding`). New `isSectionAllowedInTarget` / `sectionsForTarget`. Remove `SCOPES` /
  `Scope` / `ScopeEnum` / `ALL_SCOPES` / `isScope` / `sectionsForScope` / `isSectionAllowedInScope`. Replace
  `ScopeEnum` in `inputs.ts` with a `TargetId` validator. Update `section-registry.test.ts`. Pure code — no
  DB, no snapshot, no live-store risk.
- **P-B2 — storage re-key + all consumers (one migration).** Schema + migration (§4); services
  (`page-layout-service`, `section-service`, `publish-internals`); api-rest routes + MCP; storefront
  (`lib/site.ts` resolve + product/collection pages + `DEFAULT_TEMPLATES`); dashboard (`_lib`, components,
  route pages). Field `scope` → `targetId` end to end. `templateKey` / `templateId` / `pageKey` snapshot wire
  keys keep their P-A names (renaming those is a separate, later tidy — out of P-B scope).

## 4. Migration (`<next-ts>_sitebuilder_target_registry`) — sketch

Authored locally against docker Postgres; applied to prod via the **DB Migrate workflow** (Cloud SQL is
private-IP; never the laptop). One e2e tenant exists, so the practical blast radius is tiny.

```sql
-- physical rename (P-A deferral) + its indexes/constraints (Postgres does NOT auto-rename these)
ALTER TABLE "sitebuilder_templates" RENAME TO "sitebuilder_page_layouts";
ALTER TABLE "sitebuilder_sections" RENAME COLUMN "template_id" TO "page_layout_id";
-- scope -> target_id + widen
ALTER TABLE "sitebuilder_page_layouts" RENAME COLUMN "scope" TO "target_id";
ALTER TABLE "sitebuilder_page_layouts" ALTER COLUMN "target_id" TYPE VARCHAR(63);
-- re-key draft PageLayout values
UPDATE "sitebuilder_page_layouts" SET "target_id" = CASE "target_id"
  WHEN 'home' THEN 'site:home' WHEN 'product' THEN 'commerce:product'
  WHEN 'collection' THEN 'commerce:collection' WHEN 'cms-page' THEN 'cms:content-page'
  WHEN 'custom' THEN 'cms:content-page' ELSE "target_id" END;
-- rewrite sections_snapshot JSON: each element's "scope" -> "targetId" (re-keyed); leave pre-3.0 (no scope) alone
UPDATE "sitebuilder_versions" v SET "sections_snapshot" = (
  SELECT COALESCE(jsonb_agg(CASE WHEN e ? 'scope'
    THEN (e - 'scope') || jsonb_build_object('targetId', CASE e->>'scope'
      WHEN 'home' THEN 'site:home' WHEN 'product' THEN 'commerce:product'
      WHEN 'collection' THEN 'commerce:collection' WHEN 'cms-page' THEN 'cms:content-page'
      WHEN 'custom' THEN 'cms:content-page' ELSE e->>'scope' END)
    ELSE e END), '[]'::jsonb)
  FROM jsonb_array_elements(v."sections_snapshot") e)
WHERE jsonb_typeof(v."sections_snapshot") = 'array';
-- rename the now-stale index/constraint names to what Prisma expects for the renamed model/fields
-- (sitebuilder_page_layouts_tenant_id_target_id_key_key, _tenant_id_target_id_idx,
--  sitebuilder_sections_tenant_id_page_layout_id_position_idx, _page_layout_id_fkey) — exact names verified
-- against the prior migration before writing.
```

RLS: `sitebuilder_page_layouts` already carries ENABLE+FORCE RLS from the Phase-3 table; the rename keeps the
policy (policies attach to the table OID, not the name). Confirm with `pnpm db:rls-audit` after applying.

## 5. Deploy ordering (prod, user-triggered)

Same staged discipline as the 1D migrations: **deploy the P-B2 code (which reads/writes `target_id`) to prod
first, then run `gh workflow run db-migrate.yml` once.** Window between the two: the live storefront only
consults targets for product/collection pages, and those **fall back to `DEFAULT_TEMPLATES`** when a
target lookup misses — so a bare-valued snapshot during the window degrades to the seeded default, never a
hard error. Home / CMS pages render off `pageKey`, untouched. This migration **joins the still-pending prod
set**; one `prisma migrate deploy` covers all pending at once.

## 6. Non-goals (deferred, unchanged from doc 36 §11)

Assignment/resolver + the `Layout: [▾]` picker (P-C); the unified Layouts surface + code-first Page Template
catalog (P-D); the SiteLayout regions tier; §7 home-as-content-page; §8 layout-driven authoring; §2.5 email
designer retirement.
