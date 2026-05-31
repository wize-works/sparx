# Sparx Platform — Dashboard Working-Area Standard

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

> **1.1 (2026-05-31):** Locked intra-module navigation as a **rail + contextual sidebar** (§11) — module sections move out of in-content tab strips and card-grid-as-nav into the shell's contextual panel; in-content tabs are now reserved for record facets only. Shell-side detail in [doc 24](24-dashboard-shell.md) §5.

---

## 1. Purpose & Scope

The [Dashboard Shell](24-dashboard-shell.md) defines the **chrome** — the sidebar, the header breadcrumb, the `…` menu, the theme toggle. This document defines the **working area**: everything rendered inside `<main>`, below the breadcrumb/control bar, where the actual module work happens.

Today that working area is improvised per page. A live audit of 19 representative pages (every module × every archetype, 2026-05-31) found four different module-landing layouts, four list-rendering styles, three empty-state treatments, three page-header anatomies, two back-link placements, and Commerce primary buttons rendering in the wrong color. This standard collapses those into one set of archetypes built from the primitives that already exist in `@sparx/ui`.

**In scope:** page header, content width, list/table rendering, empty states, stat cards, section/nav-card grids, in-content tabs, forms and their save affordance, module-overview composition, the module-preview ("coming online") template, and the placement of primary/secondary actions.

**Out of scope:** the sidebar, breadcrumb, `…` menu, theme, ⌘K — all owned by [doc 24](24-dashboard-shell.md). The component primitives themselves (CVA pattern, token rules, "Tailwind never in feature code") are owned by [doc 23](23-frontend-component-architecture.md); this doc composes them, it does not redefine them.

---

## 2. Core Principles

1. **Archetype, not improvisation.** Every working-area page is exactly one of six archetypes (§4). The archetype dictates the layout; pages do not invent their own.
2. **Compose primitives, never restyle them.** The building blocks live in `@sparx/ui` (`Container`, `Card`, `Stat`, `DataTable`, `EmptyState`, `Tabs`, `Grid`, `Stack`, `Form`). Feature code arranges them; it never reaches for raw Tailwind or one-off colors. (Per [doc 23](23-frontend-component-architecture.md) §1.)
3. **The module color is automatic — let it be.** Every surface is wrapped in `<ModuleProvider>`, which sets `--module-active`. Primary actions, card stripes, tab underlines, and stat icons all read that variable. A page should never hardcode indigo (or any hue) — if it looks indigo on a Commerce page, it's missing `variant="module"`.
4. **One primary action per header, top-right.** Actions live in the page header, right-aligned. Never below the header, never duplicated into the body, never a second competing primary.
5. **The breadcrumb is the back button.** The shell breadcrumb already provides up-navigation. The working area carries no in-content "← Back to X" link.
6. **Section navigation belongs to the shell, not the content.** Switching between a module's sections is the contextual sidebar's job (§11), not in-content tabs or a card grid. The working area is for _content_; in-content tabs are reserved for the facets of a single record (§11.1).
7. **Two widths, decided by intent.** Workspaces are wide; focused tasks are narrow (§3). No per-page max-width guessing.

---

## 3. Content Width

The shell applies no max-width; each page wraps its content in the shared `Container` (`packages/ui/src/components/layout/container.tsx`). There are exactly **two** allowed widths, chosen by whether the page is a _workspace_ (you survey and navigate) or a _focused task_ (you fill one thing out):

| Width       | `Container size` | Max    | Used by archetypes                                                              |
| ----------- | ---------------- | ------ | ------------------------------------------------------------------------------- |
| **Wide**    | `xl`             | 1280px | Module Overview, Collection/List, Record Detail, Settings Index, Module Preview |
| **Focused** | `md`             | 768px  | Create/Edit Form, single-section settings forms                                 |

`md` (768px) comfortably fits the two-column field rows seen on the deal/product forms. A form that genuinely needs three+ columns may opt up to `lg` (1024px), but that is the documented exception, not a free choice. The four ad-hoc widths in the audit (820 / 960 / 1040 / 1200) collapse to these two.

> **Record Detail vs. Form.** A _detail_ page (tabs, multiple panels, the rich edit surface for an entity like a product) is a workspace → **Wide**. A _form_ page (`/new`, a simple single-card edit) is a focused task → **Focused**. The tell: a detail page has in-content tabs and inline/auto save; a form page has one card and an explicit Save/Cancel bar.

---

## 4. The Six Archetypes

| #   | Archetype              | Route shape                               | Width   | Header actions                                  | Body                                                             |
| --- | ---------------------- | ----------------------------------------- | ------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **Module Overview**    | `/{module}`                               | Wide    | Primary create + optional secondary             | Stat grid → SectionCard grid (links to surfaces)                 |
| 2   | **Collection / List**  | `/{module}/{things}`                      | Wide    | Primary create                                  | FilterBar → DataTable (desktop) / card list (mobile) → pager     |
| 3   | **Record Detail**      | `/{module}/{things}/{id}`                 | Wide    | Status-changing secondaries (Publish, Archive…) | Tabs → section Cards                                             |
| 4   | **Create / Edit Form** | `/{module}/{things}/new`, simple edits    | Focused | — (actions in the form bar)                     | Card(s) → Form fields → action bar                               |
| 5   | **Settings Index**     | `/settings`, `/{module}/settings` (index) | Wide    | —                                               | SectionCard grid                                                 |
| 6   | **Module Preview**     | not-yet-built modules                     | Wide    | —                                               | `ModuleStub`: header + "coming online" panel + "What ships" grid |

Everything below specifies the shared pieces these archetypes are built from.

---

## 5. Page Header — `PageHeader` (to build, `@sparx/ui`)

There is no shared `PageHeader` today; every page hand-rolls `Stack + Heading + Text`, which is why the anatomy drifts. Build one component and route every archetype (1, 2, 3, 5, 6) through it.

**Anatomy (single row, baseline-aligned):**

```
[module icon] H1 Title  [count/status badge]                 [Secondary] [Primary]
subtitle paragraph (muted, one or two sentences)
```

| Slot         | Rule                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Icon**     | The module's `lucide` icon, in `--module-active`. Present on every module-scoped page; omitted only on the platform-level `/` Home and `/settings` index.                                                      |
| **Title**    | `<Heading level={1}>`. The page/entity name.                                                                                                                                                                   |
| **Badge**    | Optional. A single inline pill for a **count** ("12 products") or **status** ("Active", "Module preview"). Uses `Badge`; never colored eyebrow text, never free-floating. At most one.                         |
| **Subtitle** | Optional `<Text variant="muted">`, ≤ 2 sentences. One consistent style — not sometimes a long paragraph, sometimes a meta string. Tenant ids / "last 30 days" framing belongs in body stats, not the subtitle. |
| **Actions**  | Right-aligned. **Exactly one** primary (`Button variant="module"`); zero or more secondaries (`variant="outline"`/`"ghost"`). Empty when the archetype's actions live elsewhere (forms, previews).             |

**Forbidden:** primary actions placed below the header or left-aligned (seen on Discounts, Segments); a second `Create` button duplicated into an empty state; the in-content "← Back to X" link (seen on every `/new` and the product detail) — delete it, the breadcrumb owns up-nav.

---

## 6. Actions & Module Color

- **Primary action** = `Button variant="module"`. It reads `--module-active`, so it is orange on Commerce, cyan on CRM, teal on CMS, blue on Email — automatically. The audit found Commerce's Discounts "Create discount" and Storefront-Settings "Save settings" rendering **indigo** (the default), and the Commerce settings page showing orange channel pills next to an indigo save button. **Cause:** those buttons use the default variant instead of `variant="module"`. **Fix:** one prop.
- **Module color reference** (`packages/ui/src/tokens.css`): Storefront `#6366F1`, Commerce `#F97316`, CMS `#14B8A6`, CRM `#06B6D4`, Email `#0EA5E9`, B2B `#475569`, Dropship `#10B981`, AI `#EC4899`. Never hardcode these — reference `--module-active` via the component variant.
- **Secondary actions**: `variant="outline"` (e.g. Record-Detail "Unpublish", "Archive"). **Tertiary/utility** (Recompute, Show archived): `variant="ghost"` or a plain link, grouped with the primary in the header action slot, never as a separate left-aligned row.

---

## 7. Collection / List (Archetype 2)

**One rendering, responsive** (the locked decision): `DataTable` (`packages/ui/src/components/data/data-table.tsx`) on desktop, collapsing to a stacked card list below the `md` breakpoint. Same data, same source, one component — not "products is a table but segments is a card stack and pages is a different card."

- **Table style:** the single `Table` primitive (uppercase muted column headers, borderless rows, hover highlight). Kill the competing bordered-table style from the products page.
- **Row → detail:** the whole row is the link to the record's detail page. No per-row "Edit"/"Open" button when the row itself navigates (drop the CMS-pages "Edit" button and the segments "Open" link in favor of row-click; keep an explicit affordance only where a row has multiple distinct destinations).
- **Mobile cards:** title + key metadata + status badge per card; tapping the card navigates. This is the _only_ sanctioned card-list — it is the responsive form of the table, not a separate design choice.
- **Browse/library views** (e.g. CMS Media) are the documented exception: a thumbnail grid is appropriate where the content _is_ visual. Everything record-shaped uses the table.

### 7.1 FilterBar (to build, `@sparx/ui`)

The audit found three filter styles (labeled inputs + an "Apply" button on products; pill toggles + search + sort on customers; a lone dropdown on pages). Standardize one toolbar above the table:

```
[🔍 search ............]   [Status ▾] [Type ▾] [more filters…]            [Sort ▾]
```

- Search input left; filter dropdowns/segment-pills inline after it; sort dropdown right.
- **Live, debounced filtering — no "Apply" button.** Results update as the user types/selects (250ms debounce). Drop the products-page Apply button.
- Active filters render as removable chips below the bar when any are set.

---

## 8. Empty States — `EmptyState` (exists, `@sparx/ui`)

The audit found three treatments (an inline icon-left card on Home; a bare gray box with no CTA on Orders; a stripe-card-wrapping-a-gray-box with a _duplicated_ CTA on Discounts and Media). Use the single `EmptyState` component (`packages/ui/src/components/data/empty-state.tsx`) everywhere:

- Centered: icon-in-circle, title, **one-line** description, **one** action.
- Rendered **directly** in the content region (or as the `DataTable` zero-row fallback) — **never** double-nested (stripe Card → gray box → content).
- The action is `Button variant="module"`. It must **not** duplicate the header's primary action — if the header already has "Create discount", the empty state either has no button or a clearly distinct affordance (e.g. "Import"). A list whose header carries the create action shows a buttonless empty state.
- The bare-gray-box-with-no-CTA (Orders) gains a CTA; the indigo CTA (Discounts) becomes `variant="module"`.

---

## 9. Stat Cards — `Stat` + `Grid` (exists, `@sparx/ui`)

Three KPI surfaces today (4 bordered cards on Home; 4 gray cards 2×2 on Commerce; 6 inline metrics in one card on Email). Standardize on the `Stat` component (`packages/ui/src/components/data/stat.tsx`: label + value + optional delta + module-tinted icon) laid out in a `Grid`:

- One surface treatment (the `Stat` card), one icon style (module-tinted), deltas rendered consistently.
- Grid columns: up to 4 across on wide, responsive down to 1. Overview pages use this grid as the first body block.
- Retire the gray-card and the single-card-with-inline-metrics variants.

---

## 10. Section / Nav-Card Grid — `Card variant="module"` + `Grid`

Five variants in the audit (Home "Active modules", Commerce "Manage", Email "Surfaces", Settings, B2B "What ships") differing on columns, top-stripe, and whether the whole card or a button navigates. One pattern:

- `Card variant="module"` (the 3px `--module-active` top stripe, `card.tsx:11`) in a responsive `Grid` (3-col wide → 1-col mobile).
- Card content: icon + title + one-line description + optional status/"Soon" badge.
- **Whole card is the link.** No "Open" button/link in the corner (drop the Settings "Open" and Email "Open X" buttons); a disabled/"Soon" card is non-interactive with a muted badge.
- **This grid is a _launchpad_, not navigation chrome.** It appears on the Module Overview (§12) and the Settings Index (§4) as a rich, described entry point — never as the _only_ way to reach a section (the contextual sidebar in §11 is the persistent nav). The B2B/AI/Dropship "What ships" grid is the same component with a "Planned" badge.

---

## 11. Intra-Module Navigation — the contextual sidebar (rail + panel)

The audit found a module's child sections navigated three different ways: an in-content **tab strip** (CMS 8, CRM 9, Email 7 tabs), a **card grid** used as the only nav (Commerce "Manage", 10 cards), and per-row/per-card **buttons** ("Open"/"Edit"). A horizontal tab strip breaks down past ~5–6 items — which is exactly why Commerce abandoned tabs for cards. None of these is the answer.

**Decision (locked):** intra-module navigation is a **rail + contextual panel**, owned by the shell ([doc 24](24-dashboard-shell.md) §5). The primary sidebar is a thin **icon rail** (Search/⌘K, Home, ★ Favorites, ⏱ Recents, module icons with the active one in `--module-active`, Settings pinned bottom). Beside it sits a **contextual panel** whose contents follow context: **inside a module → that module's sections** (from the manifest), **at platform level (Home / Settings) → Favorites + Recents**. A vertical list scales to 10+ sections where tabs cannot, and it collapses on mobile into the breadcrumb bottom-sheet's "\<Module\> pages" group that [doc 24](24-dashboard-shell.md) §4.2.1 already defines — so desktop and mobile become the same model.

**Consequences for the working area:**

- **No module-section tab strip.** Remove the in-content tabs from CMS, CRM, and Email landings/sub-pages — section switching is the contextual panel's job.
- **No card-grid-as-nav.** The Commerce "Manage" grid stops being the only path to sections; it survives only as the Overview launchpad (§10/§12).
- **No per-row/per-card nav buttons** beyond the row-click rule in §7.

### 11.1 Tabs survive — but only for record facets

In-content tabs (`Tabs variant="default"`, underline in `--module-active`, `tabs.tsx:55`) remain the right tool for the **facets of a single record** — a product's Overview / Variants / Media / Pricing / Inventory / Fitment / SEO. These are sub-views of _one entity_, not module navigation, so they belong in the working area, not the sidebar.

- Use `variant="default"`.
- **Drop the redundant "active" text label** — the underline already communicates selection.
- Record facets only. If you reach for tabs to switch between things that have their own routes/sections, that's the contextual sidebar's job, not tabs.

---

## 12. Module Overview (Archetype 1) — the locked model

**Decision:** every module root (`/commerce`, `/crm`, `/cms`, `/email`, …) is an **overview dashboard**, not a jump-straight-to-a-list. Today Commerce/Email are overview-shaped while CRM/CMS drop you directly into a list under sub-tabs — this unifies them.

**Composition (top to bottom):**

1. `PageHeader` — module icon + name + primary create action (e.g. "New product").
2. **Stat grid** (§9) — the module's headline KPIs.
3. **SectionCard launchpad** (§10) — one card per surface the module owns (Products, Pricing, Discounts…), each a rich, described entry point. This is a _launchpad_, not the nav: the persistent way to jump between sections is the contextual sidebar (§11). Surface lists live at `/{module}/{surface}`.

**Migration notes:**

- **Commerce / Email**: already overview-shaped. Normalize the stat surface (§9), the section launchpad (§10), fix the indigo buttons (§6), and drop Email's in-content section tabs in favor of the contextual sidebar (§11).
- **CRM / CMS**: today the root _is_ the Customers / Pages list with a section tab strip. Introduce an overview root; the existing list becomes `/crm/customers` and `/cms/pages` (Collection archetype). The section **tab strip is removed** — section switching moves to the contextual sidebar (§11) — and the landing becomes the overview.

---

## 13. Create / Edit Form (Archetype 4)

The three create forms diverged (multi-section vs. single card; in-card footer vs. none; asterisk on one only; back-link sometimes centered, sometimes left). Standard scaffold:

```
Container size="md"
  PageHeader (title + subtitle; NO back link)        ← breadcrumb owns up-nav
  Card  (one, or one per logical section)
    Form fields (FormItem / FormLabel / FormControl / FormDescription / FormMessage)
  FormActionBar  →  [Cancel (ghost)]  [Save (variant="module")]   (right-aligned)
```

- **Action bar** (to build as a small `FormActionBar`, or a consistent `CardFooter` composition): right-aligned, `Cancel` ghost + primary `Save`/`Create X` in `variant="module"`. One placement everywhere — not "sometimes in the card footer, sometimes who-knows-where."
- **Required fields** marked with a red asterisk via `FormLabel` (the CMS form already does this; make it universal).
- **Help text** via `FormDescription` (muted, below the field) — one style; no orange help text on one page and gray on another.
- **No in-content back link.** Delete the centered "← Back to products / pipelines / pages" links.
- A form with multiple logical groups uses multiple `Card`s (like product "Basics / Organization / Shipping"); a simple form uses one. Both share the single action bar at the bottom.

---

## 14. Module Preview (Archetype 6) — already compliant

The not-yet-built modules (B2B, AI, Dropship) already share one template via `apps/dashboard/components/module-stub.tsx`: `PageHeader` (icon + name + "Module preview" badge) → a "coming online" panel → a "What ships in this module" SectionCard grid with "Planned" badges. **This is the reference for getting an archetype right** — it's the one part of the app that's already consistent across three modules. No change needed beyond having it consume the shared `PageHeader` (§5) once that lands.

---

## 15. Components: build vs. reuse

| Need                        | Status   | Location                                                             |
| --------------------------- | -------- | -------------------------------------------------------------------- |
| `Container` (widths)        | ✅ reuse | `packages/ui/src/components/layout/container.tsx`                    |
| `Card` + `variant="module"` | ✅ reuse | `packages/ui/src/components/layout/card.tsx`                         |
| `Stat` (KPI card)           | ✅ reuse | `packages/ui/src/components/data/stat.tsx`                           |
| `DataTable` / `Table`       | ✅ reuse | `packages/ui/src/components/data/{data-table,table}.tsx`             |
| `EmptyState`                | ✅ reuse | `packages/ui/src/components/data/empty-state.tsx`                    |
| `Tabs variant="default"`    | ✅ reuse | `packages/ui/src/components/navigation/tabs.tsx`                     |
| `Grid` / `Stack`            | ✅ reuse | `packages/ui/src/components/layout/{grid,stack}.tsx`                 |
| `Form*` primitives          | ✅ reuse | `packages/ui/src/components/form/form.tsx`                           |
| `ModuleStub` (preview)      | ✅ reuse | `apps/dashboard/components/module-stub.tsx`                          |
| **`PageHeader`**            | ✅ built | `packages/ui/src/components/layout/page-header.tsx` — the §5 anatomy |
| **`FilterBar`**             | ✅ built | `packages/ui/src/components/data/filter-bar.tsx` — the §7.1 toolbar  |
| **`FormActionBar`**         | ✅ built | `packages/ui/src/components/form/form-action-bar.tsx` — the §13 bar  |

Three small new shared components (built 2026-05-31 — all pure layout containers; actions/filters are slots, so they're decoupled from the Button API) + targeted prop fixes (mostly `variant="module"`) cover the entire standard. No primitive needs restyling.

---

## 16. Per-page compliance snapshot (from the 2026-05-31 audit)

| Page                       | Archetype           | Primary gaps to fix                                                                                                                   |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (Home)                 | Overview (platform) | Stat surface vs. §9; section cards vs. §10                                                                                            |
| `/commerce`                | Overview            | Stat surface, section-card style, button color                                                                                        |
| `/crm`                     | Overview            | Currently a list w/ section tabs; introduce overview, move list to `/crm/customers`, **drop section tabs** → contextual sidebar (§11) |
| `/cms`                     | Overview            | Currently Pages list w/ section tabs; introduce overview, move to `/cms/pages`, **drop section tabs** → contextual sidebar (§11)      |
| `/email`                   | Overview            | Normalize stat/section blocks; drop "Open X" buttons; **drop section tabs** → contextual sidebar (§11)                                |
| `/commerce/products`       | List                | Bordered table → standard table; FilterBar (drop Apply); header per §5                                                                |
| `/crm` (customers)         | List                | Header anatomy; FilterBar; row-click nav                                                                                              |
| `/crm/orders`              | List                | Empty state needs CTA (§8)                                                                                                            |
| `/commerce/discounts`      | List                | **Indigo→module button**; action top-right not below; empty state un-nested, single CTA                                               |
| `/crm/segments`            | List                | Card-stack → responsive table; actions into header (not left row)                                                                     |
| `/cms` (pages)             | List                | Card → responsive table; drop per-row Edit button                                                                                     |
| `/cms/media`               | List (library)      | Acceptable thumbnail-grid exception; header per §5                                                                                    |
| `/commerce/products/[id]`  | Detail              | Remove back link; tabs drop "active" label                                                                                            |
| `/commerce/products/new`   | Form                | Remove centered back link; single action bar; width `md`                                                                              |
| `/crm/deals/new`           | Form                | Remove back link; required asterisks; width `md`                                                                                      |
| `/cms/new`                 | Form                | Remove back link (keep its good asterisk + footer)                                                                                    |
| `/settings`                | Settings Index      | Section cards drop "Open" link (whole-card click)                                                                                     |
| `/commerce/settings`       | Form                | **Indigo→module save button**; action bar per §13                                                                                     |
| `/b2b`, `/ai`, `/dropship` | Preview             | ✅ compliant (reference template)                                                                                                     |

---

## 17. Rollout

1. **Build the three new primitives** (`PageHeader`, `FilterBar`, `FormActionBar`) in `@sparx/ui` with the specs above. Ship behind nothing — they're additive.
2. **Sweep by archetype, not by module** — fix all Forms, then all Lists, then all Overviews. Same-archetype pages share the same diff, so batching by archetype is faster and keeps the standard honest.
3. **Quick wins first:** the Commerce `variant="module"` button fixes (§6) and the back-link deletions (§5/§13) are one-line changes with immediate visible payoff — do them in the first pass.
4. Each archetype's compliance is verifiable live with the same Playwright capture used for the audit; re-shoot the working area and diff against this doc.

---

## 18. Related

- [23-frontend-component-architecture.md](23-frontend-component-architecture.md) — the primitives, CVA pattern, token rules this doc composes.
- [24-dashboard-shell.md](24-dashboard-shell.md) — the chrome around the working area.
- [18-frontend-architecture.md](18-frontend-architecture.md) — app-level architecture.
- [sparx-brand-guide.md](sparx-brand-guide.md) — module colors, the wordmark, the 3px stripe.
