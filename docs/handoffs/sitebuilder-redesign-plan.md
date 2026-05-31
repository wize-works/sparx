# Site Builder Redesign — Execution Plan

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

> Task tracker for the Site Builder redesign. The architecture contract is
> [docs/30-sitebuilder-redesign.md](../30-sitebuilder-redesign.md); section refs (§) below point
> into it. Check tasks off as they land. Each phase is independently shippable — deploy the
> moment a slice works (per the deploy-early practice); don't wait for a whole phase.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
**How we track:** this file is the source of truth across sessions; an active work session also
gets a live TodoWrite list. Can mirror to the kanNINJA board on request.

**Build order:** P1 first (foundation + the trust loop), then P2 (the one screen), then P3
(templates), then P4 (assignment). Within P1 the four workstreams (1A–1D) are independent and
ship separately — recommended order is 1A → 1B → 1C → 1D by leverage and risk.

---

## Phase 1 — Foundation & truth (§6, §7, §8, §10)

Goal: the existing screens stop lying and stop looking like a prototype; module boundaries are
corrected; brand becomes one source of truth. No new editor shell yet.

### 1A · Preview tells the truth — the "doesn't apply" fix (§7) — _highest leverage, no schema change_

- [x] Add a server action/endpoint that mints a Site Builder preview-token JWT (mirror CMS `/v1/content/preview-tokens`), scoped to tenant + page/scope.
- [x] Replace the literal `sparxPreview=1` with the minted token in `preview-frame.tsx` and `customizer.tsx`.
- [x] On every section save/mutation, re-fetch/refresh the canvas so the change shows without a manual reload.
- [x] Confirm the storefront draft path (`apps/storefront/lib/content.ts` + `site.ts`) returns the draft for a valid token — expect **no** storefront change.
- [~] **Acceptance (Playwright):** _(pending deploy)_ edit a hero heading → Save → the preview shows the new value. Re-run the exact repro that failed in the eval.

### 1B · Padding, container & craft details (§10)

- [x] Add horizontal padding + a max-width container to `sitebuilder/layout.tsx` (replace the bare `py-10`).
- [x] Wire the existing CMS media picker into image fields in `field-control.tsx` (kill the raw `id` text box).
- [x] Replace ▲▼ reorder with `@dnd-kit` drag in `section-builder.tsx` (dependency already installed).
- [x] De-duplicate the Light/Dark toggle in `customizer.tsx` (one switch).
- [x] Guided empty state for a page/layout with no sections.
- [x] Visual section gallery (thumbnails) for the add-section picker (replaces the text list).
- [x] Sensible section defaults so a freshly added section looks good before it's touched.
- [x] Fix the self-contradicting "drag order with the arrows" copy.

### 1C · Navigation ownership flip → CMS (§8)

- [x] Move `NavigationMenu` + `NavigationItem` models to `16-cms-navigation.prisma` (`@@map` unchanged); confirm `prisma migrate diff` is empty (no migration).
- [x] Move editor files (`navigation/[location]/page.tsx`, `menu-editor.tsx`, `menu-detail.tsx`, `menu-actions.ts`) to `/cms/navigation`; repoint `revalidatePath`.
- [x] Split `/sitebuilder/navigation`: the Menus list → CMS; keep `layout-editor.tsx` (header/footer/announcement slots) in Site Builder.
- [x] Move the "Navigation" section + `menu` entityType from `sitebuilderManifest` → `cmsManifest`.
- [x] Repoint cross-links (SB slot editor "edit this menu's links" → `/cms/navigation/:location`).
- [x] Amend doc 29 §2 + the schema/code header comments; bump doc 29 version.
- [~] **Verify:** storefront still resolves menus (no change expected, confirmed in code); Playwright pass _(pending deploy)_ on `/cms/navigation` + the SB slot editor.

### 1D · Brand = tenant-level source of truth (§6) — _heaviest; involves a migration via the pipeline_

- [ ] Decide storage shape (Open Q 13.4): dedicated `TenantBrand` table vs `tenants.settings.brand`.
- [ ] Add the brand model/shape + RLS (hand-edited migration SQL); author locally against docker Postgres (`pnpm db:up`).
- [ ] Migration: consolidate `StorefrontTheme.{logoMediaId, logoDarkMediaId, faviconMediaId}` + `EmailSettings.brandingOverride` into brand; backfill existing tenants.
- [ ] Rewire `resolveEmailBrand` (`packages/email-platform/src/services/brand-service.ts`) to read the tenant brand directly; drop the StorefrontTheme + `brandingOverride` branches; keep the Sparx-default fallback.
- [ ] Remove `brandingOverride` end to end: `50-email.prisma`, `settings-service.ts`, `schemas/settings.ts`, the dashboard email settings form, `email/_lib/types.ts`.
- [ ] Make the storefront theme + `StorefrontTheme` write-through **source** logo/palette from brand (read-only — no consumer override, the §6.2 rule).
- [ ] Surface a **Brand** editing panel (SB rail entry) + onboarding tie-in; both write to the one tenant brand record.
- [ ] Apply the migration via the **DB Migrate workflow** (Cloud SQL is private-IP only), re-seed if needed.
- [ ] **Verify:** email renders brand with no published storefront; editing brand updates storefront + email together; confirm no module path can override brand.

---

## Phase 2 — The one screen (§3)

Goal: a single unified editor replaces the six-route hub.

**Decisions locked (2026-05-31):**

- **Use the shipped two-tier dashboard nav — NO bespoke scope rail.** The dashboard now has
  `rail-nav` (icon module switcher) → `contextual-panel` (per-module section nav, data-driven from
  `ModuleManifest.sections`) → content area. Site Builder's scopes ARE its manifest sections; the
  contextual panel is the scope switcher. (Superseded the earlier custom-icon-rail plan.)
- **Persistent canvas in `/sitebuilder/layout.tsx`.** A client `EditorShell` in the layout holds the
  ONE preview iframe + the §1 transport (postMessage helpers via React context, `useEditorCanvas()`).
  Each scope is a CHILD route whose page renders only its inspector; Next layout-persistence keeps
  the iframe mounted across scope switches (Theme↔Pages = inspector swaps, canvas stays live). Canvas
  shown only for a `CANVAS_SCOPES` allowlist; Brand (self-contained board) + Publishing + un-migrated
  routes render full-width.
- **Panes rewritten v2-native as shippable increments** (end state: generator panes, old routes
  gone). The v2 storage cutover (TenantBrand.tokens + drop StorefrontTheme cols) stays **staged
  separately**: read-both-shapes code deploys first, the destructive migration runs after.

So doc 30 §3's "one screen" = platform two-tier nav (kills the route-bounce) + persistent-canvas
layout (keeps live preview + docked inspector + in-canvas selection).

**Increment order (each shippable):**

- [x] **§2.0 EditorShell foundation** (2026-05-31, green) — `_components/editor-shell.tsx` (persistent
      canvas iframe + device/mode toolbar + `EditorCanvasContext`/`useEditorCanvas` exposing
      setMode/setThemeCss/highlightSection/setPreviewPath/reload/onSectionSelected; re-asserts live
      state on `sparx-preview-ready`; responsive Edit/Preview stack below `lg`). `/sitebuilder/layout.tsx`
      mounts it (resolves slug/storefrontOrigin/previewToken once). `/sitebuilder` Overview rewritten
      slim (status + active theme + jump links) to sit in the inspector column with the live preview
      beside it. Manifest curated: dropped "Themes" gallery, relabeled Design→"Theme". `CANVAS_SCOPES`
      = `/sitebuilder` only for now (un-migrated routes still render full-width, unchanged).
- [x] **§2.1 Header & footer onto the canvas** (2026-05-31, green) — `/sitebuilder/navigation` added to
      CANVAS_SCOPES; `layout-editor` slot saves call `useEditorCanvas().reload()` so the chrome
      reflects the draft. Also fixed a §2.0 matcher bug (bare `/sitebuilder` was prefix-swallowing all
      children → canvas wrongly shown everywhere; root now matches exactly).
- [x] **§2.2 Pages + Homepage onto the canvas + in-canvas section editing** (2026-05-31, green) —
      `section-builder` rewired to the persistent canvas: docked INLINE editor (replaced the modal),
      two-way selection (canvas click → `onSectionSelected` opens the editor; open section →
      `highlightSection` outlines it), `setPreviewPath` per page, `reload()` on every mutation. Both
      `/sitebuilder/homepage` + `/sitebuilder/pages` render `SectionBuilder` directly; the orphaned
      `PageBuilder` + sitebuilder `PreviewFrame` were deleted. (Homepage/Pages kept as separate scopes
      — the merge is deferred, low value.)
- [x] **§2.3 Theme pane v2-native** (2026-05-31, green: typecheck 38/38, lint 0 err, 50 theme tests) —
      the v2-native Theme inspector replaces the v1 customizer, edits the PRESENTATION overlay (surfaces
      base100/200/300 + baseContent, neutral, status, border, container) for the canvas's current mode,
      and streams the compiled result to the live preview with NO reload. v2 storage cutover landed
      backward-safe + WITHOUT a migration. Key design change vs the original spec: `compiledV2` is
      computed at **READ time** in `publish-service.overlayBrand` (NOT baked into the version on publish)
      — so a brand edit reflects live on the v2 path too, and the stored `SiteVersion` shape is untouched.
      Files: (1) `storefront-themes/src/v2/tenant.ts` (new) — `brandColsToTokenDoc` +
      `compileThemeForTenant({themeKey, brand, presentation})`, exported from `v2/index.ts`, the ONE
      entry both the read path and the inspector call (+ `tenant.test.ts`). (2) `sitebuilder-schemas`
      `site-settings.ts` — optional permissive `PresentationOverlay` added to `SiteSettings` (persists in
      `draftSettings`). (3) `publish-internals.ts` — `PublishedSnapshot += compiledV2?` (set later, not in
      `toPublishedSnapshot`). (4) `publish-service.ts` — `overlayBrand` now also compiles `compiledV2`
      live (theme key + live brand cols + presentation), `readPresentation()` pulls the overlay from the
      version snapshot (published) / draft config (draft). (5) storefront — `lib/site.ts`
      `PublishedSnapshot += compiledV2?`; `lib/theme.ts` prefers `buildThemeCssV2(compiledV2)` else the
      legacy bridge; `app/layout.tsx` passes it. (6) dashboard — new `_components/theme-inspector.tsx`
      (theme picker + appearance + per-mode swatch grid + container; edit → `compileThemeForTenant` +
      `buildThemeCssV2` → `useEditorCanvas().setThemeCss()` LIVE + debounce-save the FULL settings object
      so legacy `tokens`/`customCss` aren't wiped — `updateSettings` replaces `draftSettings` wholesale);
      `design/page.tsx` renders it via `getBrand()`; `/sitebuilder/design` added to `CANVAS_SCOPES`;
      `customizer.tsx` + `theme-gallery.tsx` + `/themes` route deleted. NOT runtime-verified (build green
      only); recommend eyeballing on the deploy or local `pnpm db:up`.
- [x] **§2.4 Brand pane v2-native** (2026-05-31, green: typecheck 38/38, lint 0 err, 52 theme tests;
      migration applied to LOCAL docker only — **prod via db-migrate.yml, user-triggered**). The Brand
      pane now edits identity (colour/type — existing) PLUS shape/rhythm/effect (new), and the storefront
      SSR + the Theme scope's live canvas pick up the brand feel via `compileThemeForTenant`. Kept the
      shipped self-contained brand BOARD full-width (NOT a canvas scope) — flipping it into the ~360px
      inspector would have forced a rewrite of a good, working surface; instead the board's "Applied"
      samples now reflect the chosen radius/border/depth so the feel is truthful. **Decisions:** (a)
      `tenant_brands.tokens` JSONB stores ONLY shape/rhythm/effect — colour/type stay in their dedicated
      columns (one source of truth per axis); (b) feel exposed as approachable preset knobs (Corners /
      Border weight / Spacing / Control size / Depth), each with a "Theme default" that clears the axis so
      it inherits the preset (brand never silently pins a default). Files: migration
      `20260610000300_tenant_brand_tokens` (additive `ADD COLUMN tokens JSONB`, nullable, no policy change
      — table already RLS); schema `07-tenant-brand.prisma` `tokens Json?`; `storefront-themes/v2/tenant.ts`
      `TenantBrandColumns += tokens?: unknown`, `brandColsToTokenDoc` merges shape/rhythm/effect (+ tests);
      api-rest `/v1/brand` (PatchBrand/BrandView/toView + `tokens` via `Prisma.DbNull` clear); `publish-service`
      brand select `+tokens`; dashboard `_lib/brand-feel.ts` (NEW: preset tables + resolve/reverse-match +
      cleanTokens), `brand-panel.tsx` ("Shape & feel" section + FeelSelect), `brand-board.tsx` (Applied
      samples honor feel), `_lib/types.ts` `BrandDto += tokens`, `theme-inspector.tsx` `brandCols += tokens`.
  > **⚠️ PROD MIGRATION:** `20260610000300_tenant_brand_tokens` is applied LOCALLY only. Deploy the §2.4
  > code first, then `gh workflow run db-migrate.yml` (additive column → safe either order, but follow the
  > deploy-first rule). It joins the still-pending 1D trio (…000000/000100/000200) — `prisma migrate deploy`
  > applies ALL pending at once, so a single workflow run covers them.
- [ ] **§2.5** — retire the email designer (Phase 1 done → constraint lifted).
- [ ] **Acceptance:** the full design → compose → publish loop happens on one screen.

> NOTE: build dashboard UI on the **docs/35 four-axis component API** — `color` (primary/success/…)
> × `variant` (solid|soft|outline|dashed|ghost|link) × size × shape. `primary`/`success` are colors,
> not variants. See [[reference_ui_color_variant_api]].

**§1 · Preview transport — DONE + green (2026-05-31):** storefront `PreviewBridge` (self-gates on
`?sparxSitePreview`, sets `data-sparx-preview`, injects `<style id=sparx-live>`, mode flip, section
highlight, emits `sparx-preview-ready` + `sparx-section-selected`); `section-renderer` wrappers carry
`data-section-id`/`-type`; preview chrome CSS; bridge mounted in storefront layout; customizer rewired
to `sparx-preview-mode`. Locked message contract documented in `preview-bridge.tsx`. Runtime
acceptance pending deploy. (Live token streaming deferred to §2.1's v2 inspector.)

---

## Phase 3 — Layouts as templates (§4)

Goal: the storefront becomes fully composable. Needs its own implementation spec before build.

- [ ] Write the Phase 3 implementation spec (honors doc 30 §4).
- [ ] `SiteTemplate` model + `scope` enum; migration generalizing `SiteSection.pageKey` → `templateId` + scope (RLS, hand-edited).
- [ ] Bound section schemas in `@sparx/sitebuilder-schemas` — product (gallery, title/price/availability, add-to-cart + variants, meta, fitment, reviews, related) and collection (header, product grid, filters/sort, pagination); scope-restricted registry.
- [ ] Storefront `section-renderer.tsx` resolves bound sections from the assigned item's data.
- [ ] Seed default `product` + `collection` templates expressing today's hardcoded PDP/PLP (day-one parity).
- [ ] Switch storefront `products/[handle]` + `collections/[handle]` to template-driven rendering with the seeded default as fallback.
- [ ] Sample-item preview binding in the editor (`preview against [sample product ▾]`).
- [ ] **Acceptance:** edit the product template → every product reflects it; seeded default renders identically to today.

---

## Phase 4 — Assignment (§5)

Goal: design once, apply to many. Needs its own implementation spec before build.

- [ ] Write the Phase 4 implementation spec (honors doc 30 §5).
- [ ] Resolve Open Q 13.1 (per-item override: nullable FK vs module-owned assignment table) and Open Q 13.2 (group-level rules scope).
- [ ] Site-Builder-owned default mapping table `(scope, contentTypeId?) → templateId`.
- [ ] Per-item override on the Commerce/CMS records that own them.
- [ ] Storefront site-resolver cascade: item/group override → type default → seeded scope default → safety fallback.
- [ ] "Layout: [template ▾]" control in the Commerce product editor + CMS entry editor.
- [ ] **Acceptance:** a per-item override and a per-content-type default both resolve correctly at render.

---

## Cross-phase notes

- Every migration: authored locally against docker Postgres, applied via the DB Migrate workflow (never the laptop) — RLS hand-edited into the SQL. See [packages/db/README.md](../../packages/db/README.md).
- Brand (1D) and templates (P3) carry the only new schema; the publish/version/theme backend is reused unchanged.
- Keep the working tree green for the pre-push guard (`format:check` + `lint` + `typecheck`); run `pnpm format` rather than bypassing hooks.
