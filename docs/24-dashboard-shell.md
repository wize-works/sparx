# Sparx Platform — Dashboard Shell

**Version:** 1.3
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

> **1.3 (2026-05-31):** Implementation refinements to §5. The rail is **collapsible** (persisted icon-only ↔ icon+label toggle), and **Favorites + Recents live in the rail** (inline groups), not the panel — so the contextual panel is purely the current module's sections, and at platform level shows a labeled directory of the enabled modules.
>
> **1.2 (2026-05-31):** Sidebar moves to a **rail + contextual panel** model (§5) — a thin icon rail (modules, Home, Settings, search, Favorites/Recents) plus a contextual panel whose contents follow context: a module's sections when inside one. This makes intra-module navigation a shell concern, so the working area drops its in-content section tabs and card-grid-as-nav (see [doc 34](34-dashboard-working-area-standard.md) §11).

---

## 1. Purpose

This document defines the **shell** that wraps every authenticated surface in `app.sparx.works`: the header, the sidebar, the command palette (⌘K), the theme system, and the contract that lets every module plug entities and actions into all of the above.

The shell is the chrome around module work. It is not optional, not module-specific, and not negotiable per module — every module composes into the same shell. Modules export _manifests_; the shell renders them.

Related: [18-frontend-architecture.md](18-frontend-architecture.md), [23-frontend-component-architecture.md](23-frontend-component-architecture.md), [05-data-model.md](05-data-model.md), [16-auth-security.md](16-auth-security.md).

---

## 2. Core Principles

1. **One shell, many modules.** Every module renders inside the same `<DashboardShell>`. Modules never own header or sidebar chrome.
2. **Manifests, not props.** Modules contribute to the shell by exporting a static `ModuleManifest`. The shell composes manifests; it does not enumerate modules.
3. **Generic over specific.** Favorites, recents, and ⌘K target _generic locations and actions_ ("Create order", "All open orders") — not specific instances ("Order #1234"). Entity-instance pinning is explicitly out of scope.
4. **Server is source of truth for cross-device state.** Favorites and recents live in Postgres, keyed on `tenant_membership_id`. Theme is device-local.
5. **Module color shifts automatically.** When the shell renders a module's surface, it wraps the content in `<ModuleProvider module="commerce">`. All header chrome that references `--module-active` picks up the active module's accent color.
6. **API-first.** Favorites, recents, and the entity registry all have REST endpoints. The dashboard is one consumer; MCP is another; future mobile is a third.

---

## 3. The Entity Manifest

Every module exports a single static manifest from its package barrel. The shell reads manifests at build time; there is no dynamic registry, no plugin loader, no runtime mutation.

### 3.1 Shape

```ts
// packages/commerce/src/manifest.ts
import type { ModuleManifest } from '@sparx/ui/shell';
import { Package, Tag, Percent, ShoppingCart, PackagePlus } from 'lucide-react';

export const commerceManifest: ModuleManifest = {
  // Matches the SparxModule union from @sparx/ui; drives the accent color
  // automatically via ModuleProvider — no separate `color` field needed.
  id: 'commerce',
  label: 'Commerce',
  icon: ShoppingCart,
  // URL prefix this module owns. Usually `/${id}`; explicit because not all
  // module ids match their dashboard route (Storefront → /sitebuilder).
  routePrefix: '/commerce',

  // Sections the module owns. Rendered as the contextual panel's section list
  // when the module is active (§5) and in the breadcrumb section switcher.
  sections: [
    { id: 'products', label: 'Products', icon: Package, href: '/commerce/products' },
    { id: 'pricing', label: 'Pricing', icon: Tag, href: '/commerce/pricing' },
    { id: 'discounts', label: 'Discounts', icon: Percent, href: '/commerce/discounts' },
  ],

  // Generic, parameterless actions invocable from ⌘K, favorites, or the `+` button.
  // Instance actions ("delete this order") live on the entity, not here.
  actions: [
    {
      id: 'commerce.product.create',
      label: 'Create product',
      icon: PackagePlus,
      href: '/commerce/products/new',
    },
  ],

  // Entity types this module owns. Used by detail-page chrome to render the
  // entity-type label in the `...` menu and to scope context-aware actions.
  entityTypes: [{ id: 'product', label: 'Product', routePrefix: '/commerce/products' }],
};
```

### 3.2 Aggregation

The shell composes manifests in `apps/dashboard/app/(dashboard)/_shell/registry.ts`:

```ts
// Modules with their own packages (Commerce, CRM, CMS) export from there.
import { commerceManifest } from '@sparx/commerce';
import { crmManifest } from '@sparx/crm';
import { cmsManifest } from '@sparx/cms-editor';

// Modules without packages yet stub their manifest co-located with their
// dashboard pages. When the module's package exists, the manifest migrates
// into it and this import flips to '@sparx/<module>' — a one-line change.
import { sitebuilderManifest } from '../sitebuilder/manifest';
import { emailManifest } from '../email/manifest';
import { b2bManifest } from '../b2b/manifest';
import { dropshipManifest } from '../dropship/manifest';
import { aiManifest } from '../ai/manifest';

export const moduleManifests = [
  commerceManifest,
  crmManifest,
  cmsManifest,
  sitebuilderManifest,
  emailManifest,
  b2bManifest,
  dropshipManifest,
  aiManifest,
] as const;
```

**Manifest home policy**: every module's manifest belongs in its package (`packages/<module>/src/manifest.ts`). For modules whose package does not yet exist, the manifest temporarily lives at `apps/dashboard/app/(dashboard)/<module>/manifest.ts` with a `// TODO: migrate to packages/<module>/src/manifest.ts when that package exists` comment. Migration is mechanical: move the file, flip the import line in the registry.

Manifests for inactive modules are still imported (tree-shaking-friendly because they're plain objects) but are filtered against the tenant's active-module set before render. A disabled module's sections and actions never appear in the sidebar, ⌘K, or favorites — even if a user previously favorited one.

A special, non-manifest **Home** item lives on the rail (above the module icons) and heads the contextual panel's module directory at the platform level. It is not a module, has no color, and is hardcoded in the shell.

### 3.3 Action ID Stability

`action.id` is the durable key. Favorites and recents store it. Renaming an action's `label` is safe; changing its `id` is a breaking change that orphans favorites. Treat action IDs like database column names.

---

## 4. Header

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [Tenant ▾] / [Module ▾] / [Section ▾] / [Page]      [⏱ Last edited] [⋯] [★] [🌓] │
└──────────────────────────────────────────────────────────────────────────────────┘
   ←─────── breadcrumbs ───────→                       ←───── controls ─────→
```

**Left**: Breadcrumb trail rooted at the tenant. Always-visible: first (Tenant) and last (current Page) segments. Middle segments collapse to `…` with a popover when the container narrows (see §4.4).

**Right**: Page-level controls. Order (right to left): theme toggle, star, `...` menu, last-activity button. The button order is fixed; controls hide individually when not applicable to the current surface (e.g. star is hidden on routes that don't resolve to a manifest action).

### 4.2 Breadcrumb Behaviors

The first segment is the **Workspace** (the user-facing name for the tenant; see
[docs/32](32-workspace-switching-breadcrumb.md)). The breadcrumb is the merchant's
primary "where am I / take me elsewhere" control, so the two leftmost segments are
_switchers_, not just links.

| Segment                    | Click behavior                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace (root)           | Menu: workspace settings + sign out today. Switch-to-another-workspace, create-workspace, members/invite land in [docs/32](32-workspace-switching-breadcrumb.md) Phase 2+ (needs the org plugin).                                                                         |
| Module                     | **Split control.** The label is a link to the module home; an adjacent `▾` opens a switcher listing the _other modules the tenant has enabled_ (active one checked + accent-colored). Sections are reached via the sidebar and segment 3 — they are **not** in this menu. |
| Section                    | Navigate-only link.                                                                                                                                                                                                                                                       |
| Page (rightmost / current) | Plain text (non-interactive). Inline rename for renamable entities is a future enhancement.                                                                                                                                                                               |

Only **enabled** modules appear in the Module switcher (and the sidebar Modules
section) — filtered against the tenant's active-module set via
`listEnabledModules()` in `@sparx/auth`.

Each non-current segment shows a chevron divider on its right.

#### 4.2.1 Mobile

Below `md`, the multi-segment inline trail is replaced by a single **context chip**
(module-color dot + current module/page name + `▾`). Tapping it opens a **bottom
sheet** with grouped, full-width touch rows: **Workspace** (name + settings + sign
out), **Modules** (enabled set, active checked), and **\<Module\> pages** (the
current module's sections). Desktop and mobile render are toggled by Tailwind `md:`
visibility (both in the DOM) so there is no first-paint flash from a post-mount
media-query resolve.

### 4.3 Module Color Cue

The Module segment in the breadcrumb renders with the module accent color (`--module-active`, set by the surrounding `<ModuleProvider>`). This is the _only_ segment that colors; tenant and section segments stay neutral. Rationale: one color cue is informative; three is noisy.

### 4.4 Responsive Collapse

The breadcrumb uses a `ResizeObserver` on its container. When total rendered width exceeds available width:

1. Hide the middle segment(s), in order: oldest-middle first (i.e. the one closest to Module).
2. Render a `…` chip in their place.
3. Clicking `…` opens a popover that lists every hidden segment, each navigable.
4. First (Tenant) and last (Page) segments **never** collapse.

Implementation lives in `<Breadcrumb>` inside `@sparx/ui`; feature code never measures.

### 4.5 The Controls

| Control                    | Visible when                                                          | Behavior                                                                                                            |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Last-activity button**   | Surface has a `last_modified_at` (most detail pages and dashboards)   | Opens history popover. Label: relative ("Edited 3 days ago") with absolute on hover.                                |
| **`...` Actions menu**     | Always                                                                | Context-scoped command palette. See §4.6.                                                                           |
| **Star (favorite toggle)** | Current route resolves to a manifest action (i.e. a generic location) | Toggles `user_favorites` row for `(membership_id, action_id)`. Filled when favorited.                               |
| **Theme toggle**           | Always                                                                | Cycles light → dark. Persists to `localStorage`. Initial value seeded from server preference on first device login. |

Deliberately _not_ in Phase 1: Share button (no real-time sharing model yet), Copy link (deferred — `...` menu carries it), collaborators avatar stack (no presence system yet).

### 4.6 The `...` Actions Menu

It is a **searchable, grouped command list** — not a dropdown. The button reveals a context-scoped command palette so power users never need to memorize where a given action lives.

```
┌─ Search actions… ─────────────────────────────┐
│ [combobox, autofocused]                        │
├────────────────────────────────────────────────┤
│ Universal page actions                         │
│   Copy link                            Ctrl+L  │
│   Duplicate                                 ▸  │
│   Move to                              Ctrl+M  │
│   Move to Trash                                │
├────────────────────────────────────────────────┤
│ Entity-specific (from manifest)                │
│   Export as CSV                                │
│   Import…                                      │
│   Lock                                  [ ◯ ]  │
├────────────────────────────────────────────────┤
│ Metadata                                       │
│   Activity & analytics                         │
│   Version history                              │
├────────────────────────────────────────────────┤
│ Notifications                                  │
│   Notify me                          ▸ Comments│
├────────────────────────────────────────────────┤
│ Last edited by Brandon Korous                  │
│ 2026-05-29 13:42                               │
│ Help: Orders ↗                                 │
└────────────────────────────────────────────────┘
```

Universal actions are baked into `<ActionsMenu>` inside `@sparx/ui`. Entity-specific actions come from the entity's manifest entry. Footer (last-edited + help link) reads from the page's `<EntityShell>` context.

Supported affordances:

- Right-aligned **keyboard shortcut** text per item.
- Right-aligned **status text** (e.g. "Comments" on Notify me) before any submenu arrow.
- Right-aligned **inline switch** for boolean toggles.
- Trailing `▸` for submenus (lazy-rendered).

---

## 5. Sidebar

### 5.1 Layout — rail + contextual panel

The sidebar is two columns: a constant **icon rail** and a **contextual panel** whose contents follow where you are. The rail answers "which module"; the panel answers "which section" (inside a module) or surfaces cross-module shortcuts (at the platform level). One mechanism, always present, scaling to modules with 10+ sections where a horizontal tab strip cannot.

```
┌────┬───────────────────────┐
│ 🔍 │  COMMERCE             │  ← panel header: active module (module-color)
│ ⌂  │  Products             │
│ ★  │  Pricing              │  ← contextual panel:
│ ⏱  │  Discounts            │     the active module's sections
│────│  Subscriptions        │     (from its manifest), active one
│ ▣  │  Shipping             │     highlighted in --module-active
│ ▣▸ │  Returns & RMA        │
│ ▣  │  Reviews & Q&A        │
│ ▣  │  Providers            │
│ ▣  │  Configurator         │
│ …  │                       │
│────│                       │
│ ⚙  │                       │  ← Settings pinned to rail bottom
└────┴───────────────────────┘
  rail        contextual panel
```

**The rail** (top → bottom): brand mark, Search (⌘K), Home, a divider, then a scrollable middle holding one icon per **enabled** module (active module tinted `--module-active`) followed by the **★ Favorites** and **⏱ Recents** groups, and Settings pinned at the bottom. The rail is the home for the cross-module shortcuts — they ride here so the contextual panel stays purely about the current module. The rail never changes between routes.

The rail is **collapsible**: a persisted toggle at its foot (`sparx:rail-expanded`, published via `useRailExpanded()`) widens it from icon-only (`w-14`) to icon + label (`w-52`). Collapsed, Favorites/Recents render as their item icons under a quiet ★/⏱ group marker (hover gives the label); expanded, each group gains a text heading and every tile a label. Empty groups are omitted.

**The contextual panel** changes contents by context — it is _not_ a mode flip, just different data:

| Context                                      | Panel shows                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Inside a module (`/commerce/*`, `/crm/*`, …) | That module's `sections` from its manifest, active section highlighted. Header = module name in module color.              |
| Platform level (`/`, `/settings`)            | A **labeled directory** of the tenant's enabled modules (Home + module names), since there's no module context to fill it. |

Favorites and Recents stay reachable everywhere because they live in the rail (and via ⌘K), while the panel gives focused, vertical section navigation the moment you enter a module. The **tenant/workspace switcher** moves entirely to the breadcrumb's Workspace segment (§4.2) and the rail's account control — it is no longer a sidebar header.

### 5.2 Section Behaviors

| Element             | Source                                                | Mutability                                                                                                                               |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Search (rail)       | n/a                                                   | Opens ⌘K                                                                                                                                 |
| Home (rail)         | Static                                                | Navigate to platform dashboard                                                                                                           |
| Favorites (rail ★)  | `user_favorites` table                                | Inline rail group (icons collapsed / labeled when the rail is expanded); add via star or right-click                                     |
| Recents (rail ⏱)    | `user_recents` table                                  | Inline rail group; mutated optimistically by navigation; chronological                                                                   |
| Module icons (rail) | `moduleManifests` filtered by tenant's active modules | Read-only; activate new modules via Settings → Modules                                                                                   |
| Contextual panel    | active module's manifest `sections`                   | Read-only navigation; the single intra-module nav surface (no in-content tabs — see [doc 34](34-dashboard-working-area-standard.md) §11) |
| Settings (rail ⚙)   | Static                                                | Pinned to rail bottom                                                                                                                    |

### 5.3 No Top-Tab Strip

Sparx has **no top tab strip** above the search button. Rationale:

- App-mode tabs (Inbox, Activity, Home dashboard) compete with the `Tenant > Module` breadcrumb in the header, which already does spatial-orientation work.
- Cross-module surfaces (notifications, account-wide activity) belong in the bottom utility row or as a dedicated Module — not as a separate top-level switcher.

If a future "Inbox" or "Notifications" surface lands, it goes in the bottom utility row, not as a sidebar tab.

### 5.4 Right-Click Context Menu

Right-clicking any item in Favorites, Recents, or Modules opens a small contextual menu:

```
┌────────────────────────┐
│ Order                  │ ← entity-type label from manifest
│ ★ Add to Favorites    │ ← if not already starred; else "Remove from Favorites"
├────────────────────────┤
│ Copy link              │
│ Open in new tab        │
└────────────────────────┘
```

Entity-type label uses the module's `entityTypes[].label`, falling back to the manifest's section label, falling back to "Page."

### 5.5 Resize

The sidebar has a drag handle on its right edge (between sidebar and main). Min width 240px, max width 480px, default 280px. Persisted per device in `localStorage`.

---

## 6. ⌘K Layered Search

Two modes, one entrypoint:

### 6.1 Quick Mode (default)

Opens on `⌘K` / `Ctrl+K`. Results are ranked across:

1. **Manifest actions** matching the query (e.g. "create order")
2. **Sections** matching the query (e.g. "products")
3. **Recents** matching the query
4. **Favorites** matching the query

Quick Mode never hits the full-text entity index. Latency target: <100ms first paint, <50ms keystroke-to-result.

### 6.2 Deep Mode

Toggled inside the same dialog via a filter chip or `Tab` keypress. Adds:

5. **Entity full-text search** scoped to current tenant — orders by ID/customer/notes, products by name/SKU, customers by name/email, pages by title/body, etc.

Deep mode hits `pg_trgm` (Phase 1, per `docs/22-typesense-search-spec.md` — Typesense lands later). Latency target: <300ms.

### 6.3 Filters (Deep Mode)

A filter chip row appears below the combobox: scope by module, by entity type, by author, by date range. Filters apply to deep mode results only; quick-mode items are unfiltered (they're nav, not entities).

### 6.4 AI Q&A

Deferred to Phase 2. Until MCP-integrated answering is ready, the combobox is a pure search surface — the placeholder reads "Search…" and there is no AI affordance in the dialog.

---

## 7. Theme

| Property       | Value                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Modes          | `light` (default), `dark`                                                                                                          |
| Storage        | `localStorage['sparx:theme']`                                                                                                      |
| Initial seed   | First login on a device: server preference (`user.preferred_theme`). Subsequent loads: device value.                               |
| Implementation | Toggles `data-theme="dark"` on `<html>`; CSS custom properties in `packages/ui/src/tokens.css` are scoped on `[data-theme="dark"]` |
| Module colors  | Light/dark token pairs already defined; module accent shifts intensity, not hue                                                    |

No system-pref auto-follow. Rationale: explicit, predictable, and avoids the "phone-in-sun unreadable dark theme" failure mode that motivated per-device persistence.

---

## 8. Data Model

### 8.1 `user_favorites`

```sql
CREATE TABLE user_favorites (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_membership_id    UUID NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  action_id               TEXT NOT NULL,         -- matches ModuleManifest action.id
  position                INTEGER NOT NULL,      -- user-set order within favorites list
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_membership_id, action_id)
);

CREATE INDEX user_favorites_membership_position
  ON user_favorites (tenant_membership_id, position);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites FORCE ROW LEVEL SECURITY;

CREATE POLICY favorites_isolation ON user_favorites
  USING (tenant_membership_id IN (
    SELECT id FROM tenant_memberships WHERE tenant_id = current_tenant_id()
  ));
```

**Notes:**

- Keyed on `tenant_membership_id`, not `user_id`. A user with memberships in multiple tenants has separate favorites per tenant.
- `action_id` is a free-form text matching the manifest. No FK — manifests are code, not data. If a module is removed, orphaned favorites become unrenderable and are filtered out client-side.
- `position` is user-set (drag-to-reorder); inserts default to `MAX(position)+1` for the membership.

### 8.2 `user_recents`

```sql
CREATE TABLE user_recents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_membership_id    UUID NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  action_id               TEXT NOT NULL,
  last_visited_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_membership_id, action_id)
);

CREATE INDEX user_recents_membership_recency
  ON user_recents (tenant_membership_id, last_visited_at DESC);

ALTER TABLE user_recents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recents FORCE ROW LEVEL SECURITY;

CREATE POLICY recents_isolation ON user_recents
  USING (tenant_membership_id IN (
    SELECT id FROM tenant_memberships WHERE tenant_id = current_tenant_id()
  ));
```

**Upsert pattern** (called by middleware on every navigation to a manifest-matched route):

```sql
INSERT INTO user_recents (tenant_membership_id, action_id, last_visited_at)
VALUES ($1, $2, now())
ON CONFLICT (tenant_membership_id, action_id)
DO UPDATE SET last_visited_at = EXCLUDED.last_visited_at;
```

**Capping** is read-side: query `ORDER BY last_visited_at DESC LIMIT 20`. We don't trim the table aggressively — a periodic job (weekly) deletes rows older than 90 days or beyond position 100.

### 8.3 RLS Pattern

Per [CLAUDE.md](../CLAUDE.md) and `feedback_sparx_db_rls_pattern.md`: Prisma does not generate RLS. Hand-edit the migration SQL to add `ENABLE` + `FORCE` + the isolation policy. Both tables are tenant-scoped, so both get `FORCE`. (Compare: auth tables which are `ENABLE` only, not `FORCE`.)

### 8.4 No Per-Tenant Schema Coupling

Neither table holds data that belongs to any module. They live in the platform schema. Removing the Commerce module from a tenant leaves Commerce favorites in the table; the dashboard filters them out at render. This keeps the shell decoupled from module lifecycle.

---

## 9. API Surface

| Endpoint                                 | Purpose                                                      |
| ---------------------------------------- | ------------------------------------------------------------ |
| `GET /api/shell/manifests`               | Returns module manifests filtered by tenant's active modules |
| `GET /api/shell/favorites`               | List current membership's favorites, ordered by `position`   |
| `POST /api/shell/favorites`              | `{ action_id }` — add, returns row                           |
| `PATCH /api/shell/favorites/reorder`     | `{ ordered_ids: [...] }` — bulk position update              |
| `DELETE /api/shell/favorites/:action_id` | Remove                                                       |
| `GET /api/shell/recents`                 | Top 20 recents by `last_visited_at DESC`                     |
| `POST /api/shell/recents/visit`          | `{ action_id }` — upsert with `now()`                        |
| `DELETE /api/shell/recents`              | Clear all recents for current membership                     |

All endpoints are tenant-scoped via Better Auth org context + RLS. The shell consumes them via TanStack Query with optimistic updates for star toggles and drag-to-reorder.

---

## 10. Open Items (Deferred)

Tracked for Phase 2+:

- **Drag-to-reorder favorites** across module boundaries (Phase 1 supports reorder within Favorites; cross-section drag is out of scope).
- **⌘K Deep Mode** — entity full-text search via the existing `@sparx/search` `palette()` function (Typesense-backed). Quick Mode ships in Phase 1; Deep Mode lands when Typesense is reachable from the dashboard runtime.
- **Sidebar drag-to-resize** — persisted per-device width with a drag handle on the sidebar's right edge. Defers until a `<ResizableSidebar>` primitive lands in `@sparx/ui` (avoiding shell-side className hacks).
- **Side peek** — an `Alt+Click` modifier to open an entity in a right-hand pane without leaving the current page. Useful for browsing related entities; not Phase 1.
- **Custom favorite labels** — currently the label is the manifest action label; eventually let users rename their own favorites ("Create order" → "New PO").
- **Folder grouping in favorites** — nested hierarchies inside the Favorites section; Phase 1 keeps it flat.
- **AI Q&A in ⌘K** — deferred until MCP query layer is ready.
- **Presence in header** (collaborator avatars) — deferred until a presence/realtime service exists.
- **Share button** — deferred until per-entity sharing semantics are designed (different per module).
- **Mobile shell** — this doc describes the desktop shell only. Mobile gets its own pass.

---

## 11. Implementation Order

Suggested build slices, each independently shippable:

1. **Manifest types + an empty `<DashboardShell>`** — type defs in `@sparx/ui/shell`, an empty shell in `apps/dashboard` that renders a hardcoded breadcrumb and a placeholder sidebar. Verifies the manifest contract compiles.
2. **Static header** — breadcrumb (no popovers yet), star (no persistence), theme toggle (working).
3. **Static sidebar** — tenant switcher button, modules list from manifest, no favorites/recents yet.
4. **Tables + API** — `user_favorites`, `user_recents`, the 7 endpoints, RLS migration.
5. **Wire favorites + recents** — star toggle persists, sidebar sections render server data, navigation upserts recents.
6. **Breadcrumb popovers** — clicking a segment opens its children popover.
7. **`...` Actions menu** — searchable, grouped, with universal actions and manifest-driven entity actions.
8. **⌘K Quick Mode** — manifest + favorites + recents search.
9. **Right-click context menu** — sidebar items get the contextual menu from §5.4.
10. **Responsive breadcrumb collapse** — ResizeObserver + `…` popover.
11. **Sidebar resize handle** — drag to resize, persist to localStorage.
12. **⌘K Deep Mode** — entity full-text via `pg_trgm`.

Slices 1–3 are pure UI; ship in a single PR. Slice 4 is the first DB change (and the first migration to exercise the `user_favorites` / `user_recents` RLS pattern). 5 onward delivers user-visible value.
