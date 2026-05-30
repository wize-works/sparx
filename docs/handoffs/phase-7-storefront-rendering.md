# Handoff — Phase 7: Storefront rendering of the Site Builder snapshot

**To:** the storefront agent (owns `apps/storefront`)
**From:** the Site Builder build (owns `packages/sitebuilder*`, `packages/storefront-themes`, `services/api-rest/.../sitebuilder/*`)
**Status of the backend you depend on:** DONE + green. The public read endpoint, the
compiled-token contract, the section registry, and the dashboard live-preview transport are
all built, tested, and stable. Nothing below is speculative — it's the shipped contract.

Your job is to make a published Site Builder config actually render on the storefront:
themed tokens (light **and** dark), composed sections, and config-driven header/footer.
Today `apps/storefront` has a single hardcoded design and ignores all of this.

---

## 1. The data contract — one endpoint

```
GET /v1/public/storefront/site?tenant=<slug>
```

- Unauthenticated, read-only, returns **only the published** snapshot.
- `tenant` is the storefront subdomain slug (resolve it from the request host upstream, same
  way the existing public commerce endpoints do — see `resolveTenantId` in
  `services/api-rest/src/routes/v1/lib/public-commerce-context.ts`).
- 404 (`MODULE_DISABLED`) when the `storefront` module is off for that tenant — render your
  existing fallback, don't crash.
- Returns `null` when nothing has been published yet → **keep the current commerce homepage
  as the empty-store fallback.** Do not show a blank page.

Response `data` shape (`PublishedSnapshot`, defined in
`packages/sitebuilder/src/services/publish-internals.ts`):

```ts
{
  versionNumber: number;
  themeKey: string; // 'apex' | 'industrial' | 'drift' | 'market' | 'fleet' | 'drop'
  appearancePolicy: 'light-only' | 'dark-only' | 'auto' | 'toggle';
  compiledTokens: {
    light: Record<string, string>; // ThemeTokenKey → value (already merged: preset ← merchant overlay)
    dark: Record<string, string>;
  }
  sections: Array<{
    id: string;
    pageKey: string; // 'home' or a page slug
    sectionType: string; // one of the 7 registry types (§3)
    position: number; // already sorted asc, but sort defensively
    visible: boolean; // DROP non-visible before rendering
    config: Record<string, unknown>; // validated against the section schema at publish time
  }>;
  layout: Array<{
    slot: string; // 'header' | 'footer' | 'announcement'
    navigationMenuId: string | null; // FK into a NavigationMenu (Site Builder-owned) — resolve via the existing nav read path
    config: Record<string, unknown>;
    visible: boolean;
  }>;
}
```

**Draft preview** (the `?sparxPreview=` flow you already support) reads the authenticated
companion endpoint `GET /v1/sitebuilder/preview` instead of the public one — same
`PublishedSnapshot` shape, but built from the _draft_ rather than the published version.
Keep your existing preview-token gate; just swap which URL it fetches.

---

## 2. Tokens → CSS (light + dark) — use the shared helpers, don't re-derive

`@sparx/storefront-themes` already owns the token→CSS-var mapping. **Do not hardcode a second
copy of the variable names** — import the helpers so light/dark and the dashboard preview all
stay in lockstep:

```ts
import { tokensToCss } from '@sparx/storefront-themes';

const lightBody = tokensToCss(snapshot.compiledTokens.light); // "--sf-primary:#…;--sf-bg:#…;…"
const darkBody = tokensToCss(snapshot.compiledTokens.dark);
```

Inject two blocks in the storefront `<head>` / root layout:

```css
:root { <lightBody> }
[data-theme="dark"] { <darkBody> }
```

The light set maps onto the same `--sf-*` / `--color-*` variables the current
`apps/storefront/lib/theme.ts` `themeToCss()` already emits (that path stays working via
publish write-through to `StorefrontTheme`). The **new** work is the `[data-theme="dark"]`
block — add a `darkThemeToCss()` companion in `lib/theme.ts` (or just call `tokensToCss` on
the dark map; prefer the shared helper).

`TOKEN_CSS_VARS` in `packages/storefront-themes/src/tokens.ts` is the authoritative list of
which `--sf-*` vars each token drives — read it, don't guess.

### Appearance policy → which theme is active (no-flash)

Resolve the initial `data-theme` on `<html>` **before paint** with an inline script (mirror
the dashboard's `THEME_INIT_SCRIPT` pattern in `apps/dashboard/app/layout.tsx`):

- `light-only` → always `light`
- `dark-only` → always `dark`
- `auto` → `prefers-color-scheme: dark` ? `dark` : `light`
- `toggle` → read a cookie (default `light`), and render the shopper-facing toggle island

The toggle (`apps/storefront/components/mode-toggle.tsx`, new client island) flips
`document.documentElement.dataset.theme` and persists the choice in a cookie so SSR stays
correct on the next request. Render it in the header **only** when
`appearancePolicy === 'toggle'`.

---

## 3. Sections — render against the registry

The 7 section types and their config schemas live in `@sparx/sitebuilder-schemas`
(`SECTION_REGISTRY`, `SECTION_TYPES`). Build one storefront component per type under
`apps/storefront/components/sections/*` plus a `section-renderer.tsx` that maps
`sectionType → component`:

| `sectionType`       | renders                                             |
| ------------------- | --------------------------------------------------- |
| `hero`              | full-width banner: heading, copy, CTA               |
| `featured-products` | product grid (by collection / newest / hand-picked) |
| `collection-grid`   | shop-by-collection tiles                            |
| `rich-text`         | formatted text block                                |
| `image-banner`      | image + optional overlay text + link                |
| `testimonials`      | customer quotes, optional ratings                   |
| `email-signup`      | inline newsletter form                              |

- Import the per-section config types from `@sparx/sitebuilder-schemas` (each section file
  exports its Zod schema + `fields`); the `config` you receive is already validated +
  defaulted at publish time, so you can trust it, but parse defensively at the boundary.
- Render in `position` order, **skip `visible === false`**.
- `featured-products` / `collection-grid` need live catalog data — fetch products/collections
  through the existing public commerce read path; the section `config` carries the selector
  (collection id, limit, etc.), not the products themselves.
- **Brand rule:** storefront section components are themeable via `--sf-*` tokens only — no
  raw Tailwind color classes in `apps/storefront`. Follow the existing storefront component
  conventions.

`SectionRenderer` consumes `sections` for the relevant `pageKey`:

- `page.tsx` (home) → `pageKey === 'home'`
- `[...slug]/page.tsx` → `pageKey === <slug>`; **keep the CMS TipTap `PageView` fallback** when
  no Site Builder sections exist for that slug (Site Builder pages and CMS pages coexist —
  Site Builder pages win when present).

---

## 4. Layout (header / footer / announcement)

`layout[]` replaces the hardcoded nav/footer in `apps/storefront/app/layout.tsx`:

- Each block has a `slot`, a nullable `navigationMenuId`, and a `config`.
- `navigationMenuId` is a **reference** into a `NavigationMenu` (now Site-Builder-owned, but
  the `/v1/navigation/*` read path is unchanged and module-neutral) — resolve the menu + its
  items through that existing nav read path (the storefront already has a way to read menus; it
  just isn't wired into the layout yet — this is the wiring gap to close). The storefront
  references menus read-only; never write nav rows from the storefront.
- `announcement` slot → the top announcement bar (text/link/colors in `config`).
- Respect `visible` per block.

---

## 5. Dashboard live-preview transport (so customizer edits show instantly)

The dashboard customizer renders your storefront in an iframe (`?sparxPreview=` /
`?tenant=<slug>`) and pushes **token-only** changes over `postMessage` for instant feedback
without a reload. Listen for this message on the storefront and apply the vars live:

```ts
// message.data shape:
{
  type: 'sparx-sitebuilder-preview',
  themeKey: string,
  light: Record<string, string>,   // token map, same shape as compiledTokens.light
  dark:  Record<string, string>,
  mode: 'light' | 'dark',          // which palette the customizer is currently previewing
  css:  string,                    // pre-serialized tokensToCss(...) for the shown mode, convenience
}
```

On receipt: set `document.documentElement.dataset.theme = mode` and apply the corresponding
vars (either inject `css`, or run `tokensToCss(light|dark)` yourself). **Token changes =
postMessage, no reload. Structure changes (add/reorder/remove section, theme swap) = the
customizer triggers a full iframe reload** — so your normal SSR render path must already
reflect the latest draft via the preview endpoint. Guard the listener to the expected origin.

---

## 6. Acceptance (Playwright, seeded tenant)

- Published config renders: themed tokens + sections in order, non-visible dropped.
- `?sparxPreview` renders the **draft** (preview endpoint), published shoppers don't see it.
- Empty store (snapshot `null`) → commerce homepage fallback, not a blank page.
- Light/dark: `auto` follows `prefers-color-scheme`; `toggle` persists across reload via cookie;
  `light-only`/`dark-only` ignore both.
- Header/footer/announcement come from `layout[]` + resolved `NavigationMenu`, no hardcoded nav.
- `postMessage` token push updates the preview without a reload.

---

## 7. Boundaries to respect (these are load-bearing)

- **Don't** add columns to `commerce_storefront_themes` — the light-token write-through is the
  only writer of that projection now; the storefront read path through it stays as-is.
- **Don't** write `NavigationMenu`/`NavigationItem` rows from the storefront — reference only
  (navigation is edited in the Site Builder dashboard via `/v1/navigation/*`).
- **Don't** fork the token→CSS mapping — import `tokensToCss` / `TOKEN_CSS_VARS` from
  `@sparx/storefront-themes`.
- Live store zone is **`slug.sparx.zone`** (not `wizeworks.com` / `sparx.works`).

Ping me (the Site Builder owner) if the snapshot shape doesn't give you something you need —
it's cheaper to extend the contract than to work around it.
