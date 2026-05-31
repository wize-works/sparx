# Token Model v2

**Version:** 1.1
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Purpose & scope

The storefront's design-token model is thin: **11 flat tokens**, one radius knob, no
spacing scale, hardcoded shadows, and status colors that merchants can't touch. It was
enough to ship Site Builder Phase 1, but it can't express a real design system and it
would force us to build the Phase 2 theme inspector twice — once on the throwaway model,
again after expanding it.

This document is the **Token Model v2 contract**. It defines a richer, semantic token
vocabulary (DaisyUI-parity color palette + a real shape/rhythm/effect layer), the
hex-stored / CSS-derived color strategy, the JSON storage model, and the read-path and
migration changes required to land it. It is built **before** Site Builder Phase 2 (the
unified editor) so the inspector is built once, against the settled model.

It **extends** [docs/30-sitebuilder-redesign.md](30-sitebuilder-redesign.md) §6 (brand as
tenant-level source of truth) — v2 widens what "brand" owns from color+type to also include
**shape and rhythm** — and supersedes the token surface described in
[docs/29-sitebuilder-architecture.md](29-sitebuilder-architecture.md). Where they disagree,
this doc wins and the older doc is amended in the phase that lands the change.

### Decisions locked (2026-05-30)

| #   | Decision                       | Choice                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Color space & storage**      | **Store hex, derive in CSS.** Merchants keep hex pickers (no input-UX change, no value migration). `-content` pairs, hover shades and tints are generated at render via CSS `color-mix` in OKLCH space.                                                                                                                                                   |
| 2   | **Palette breadth**            | **Full DaisyUI parity.** `base-100/200/300`, `primary`, `secondary`, `accent`, `neutral`, `info`, `success`, `warning`, `danger`, each with a `-content` pair. All base color slots merchant-editable; `-content` pairs auto-derived by default, overridable as an escape hatch.                                                                          |
| 3   | **Storage model**              | **JSON only, drop fallback.** Full token set lives in JSONB; the 3 legacy `StorefrontTheme` columns (`color_background`, `color_muted`, `radius_base`) are dropped. The public read path **compiles** a token document on the fly (preset defaults ← presentation overlay ← brand), so every tenant — published or not — always has a complete token map. |
| 4   | **Ownership** (your directive) | **Brand owns identity (color/type) + shape + rhythm.** Theme/merchant owns surfaces, neutral, status, border color, container width.                                                                                                                                                                                                                      |

---

## 2. Current state (the gap v2 fills)

Confirmed by reading the code, not docs:

- **11 tokens**, all hex / font-name strings: `colorPrimary, colorPrimaryForeground,
colorAccent, colorBackground, colorForeground, colorMuted, colorBorder, fontHeading,
fontBody, radiusBase, containerWidth`
  ([packages/storefront-themes/src/tokens.ts](../packages/storefront-themes/src/tokens.ts)).
- **Shape is one knob.** `--sf-radius: 14px` with `-sm`/`-lg` _computed_ off it. No
  per-component radius.
- **Rhythm doesn't exist.** [apps/storefront/app/storefront.css](../apps/storefront/app/storefront.css)
  hardcodes every gap, pad and `clamp()` as magic numbers. There is no spacing scale a
  merchant could shift.
- **Effects hardcoded.** `--sf-shadow-sm/md/lg`, `--sf-ease` live in CSS.
- **Status colors not themeable.** `--color-success/warning/danger` come from @sparx/ui
  globals, not the merchant theme.
- **Two CSS layers**, bridged by aliasing: `--sparx-*` / `--color-*` (@sparx/ui) → `--sf-*`
  (storefront). @sparx/ui already ships `--space-1..16` and `--radius-sm..full` — the
  storefront just doesn't consume them.
- **Storage:** brand identity on `TenantBrand` columns; presentation overlay is JSONB (Site
  Builder) write-through to 3 `StorefrontTheme` columns as the no-snapshot SSR fallback. The
  public `/v1/public/tenants/:slug` `theme` object reads those columns
  ([apps/storefront/lib/tenant.ts](../apps/storefront/lib/tenant.ts) → [lib/theme.ts](../apps/storefront/lib/theme.ts)).

---

## 3. The v2 token vocabulary

### 3.1 Color — full DaisyUI-parity semantic palette

Every color slot is a base color the merchant can set (hex). Each has a `-content` pair
(text/icon color shown on that surface) that is **auto-derived** by default and overridable.

| Group   | Slot                        | `-content`              | Owner        | Maps to today                             |
| ------- | --------------------------- | ----------------------- | ------------ | ----------------------------------------- |
| Surface | `base-100` (page)           | `base-content`          | presentation | `colorBackground` / `--sf-bg`             |
| Surface | `base-200` (surface/card)   | (shares `base-content`) | presentation | `--sf-surface` (was hardcoded alias)      |
| Surface | `base-300` (subtle/muted)   | (shares `base-content`) | presentation | `colorMuted` / `--sf-bg-subtle`           |
| Brand   | `primary`                   | `primary-content`       | **brand**    | `colorPrimary` / `colorPrimaryForeground` |
| Brand   | `secondary` _(new)_         | `secondary-content`     | **brand**    | — (derived from primary if unset)         |
| Brand   | `accent`                    | `accent-content`        | **brand**    | `colorAccent`                             |
| UI      | `neutral` _(new)_           | `neutral-content`       | presentation | `--sf-text` used as dark fill today       |
| Status  | `info` _(new themeable)_    | `info-content`          | presentation | @sparx/ui global                          |
| Status  | `success` _(new themeable)_ | `success-content`       | presentation | @sparx/ui global                          |
| Status  | `warning` _(new themeable)_ | `warning-content`       | presentation | @sparx/ui global                          |
| Status  | `danger` _(new themeable)_  | `danger-content`        | presentation | @sparx/ui global `--color-danger`         |
| Line    | `border`                    | —                       | presentation | `colorBorder`                             |

Naming note: DaisyUI's `error` is our `danger` (consistent with @sparx/ui's `--color-danger`);
`base-content` is our text color (replaces the standalone `colorForeground`). Secondary text /
muted text tiers (`--sf-text-secondary`, `--sf-text-muted`) are **derived** from `base-content`
× `base-100` via `color-mix`, not separate slots.

### 3.2 Shape — brand-owned

DaisyUI's radius trio + border width, lifted to brand:

| Token             | Applies to                               | DaisyUI analog      |
| ----------------- | ---------------------------------------- | ------------------- |
| `radius-selector` | pills, chips, toggles, swatches, badges  | `--radius-selector` |
| `radius-field`    | inputs, buttons, selects, small controls | `--radius-field`    |
| `radius-box`      | cards, panels, drawers, summaries, media | `--radius-box`      |
| `border-width`    | the 1px → Npx line weight site-wide      | `--border`          |

Replaces the single `radiusBase` + computed `-sm`/`-lg`.

### 3.3 Rhythm — brand-owned (new)

The storefront has **no** spacing scale today. v2 introduces one, owned by brand so the
whole site's density shifts together:

| Token           | Meaning                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `space-base`    | the rhythm unit (e.g. `0.25rem`); the `--sf-space-*` scale is derived from it (`space-1 = base`, `space-2 = base×2`, …) |
| `size-field`    | control height for inputs/buttons (DaisyUI `--size-field`)                                                              |
| `size-selector` | control height for pills/toggles (DaisyUI `--size-selector`)                                                            |

storefront.css's hardcoded gaps/pads are refactored onto `var(--sf-space-*)` as part of the
build (§7). Section-level `clamp()` rhythm (hero/section vertical padding) stays responsive but
is scaled by `space-base`.

### 3.4 Effects — brand-owned

| Token   | Meaning                                                                                         | DaisyUI analog |
| ------- | ----------------------------------------------------------------------------------------------- | -------------- |
| `depth` | shadow intensity multiplier (0 = flat, 1 = default, >1 = lifted); drives `--sf-shadow-sm/md/lg` | `--depth`      |

DaisyUI's `--noise` (decorative grain) is **out of scope** — low value for commerce, easy to
add later if asked.

### 3.5 Type / layout (unchanged shape, brand vs presentation split)

- `font-heading`, `font-body` — **brand**.
- `container-width` (`narrow`/`medium`/`wide`/`full`) — **presentation**.
- Type _scale_ (the heading `clamp()` ramps) stays in CSS for now; a `type-scale-ratio`
  brand token is a candidate for a later slice, noted but not built.

### 3.6 Ownership summary

```
BRAND (identity + shape + rhythm) — read-only to cms/commerce/email/etc:
  primary(+content?)  secondary(+content?)  accent(+content?)
  font-heading  font-body
  radius-selector  radius-field  radius-box  border-width
  space-base  size-field  size-selector
  depth

PRESENTATION (theme preset default ← merchant override):
  base-100  base-200  base-300  base-content
  neutral(+content?)
  info  success  warning  danger  (+content? each)
  border
  container-width
```

This is the clean line your "brand owns radius + base spacing" directive draws, and it keeps
the §6.2 honesty rule from doc 30 intact: the presentation customizer never edits brand-owned
tokens — it points at the Brand panel.

---

## 4. Color derivation strategy (hex stored → CSS derived)

Merchants set base colors as hex. Everything else is computed at render with `color-mix` in
OKLCH space (perceptually uniform), so a single hex pick yields a coherent set:

```css
/* stored: --sf-primary: #4f46e5; (one hex pick) */
--sf-primary-hover: color-mix(in oklch, var(--sf-primary) 86%, black);
--sf-primary-active: color-mix(in oklch, var(--sf-primary) 74%, black);
--sf-primary-tint: color-mix(in oklch, var(--sf-primary) 8%, transparent);
/* auto contrast content: pick near-white or near-black off the surface's lightness */
--sf-primary-content: /* derived; see below */;
```

**`-content` auto-derivation.** Default rule: choose `base-content`-dark or `base-100`-light
against the slot's perceptual lightness so contrast clears WCAG AA. Where `relative-color`
syntax is available (`oklch(from var(--sf-primary) …)`) we read lightness directly; otherwise
we compute the content color **at compile time** (server-side, in `@sparx/storefront-themes`)
using a small OKLCH helper and emit a concrete hex, so SSR is deterministic and we don't depend
on browser `relative-color` support. Either way, a merchant may **override** any `-content` slot
(full-parity escape hatch); an explicit value wins over the derived one.

No OKLCH is stored. No existing hex value migrates. This keeps decision #1 and #2 compatible:
full palette parity on _base_ slots, derivation as the default for the derived slots.

---

## 5. Storage model (JSON only)

### 5.1 Shape

A token document is a small, versioned JSON object, split by owner:

```jsonc
// TenantBrand.tokens  (JSONB)  — identity + shape + rhythm, brand-owned
{
  "v": 2,
  "color":  { "primary": "#4f46e5", "secondary": null, "accent": "#0ea5e9",
              "primaryContent": null, "secondaryContent": null, "accentContent": null },
  "type":   { "heading": "Geist", "body": "Inter" },
  "shape":  { "radiusSelector": "9999px", "radiusField": "0.5rem",
              "radiusBox": "0.875rem", "borderWidth": "1px" },
  "rhythm": { "spaceBase": "0.25rem", "sizeField": "2.75rem", "sizeSelector": "2rem" },
  "effect": { "depth": 1 }
}

// Site Builder theme config presentation overlay  (JSONB, already exists)
// preset default ← this overlay, per light/dark mode
{
  "v": 2,
  "light": { "base100": "#ffffff", "base200": "#f7f7f9", "base300": "#ececf1",
             "baseContent": "#0b1120", "neutral": "#1f2430", "border": "#e4e4e7",
             "info": null, "success": null, "warning": null, "danger": null,
             "containerWidth": "wide" },
  "dark":  { "base100": "#0b1120", ... }
}
```

- `null` means "inherit" (preset default for presentation; derived for `-content`).
- Unknown keys are dropped on read (same hardening as `pickKnown` today).
- `v` carries the schema version for forward migration.

### 5.2 Columns dropped

`commerce_storefront_themes` loses `color_background`, `color_muted`, `radius_base` (the last
of the write-through columns; identity columns already dropped in `20260610000200`). The
presentation overlay JSONB becomes the sole presentation store. **No write-through on publish.**

### 5.3 Compile, don't read columns

`/v1/public/tenants/:slug` stops reading theme columns and instead returns a **compiled token
document**: `compileTokensV2(themeKey, presentationOverlay, brandDoc)` =
preset defaults ← presentation overlay ← brand identity (brand wins for its slots), with
`-content`/hover/tint derivation applied. Because preset defaults always exist, an unpublished
or freshly-created tenant still returns a complete map — which is exactly what makes "drop the
fallback columns" safe (decision #3's dependency, resolved).

The published Site Builder snapshot's `compiledTokens` uses the **same** compile function, so
the section-render path and the chrome read path can't drift.

---

## 6. CSS layer plan

v2 does **not** refactor @sparx/ui's `--color-*` / `--space-*` tokens — the dashboard depends
on them and that's out of scope. Instead:

- The storefront's `--sf-*` layer becomes the single canonical surface for storefront chrome +
  Site Builder sections, **generated** from the compiled token doc (one `tokensToCssVarsV2`).
- The `--sf-space-1..N` scale is emitted from `space-base`; storefront.css's hardcoded
  gaps/pads are migrated onto it (mechanical, section by section).
- The existing `--sf-* : var(--color-*)` aliases stay as _fallback seeds_ (so an un-themed
  storefront still renders), but a compiled token always overrides them.

Net: one place (`@sparx/storefront-themes`) owns the storefront token vocabulary; @sparx/ui is
untouched; the dashboard inspector and the storefront read the same compiled doc.

---

## 7. Build order

**Resequenced (2026-05-30) to avoid a broken middle state.** The original order made the read
path expect v2 JSON that _no editor writes_ until the Phase 2 generator editor exists — and the
current brand panel + customizer (which would otherwise be reworked to write that JSON) are the
very surfaces the Phase 2 editor _replaces_. So the destructive storage cutover (drop columns,
`TenantBrand` → JSON, v2 presentation-overlay shape, backfill) is moved to land **with** the
Phase 2 editor that writes the new shapes. The **end state is unchanged** (decision #3 stands:
JSON-only, no fallback columns) — only the _timing_ of the drop moves, so we never deploy a read
path that depends on data nothing writes.

**Foundation — done:**

1. ✅ **Token core** — v2 types + `compileTokensV2` + derivation helpers + the CSS emitter in
   `@sparx/storefront-themes`; unit tests for compile + derivation + override precedence.
2. ✅ **Presets** — the 6 presets migrated to the v2 schema (base-100/200/300, neutral, status,
   shape/rhythm/effect defaults). Snapshot + AA tests lock the compiled defaults.

**v2 render path — non-destructive, lands now (combines old §3 read-path + §4 CSS):**

3. **Compile-from-config read path** — `/v1/public/tenants/:slug` compiles a v2 token document
   from `getThemePresetV2(themeKey)` ← a **brand doc built from the existing `TenantBrand`
   columns** (color/type; shape/rhythm/effect fall through to preset defaults — no brand schema
   change yet) ← a best-effort presentation overlay mapped from the **existing** stored
   overrides. Returns the compiled CSS. No migration. StorefrontTheme columns + write-through
   stay (harmless) until step 6.
4. **storefront.css refactor** — onto the canonical `--sf-*` vocabulary: radius trio,
   `--sf-space-*` scale, `depth`-driven shadows. Legacy aliases (emitted by the CSS layer)
   keep any un-migrated rule rendering during the refactor.

   _Net after 3–4:_ every storefront immediately gets the richer preset tokens (surface tiers,
   radius trio, spacing scale, depth, themeable status), with brand identity overlaid live from
   existing columns. Ships small, breaks nothing, needs no editor.

**Destructive storage cutover — lands WITH the Phase 2 generator editor:**

5. **Storage** — add `TenantBrand.tokens` (shape/rhythm/effect + secondary/content) + the v2
   presentation-overlay shape on `SiteConfig.draftSettings`, written by the new editor.
6. **Drop + backfill** — backfill existing `TenantBrand` / `StorefrontTheme` rows into the v2
   docs, drop the 3 `StorefrontTheme` columns, delete the write-through (hand-edited RLS-aware
   migration SQL). Prod ordering: deploy the editor + JSON readers first, then run DB Migrate
   once (same cutover rule as 1D).

Mobile: the inspector and any token UI must stay usable on small screens (two-pane collapses to
one stacked column) — same rule as the rest of the builder.

---

## 8. Risks & open items

- **`-content` derivation correctness.** Auto-contrast must clear AA for arbitrary merchant
  hex. Mitigation: compile-time OKLCH computation with a tested helper + the manual override
  escape hatch; carry the contrast readout already built into the Brand board.
- **Migration ordering (prod).** The column-drop migration must land **after** the
  compile-from-config read path is deployed (same rule as the 1D cutover): deploy code first,
  then run DB Migrate once. A tenant hitting the old image after the drop would 500 — minimize
  the window.
- **`color-mix(in oklch …)` / `relative-color` support.** Evergreen browsers are fine;
  derivation that must be deterministic for SSR is computed server-side and emitted as hex, so
  we don't hard-depend on `relative-color` in the browser.
- **Preset visual drift.** Adding base-200/300 + neutral + status defaults to 6 presets risks
  shifting their look; snapshot tests + a visual pass per preset gate the migration.
- **Scope creep toward full DaisyUI.** `noise` and a type-scale-ratio token are deliberately
  deferred; don't pull them in without a trigger.
