# 07 — Phase 7: Cutover & route consolidation

> ⚠️ **SUPERSEDED 2026-07-22.** The "Builder v2" series (docs 00–06) was inverted by the silicaui `<Builder>` adoption — sparx now HOSTS silica's engine instead of building its own shell/inspector/affordances. See **docs/118-builder-silicaui-html-migration.md** for the current architecture. This doc is the closest of the series to what shipped (route consolidation onto one editor still happened, now the silica studio at `sparx/apps/workbench/surfaces/builder/studio/studio-surface.tsx`), so its route/nav consolidation intent still reads true — but treat 118 as source of truth.

Version: 1.1
Author: Brandon Korous
Last Updated: 2026-07-22

> The final phase: make the unified editor _the_ builder, retire the split
> `/builder/{brand,site,page}` routes, and delete the now-dead second render path
> (`registry.tsx` canvas render functions) so there is exactly one of everything.
> With no users to protect, this is a clean replacement, not a long migration —
> but it is the phase where the loose ends get tied so nothing dangles.
>
> Depends on [02](02-canvas-live-renderer-unification.md) (one render path),
> [03](03-unified-builder-shell.md) (the unified shell), and ideally
> [04](04-inspector-full-design-surface.md)/[05](05-editor-affordances.md) landed so
> the unified editor is at full capability before it becomes the only one.

## 1. What gets consolidated

| Today                                                                | After cutover                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `/builder/brand` (theme-center)                                      | Theme node in the unified editor                          |
| `/builder/site` (site layout editor)                                 | Site-layout zone of the unified editor                    |
| `/builder/page` (page editor)                                        | Page (Outlet) zone of the unified editor                  |
| `/builder/email`                                                     | Email sibling surface (kept)                              |
| `/builder/components`                                                | kept (catalog + custom editor)                            |
| `/builder/blueprints`                                                | kept                                                      |
| `/builder` (surface picker)                                          | the overview home ([06](06-builder-overview-home.md))     |
| `registry.tsx` canvas render fns                                     | **deleted** (render lives in `@wizeworks/builder-render`) |
| `canvas.tsx` mock branches (`CanvasCarousel`, commerce/Button mocks) | **deleted**                                               |

## 2. Decisions

**2.1 Replace, don't shadow.** No permanent `/builderv2`. The unified editor
becomes the `/builder` editor. If Phase 3 was built at a temporary path to de-risk,
this phase moves it to the canonical route and removes the temporary one.

**2.2 Redirect the old routes.** `/builder/brand|site|page` → the unified editor,
opening the corresponding zone/selection (e.g. `/builder/brand` opens the editor
with the Theme node selected; `/builder/page?page=<id>` opens with that page in the
Outlet). Use the dashboard redirect layer (`sparx/apps/workbench/next.config.mjs`
`redirects()`), preserving the `?page=` deep-link contract.

**2.3 Delete the dead render path.** Once the unified editor and the live site both
render through `@wizeworks/builder-render` ([02](02-canvas-live-renderer-unification.md)),
remove the `renderLeaf`/`CanvasCarousel`/mock branches from `registry.tsx` and
`canvas.tsx`. `registry.tsx` retains metadata only. Grep for any remaining importer
of the old render functions and clean them up.

**2.4 Update navigation, breadcrumb, recents, search.** The Builder module
sub-nav, the breadcrumb, the "Recents" list, and ⌘K search entries reference
`/builder/brand|site|page`. Repoint them to the unified editor (with the right
initial zone/page). Don't leave dangling nav items.

**2.5 Update docs + the module manifest.** Mark [29](../29-sitebuilder-architecture.md)/
[30](../30-sitebuilder-redesign.md)/[45](../45-builder-site-layout.md) as
superseded-where-relevant by this `docs/builder/` set; update the
[builder surface registration](../../apps/workbench/lib/surfaces/catalog/builder.ts) and
any `MODULE_SLUGS`-style hardcoded lists ([feedback_module_slug_stale_lists]).

**2.6 No capability regressions — checklist gate.** Cutover is blocked until a
parity checklist passes: every action from the three old editors exists in the
unified one (catalog CRUD, rename/delete/duplicate/activate/set-default, slug, SEO
panel, saved themes apply/rename/delete, import/export, preview, publish), plus the
per-site behaviors ([per-site brand]).

## 3. Work breakdown

| Step | Area | Change |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------- |
| 1 | route | Make the unified editor the `/builder` editor; remove any temp path. |
| 2 | `next.config.mjs` | Redirect `/builder/brand                                                                                                 | site | page`(+`?page=`) to the unified editor with the right zone/selection. |
| 3 | `registry.tsx` / `canvas.tsx` | Delete the dead render functions + mock branches; registry = metadata only. |
| 4 | nav/breadcrumb/recents/⌘K | Repoint all references; remove dangling items. |
| 5 | docs/manifest | Supersede old docs where relevant; update manifest + hardcoded module lists. |
| 6 | parity checklist | Walk the §2.6 checklist in the browser; fix gaps before flipping. |
| 7 | cleanup | Remove `site-builder-app.tsx` / `builder-app.tsx` shells if fully replaced; delete unused imports; lint/typecheck clean. |

## 4. Acceptance criteria

- `/builder` is the overview home; the unified editor is the one builder.
- Old routes redirect correctly, preserving `?page=` deep links; no 404s, no
  dangling nav/recents/search entries.
- Exactly one per-type render path exists in the repo; `registry.tsx` no longer
  renders nodes; the mock branches are gone.
- The §2.6 parity checklist passes — no capability lost from the three old editors.
- Lint + typecheck clean across `@sparx/dashboard`, `@wizeworks/api-rest`,
  `@wizeworks/sitebuilder`, and the new `@wizeworks/builder-render`.
- The per-site brand isolation + site-switch remount behavior still holds.

## 5. Risks & notes

- **Silent capability loss** is the main risk — the split editors accreted small
  features (set-default collection, slug normalization, saved-theme apply, the SEO
  health popover). The §2.6 checklist is the guard; treat a missing item as a
  cutover blocker, not a follow-up.
- **Deep-link contract.** External links / docs reference `/builder/page?page=<id>`
  and `/builder/brand`; the redirects must keep them working.
- **One commit per concern.** Land the redirect + nav repoint together, and the
  dead-code deletion separately, so a regression is easy to bisect.
- This phase is the place the "no `// later` TODO" rule is enforced
  ([feedback_commit_means_full_surface]): if a capability isn't in the unified
  editor, it doesn't get cut over with a TODO — it gets built first.
