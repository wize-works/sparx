# Site Builder P-C — Assignment & Resolver (implementation spec)

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

---

## 1. Goal

Per [docs/36-sitebuilder-layering-model.md](../36-sitebuilder-layering-model.md) §6 and §11: **Site Builder
owns the layouts and the assignment; the data module owns its records.** Add SB-owned assignment tables, a
storefront **resolver cascade**, and a `Layout: [▾]` picker in the Commerce product editor + CMS entry editor.
Builds on P-B's target ids. Does not build the unified Layouts surface / per-target-default UI (P-D) or
layout-driven authoring (§8).

## 2. Locked decisions

- **Two SB-owned tables** (both FK `PageLayout` `onDelete: Cascade`, ENABLE+FORCE RLS):
  - `SiteLayoutDefault (tenantId, targetId) → pageLayoutId` — the tenant's chosen default layout for a target.
    Unique `(tenantId, targetId)`. Absent → the target's `key='default'` layout, then the code default.
  - `SiteLayoutAssignment (tenantId, targetId, itemRef) → pageLayoutId` — a per-item override. Unique
    `(tenantId, targetId, itemRef)`.
- **`itemRef` = the record's stable `id`** (uuid), never the mutable handle/slug. The module owns the record;
  SB references it by id.
- **Assignments are read LIVE, not baked into the version** (no new `SiteVersion` column). Computed at
  snapshot-read from the tables — exactly like brand / `compiledV2` (publish-service `overlayBrand`). Rationale:
  a layout's *sections* must be published to take effect regardless, so baking the assignment buys nothing;
  LIVE avoids a column + rollback-restore complexity, and an assignment edit reflects as soon as the
  referenced layout's sections are published. Existing tenants (no rows) → resolver lands on `default` → today's
  behavior unchanged.
- **Resolver cascade** (storefront, per page render): `per-item override → per-target default → 'default' key
  → seeded code default (DEFAULT_TEMPLATES) → empty`. `resolveTemplateSections(snapshot, targetId, itemRef?)`
  resolves a `layoutKey`, then renders `sectionsForTarget(snapshot, targetId, layoutKey)`.
- **Snapshot shape** gains `assignments?: { defaults: Record<targetId, layoutKey>; items: Array<{ targetId,
  itemRef, layoutKey }> }`. Only non-`default` defaults and actual overrides appear (small).
- **Picker scope (owner decision 2026-05-31): build both editors' pickers now.** The Commerce product/collection
  picker is wired end-to-end (the storefront resolver consumes it). **The CMS entry-editor picker stores valid,
  forward-compatible assignments but has NO storefront effect until §8** (CMS pages still render off `pageKey`,
  not the target resolver) — the picker UI says so, and it's flagged in the tracker.
- **Open Q 12.3 (group-level assignment)** stays deferred — the `itemRef` column can later carry a group ref,
  no schema change needed.

## 3. Build order

- **P-C1 · Backend** — schema (2 tables) + migration + `assignment-service` + inputs + api-rest
  `/v1/sitebuilder/assignments` + snapshot wiring (live read in `getPublishedSnapshot`/`getDraftSnapshot`) +
  storefront resolver cascade (`lib/site.ts` + product/collection pages) + tests.
- **P-C2 · Commerce picker** — dashboard `LayoutAssignmentPicker` client component + SB `_lib` api/actions;
  mount in the product editor (server-fetch layouts + current assignment, pass to the client picker).
- **P-C3 · CMS picker** — mount the same picker in the CMS entry editor (target `cms:content-type:<typeId>`),
  with write-only-until-§8 helper text.

## 4. Migration (`<next-ts>_sitebuilder_layout_assignments`)

`CREATE TABLE` ×2 + FKs (tenant + page_layout, both cascade) + unique indexes + ENABLE/FORCE RLS +
`*_tenant_isolation` policy on `current_tenant_id()`. Additive, no backfill. Authored locally, applied to prod
via the **DB Migrate workflow** (user-triggered; joins the still-pending set).

## 5. Non-goals (deferred)

Per-target-default UI + unified Layouts surface (P-D); CMS storefront rendering through layouts (§8); group-level
assignment (Open Q 12.3); the SiteLayout regions tier.
