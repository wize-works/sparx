# @sparx/ui Variant System (multi-axis)

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-31

---

## 1. Purpose & scope

`@sparx/ui` is mature (~50 components) but most color-bearing components conflate
**color and style into a single `variant` axis**. Button's `variant` mixes
`primary | secondary | outline | soft | ghost | link | danger | warning | module |
module-outline` — you cannot ask for a "soft danger" or an "outline success" because
those cells don't exist. Badge and Tag have the same problem with different ad-hoc sets.

This doc defines a **DaisyUI-style multi-axis API** for color-bearing components:

```
color   ×   variant   ×   size   ×   shape
```

so `<Button color="danger" variant="soft" size="lg" shape="wide" />` is expressible
without enumerating the cartesian product by hand. It also brings the **Token Model v2**
semantic palette (accent / info / neutral + `-content` pairs + `color-mix` derivation)
*into* `@sparx/ui`'s `tokens.css` to back the new `color` axis.

### Decisions locked (2026-05-31)

| #   | Decision           | Choice                                                                                                                                 |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **API shape**      | **Orthogonal axes.** `color × variant × size × shape`. Breaking — call sites are migrated in the same pass (codemod, §7).               |
| 2   | **Token layer**    | **Bring v2 palette into @sparx/ui.** Add `accent/info/neutral` + `-content` pairs + `color-mix` hover/tint to `tokens.css`. Deviates from doc 33 §6 — see §3.4. |
| 3   | **Scope**          | **Comprehensive.** A pass over the whole inventory: full `color × variant` on Tier-A action/status components, state-color + size on Tier-B controls, structural variants on Tier-C, plus net-new staples (Alert, Progress, Kbd, StatusDot, ButtonGroup, Collapse/Accordion). See §5. |
| 4   | **Color mechanism** | **Role-variable indirection (no codegen).** Variants are written once against generic role vars (`--c-bg`/`--c-content`/`--c-hover`/`--c-tint`); the `color` axis remaps them, so `color × variant` composes automatically and **runtime/custom theme colors work with no rebuild** (§4). Call-site migration via codemod (§7). |

> **Relationship to Token Model v2 (doc 33).** Doc 33 §6 deliberately scoped `@sparx/ui`
> *out* of the v2 token refactor ("the dashboard depends on them and that's out of scope").
> Decision #2 here **reverses that for the palette only**: we adopt v2's _color vocabulary_
> (semantic slots + `-content` pairs + OKLCH derivation) in the dashboard token layer so the
> `color` axis has something coherent to bind to. We do **not** adopt v2's storage model,
> compile pipeline, or `--sf-*` layer — those stay storefront-only. Doc 33 §6 is amended by
> this doc; the storefront and dashboard now share a token _shape_ but keep separate _layers_
> (`--sf-*` vs `--color-*`).

---

## 2. The four axes

### 2.1 `color` — semantic palette

| Token       | Meaning                                  | Notes                                       |
| ----------- | ---------------------------------------- | ------------------------------------------- |
| `primary`   | Brand action                             | = `--sparx-primary` (`#6366F1`)             |
| `secondary` | Brand-adjacent secondary identity        | new; defaults to a slate/indigo-muted       |
| `accent`    | Pop / highlight                          | new                                         |
| `neutral`   | Default, low-chroma UI                   | new; the "no color specified" default       |
| `info`      | Informational status                     | new themeable                               |
| `success`   | Positive status                          | normalizes existing `--color-success*`      |
| `warning`   | Caution status                           | normalizes existing `--color-warning*`      |
| `danger`    | Destructive / error status               | normalizes existing `--color-danger*`       |
| `module`    | The active module's color                | reads `--module-active*` (ModuleProvider)   |

`module` is special: it tracks `--module-active` so a `<Button color="module">` inside a
`<ModuleProvider module="cms">` is teal automatically (existing behaviour, kept).

### 2.2 `variant` — style / treatment

| Token     | Treatment                                                              |
| --------- | --------------------------------------------------------------------- |
| `solid`   | Filled: `bg-{color}`, `text-{color}-content`, hover → `{color}-hover`  |
| `soft`    | Tinted: `bg-{color}-tint`, `text-{color}` (low-emphasis fill)          |
| `outline` | Bordered transparent: `border-{color}`, `text-{color}`, hover → tint   |
| `dashed`  | `outline` + `border-dashed` (DaisyUI `dash`)                           |
| `ghost`   | No border/bg, `text-{color}`, hover → tint                             |
| `link`    | Inline text link, underline-on-hover, no padding/height               |

`solid` is the default treatment for Button; `soft` for Badge/Tag; `soft` for Alert.

### 2.3 `size`

`xs | sm | md | lg | xl`. Unchanged set; applies to height + padding + text size.
(Badge/Tag use a reduced subset — `sm | md | lg`.)

### 2.4 `shape` — geometry modifier (Button-centric)

| Token     | Effect                                                              |
| --------- | ------------------------------------------------------------------- |
| (default) | Auto width, normal horizontal padding                               |
| `wide`    | Extra horizontal padding / `min-width` for emphasis                 |
| `block`   | `w-full` — fills its container                                      |
| `square`  | 1:1, icon-only, field radius                                        |
| `circle`  | 1:1, icon-only, fully rounded                                       |

`square`/`circle` **replace** Button's current `icon-sm/icon-md/icon-lg` sizes —
icon buttons become `shape="square" size="md"` (geometry × size, orthogonal).

---

## 3. Token additions (`packages/ui/src/tokens.css`)

### 3.1 Per-color quartet

Every semantic color gets a four-token quartet (DaisyUI parity: base + content,
plus the two derived shades the variants need):

```css
--color-{c}:          /* base fill (hex, stored)            */
--color-{c}-content:  /* text/icon on the base fill         */
--color-{c}-hover:    /* solid hover — derived              */
--color-{c}-tint:     /* soft/ghost/outline-hover bg — derived */
```

### 3.2 Derivation (`color-mix` in OKLCH)

Hover and tint are **derived in CSS** from the stored base (same strategy as v2 §4),
so a single base hex yields a coherent set and dark mode adapts for free:

```css
--color-primary:         #6366f1;
--color-primary-content:  #ffffff;
--color-primary-hover:    color-mix(in oklch, var(--color-primary) 88%, black);
--color-primary-tint:     color-mix(in oklch, var(--color-primary) 12%, transparent);
```

`-tint` mixes toward **`transparent`** (not white) so the soft fill reads correctly over
any surface in both light and dark mode without a second dark-mode declaration.

### 3.3 Legacy aliases (no breakage)

Existing tokens that other components read are **kept as aliases**, not deleted:

```css
--color-success-tint: var(--color-success-tint);   /* already this name */
--color-success-text: var(--color-success-content); /* alias old → new   */
```

So `--color-{success|warning|danger}-text` (used in today's Badge and elsewhere) keep
resolving while we migrate. `--sparx-primary*` and `--module-active*` are untouched.

### 3.4 What we are NOT changing

- No change to `--space-*`, `--radius-*`, `--shadow-*`, type tokens. Shape/rhythm stays
  as-is in the dashboard (v2's radius-trio / space-base are a storefront concern).
- No change to the `--sf-*` layer or `@sparx/storefront-themes`.
- No new dark-mode declarations beyond the few base colors that need a dark variant
  (`neutral`, surfaces already present). Derived tokens inherit automatically.

---

## 4. Color via role-variable indirection (no codegen)

### 4.1 The mechanism

Each color-bearing element carries a set of **role variables** describing "the current
color of this element":

```
--c-bg       /* base fill           */
--c-content  /* text/icon on the fill */
--c-hover    /* solid hover shade   */
--c-tint     /* soft / hover-tint bg */
```

The **`variant` (treatment)** classes are written **once**, against the role vars — six
static class strings, fully visible to Tailwind:

```ts
const variant = {
  solid:   'bg-[var(--c-bg)] text-[var(--c-content)] hover:bg-[var(--c-hover)]',
  soft:    'bg-[var(--c-tint)] text-[var(--c-bg)] hover:brightness-95',
  outline: 'border border-[var(--c-bg)] text-[var(--c-bg)] hover:bg-[var(--c-tint)]',
  dashed:  'border border-dashed border-[var(--c-bg)] text-[var(--c-bg)] hover:bg-[var(--c-tint)]',
  ghost:   'text-[var(--c-bg)] hover:bg-[var(--c-tint)]',
  link:    'h-auto p-0 text-[var(--c-bg)] underline-offset-4 hover:underline',
};
```

The **`color` axis** is a thin mapping that just **reassigns the role vars** to a palette
slot. These are plain CSS classes in `tokens.css` (not Tailwind utilities):

```css
.sx-c-primary { --c-bg: var(--color-primary);  --c-content: var(--color-primary-content);
                --c-hover: var(--color-primary-hover); --c-tint: var(--color-primary-tint); }
.sx-c-success { --c-bg: var(--color-success);  --c-content: var(--color-success-content);
                --c-hover: var(--color-success-hover); --c-tint: var(--color-success-tint); }
/* … one rule per slot … */
.sx-c-module  { --c-bg: var(--module-active);   --c-content: var(--module-active-content);
                --c-hover: var(--module-active-hover); --c-tint: var(--module-active-tint); }
```

Each role-var read carries a `neutral` fallback — e.g. `bg-[var(--c-bg,var(--color-neutral))]`
— so an element with an unknown/unmapped `color` degrades to neutral instead of rendering
unstyled.

`color × variant` now **composes automatically**: the `color` class sets the role vars,
the `variant` class consumes them. No cartesian product, no `compoundVariants`, no codegen
— ~9 color rules + 6 variant strings instead of 48 cells per component, and the variant
treatment is authored once and reused by Button/Badge/Tag/Alert.

### 4.2 Why this beats codegen — custom theme colors

This is the **decisive** advantage. A merchant/tenant custom theme color does **not**
require regenerating or rebuilding the component package, because the component CSS only
ever references role vars and the `color` mapping is open-ended:

- **Re-skinning an existing slot** (the common case, matches Token Model v2's fixed
  semantic slots): the theme overrides the *value* — `--color-primary: <their hex>` — and
  the derived `-hover`/`-tint` recompute via `color-mix`. Every `.sx-c-primary` element
  updates live. Zero component change.
- **A brand-new named color** created at runtime: the theme layer emits one extra rule
  `.sx-c-<name> { --c-bg: …; --c-content: …; --c-hover: …; --c-tint: … }` (and, if it wants
  derivation, a `--color-<name>` quartet). The component accepts `color="<name>"` as a
  passthrough string. Nothing in `@sparx/ui` is rebuilt — Tailwind already shipped the
  `var(--c-*)` treatment classes; only a CSS rule is added.

Because the treatment classes are static `var(--c-*)` references, Tailwind's build-time
scan is satisfied **once, for all colors that will ever exist** — the exact property the
codegen approach could not provide.

### 4.3 Component anatomy

```tsx
// button.tsx — every axis is a static map; nothing generated.
const buttonVariants = cva(BASE, {
  variants: {
    color:   { primary:'sx-c-primary', secondary:'sx-c-secondary', accent:'sx-c-accent',
               neutral:'sx-c-neutral', info:'sx-c-info', success:'sx-c-success',
               warning:'sx-c-warning', danger:'sx-c-danger', module:'sx-c-module' },
    variant: { solid:…, soft:…, outline:…, dashed:…, ghost:…, link:… },  // the 6 above
    size:    { xs:…, sm:…, md:…, lg:…, xl:… },
    shape:   { default:'', wide:…, block:'w-full', square:…, circle:… },
  },
  defaultVariants: { color:'primary', variant:'solid', size:'md', shape:'default' },
});

// color is typed as the known slots `| (string & {})` so a runtime custom-color name
// (e.g. color="brand-mint") is accepted without a type error — it maps to `sx-c-${color}`.
```

The `color` prop maps to `` `sx-c-${color}` `` (with the known union for autocomplete plus
a `string` escape hatch for runtime colors). `module` keeps tracking `--module-active*`,
so `<Button color="module">` inside `<ModuleProvider>` stays automatic.

---

## 5. Components

**Framing.** Every component is a hand-authored Radix/shadcn-pattern shell (Radix
primitive + CVA + `cn()` + token vars). This work is a **comprehensive pass over the whole
inventory** — each component gains the axes that fit its semantics, all backed by the v2
token palette and the `--c-*` role-var mechanism. Not every component takes a full color
palette: action/status components do; structural ones take a relevant subset (size, a
validation/state color, an accent). Axis treatments (`solid/soft/outline/…`) are authored
once (§4.1) and shared, so applying them across many components is mostly wiring, not
re-derivation.

### 5.1 Tier A — full color axis (`color × variant` via role vars)

| Component  | variant set                          | size  | shape / extra                     | default                |
| ---------- | ------------------------------------ | ----- | --------------------------------- | ---------------------- |
| Button     | solid soft outline dashed ghost link | xs–xl | wide / block / square / circle    | `primary / solid / md` |
| Badge      | solid soft outline dashed            | sm–lg | —                                 | `neutral / soft / md`  |
| Tag        | solid soft outline                   | sm–lg | removable                         | `neutral / soft / md`  |
| **Alert** *(new)*    | soft solid outline         | sm–lg | title/desc/icon/dismiss           | `info / soft / md`     |
| **Progress** *(new)* | solid soft                 | sm–lg | determinate + indeterminate       | `primary / solid / md` |
| **StatusDot** *(new)*| solid soft                 | sm–lg | optional pulse                    | `neutral / solid / md` |

Default Button color stays **`primary`** (keeps today's bare-`<Button>` behaviour;
decision 2026-05-31).

### 5.2 Tier B — color on a state, not full palette

Color applies to the **active/checked/validation** part only; sensible default color so
existing call sites are unaffected.

| Component                | color usage                          | other axes                         |
| ------------------------ | ------------------------------------ | ---------------------------------- |
| Checkbox                 | checked fill (`primary` default)     | size sm/md/lg                      |
| Switch                   | on-state track (`primary` default)   | size sm/md/lg                      |
| RadioGroup / RadioItem   | selected dot (`primary` default)     | size sm/md/lg                      |
| Slider                   | range/thumb (`primary` default)      | size sm/md/lg                      |
| Input / Textarea         | keep `variant` **state** (default/error/**success**); state maps to a color (`danger`/`success`) | size sm/md/lg |
| Select (trigger)         | same state model as Input            | size sm/md/lg                      |
| Spinner                  | optional `color` (default `neutral` → `currentColor`) | size (existing) |

### 5.3 Tier C — structural variants (token-driven, no color palette)

| Component   | change                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| Card        | keep `variant` (default/elevated/module/outline); add optional `accent` color for the module top-stripe; `padding` size | 
| Tabs        | keep `variant` (underline/pills); add `size`                                    |
| Avatar      | already size × shape — align `shape` naming (circle/square) with Button         |
| **ButtonGroup** *(new)* | segmented/joined buttons (DaisyUI `join`); orientation + shared size/color passthrough |
| **Collapse / Accordion** *(new)* | Radix Accordion shell; `variant` (bordered/ghost/separated) |
| **Kbd** *(new)*         | keyboard-key chip; `size` only                                      |

### 5.4 Unchanged (single-axis where `variant` is genuinely not a color)

`Text` (`muted`…), `Heading`, `Code`, `Stack`/`Grid`/`Container`/`Divider`,
`Skeleton`, `Stat`, `Timeline`, `EmptyState`, `Breadcrumb`, `Pagination`, `Stepper`,
overlays (`Modal`/`Drawer`/`Popover`/`Tooltip`/menus) keep their current APIs. The
`color × variant` split applies only to Tier A; we do **not** touch the ~750 non-color
`variant=` usages.

---

## 6. Migration mapping (old → new)

### 6.1 Button

| Old `variant`     | New props                          |
| ----------------- | ---------------------------------- |
| _(none / bare)_   | _(unchanged — default stays `primary`)_ |
| `primary`         | _(drop — it's the default)_        |
| `secondary`       | `variant="outline"` (neutral)      |
| `outline`         | `variant="outline"` (neutral)      |
| `soft`            | `color="primary" variant="soft"`   |
| `ghost`           | `variant="ghost"` (neutral)        |
| `link`            | `color="primary" variant="link"`   |
| `danger`          | `color="danger"`                   |
| `warning`         | `color="warning"`                  |
| `module`          | `color="module"`                   |
| `module-outline`  | `color="module" variant="outline"` |
| `size="icon-sm"`  | `shape="square" size="sm"`         |
| `size="icon-md"`  | `shape="square" size="md"`         |
| `size="icon-lg"`  | `shape="square" size="lg"`         |

### 6.2 Badge / Tag

| Old `variant` | New props                        |
| ------------- | -------------------------------- |
| `default`     | _(none)_ → `neutral / soft`      |
| `secondary`   | `variant="outline"`              |
| `primary`     | `color="primary"` (soft default) |
| `success`     | `color="success"`                |
| `warning`     | `color="warning"`                |
| `danger`      | `color="danger"`                 |
| `module`      | `color="module"`                 |
| `soft`        | `color="primary"`                |
| `outline`     | `variant="outline"`              |

### 6.3 Codemod

`scripts/migrate-variants.mjs` (ts-morph or jscodeshift) walks `apps/**/*.tsx`, and for
JSX elements named `Button`/`Badge`/`Tag` only, rewrites the `variant`/`size` attributes
per the tables above. Non-color components and any `variant` value not in the tables are
left untouched. The script prints a per-file diff summary; we review before committing.
Anything the codemod can't safely resolve (spread props, computed variant) is reported,
not guessed, and fixed by hand.

---

## 7. Build order

1. **Tokens** — add the per-color quartets (`--color-{c}` / `-content` / `-hover` / `-tint`)
   with `color-mix` derivation + legacy aliases to `tokens.css`; add the `.sx-c-{color}`
   role-var mapping classes (§4.1); add `neutral`/`secondary`/`accent`/`info` dark-mode
   bases. _No component change yet; nothing breaks._
2. **Refactor color-bearing components** — Button, Badge, Tag onto the four axes. Variant
   treatments authored once against `--c-*` role vars (§4.1); `color` maps to `sx-c-${color}`
   with a `string` escape hatch for runtime custom colors. Clean break on the old `variant`
   values — the codemod handles call sites (decision #1).
3. **Codemod the apps** — run `migrate-variants.mjs`, review diffs, fix reported edge cases.
4. **Net-new components** — Alert, Progress, Kbd, StatusDot, ButtonGroup; export from barrel.
5. **Showcase** — rebuild `apps/dashboard/app/showcase/page.tsx` to render the **full
   matrix**: every color × every variant for Button/Badge/Tag/Alert, all sizes, all shapes,
   and each net-new component. The showcase is the acceptance surface — if a cell is missing
   it's a gap.
6. **Verify** — `pnpm --filter @sparx/ui typecheck && pnpm --filter dashboard typecheck`,
   lint (ESLint Tailwind rule still green — raw classes only inside `@sparx/ui`), and a
   visual pass of `/showcase` in light + dark.

Mobile: the showcase and every new component follow the existing responsive rule — the
matrix grids collapse to fewer columns on small screens (no fixed desktop-only layout).

---

## 8. Risks & open items

- **Default color.** Button default stays `primary` (decision 2026-05-31), so bare
  `<Button>` is visually unchanged and the codemod leaves bare buttons alone — it only
  rewrites explicit old `variant`/`size` values. Badge/Tag default to `neutral` (matches
  today's `default` variant).
- **`color-mix(in oklch …)` support.** Evergreen browsers only — fine for the dashboard
  (authenticated app, modern browsers). Unlike the storefront we do not SSR-derive to hex;
  if a legacy browser matters later we precompute. Noted, not blocking.
- **Runtime custom colors (the `string` escape hatch).** `color` accepts arbitrary strings
  so a tenant color maps to `sx-c-<name>`. If the theme layer hasn't emitted that
  `.sx-c-<name>` rule, the role vars fall back to the `neutral` defaults (graceful, not
  broken). The theme/inspector that introduces custom slots owns emitting the matching rule
  — documented as the contract, not enforced by the type.
- **AA contrast on arbitrary `-content`.** Our palette is fixed (not merchant-set), so
  `-content` pairs are authored to clear AA once; no runtime contrast concern here (that's
  the storefront's problem, doc 33 §8).
- **Scope creep toward full DaisyUI.** Accordion, radial progress, indicator-badge are
  deferred (§5.2); don't pull them in without a trigger.
