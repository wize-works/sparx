# Site Builder Redesign — Execution Plan

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

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

- [ ] Build the workspace shell — status bar / structure rail / live canvas / inspector regions (chrome from `@sparx/ui`, inside `<ModuleProvider module="storefront">`).
- [ ] Single persistent canvas iframe (replace the two preview harnesses); device + light/dark toggles live once, here.
- [ ] In-canvas section selection: click a section in the canvas → it selects → the inspector opens. (Needs the storefront to emit section anchors/ids + a postMessage selection channel.)
- [ ] Docked inspector replaces the centered `SectionEditor` modal; edits are visible against the live result while editing.
- [ ] Single status bar owns publish / schedule / version history (replaces the duplicated/missing `PublishBar`).
- [ ] Move static-section composition into the shell; retire the 6-route hub (redirect old routes).
- [ ] Drag reorder + visual section gallery integrated into the rail.
- [ ] **Acceptance:** the full design → compose → publish loop happens on one screen.

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
