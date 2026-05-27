# Sparx Platform — Frontend Component Architecture

**Version:** 1.3
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. The Core Rule

**Tailwind is an implementation detail. It never appears in feature code.**

Feature developers write semantic component APIs. The styling system — Tailwind classes, CSS variables, CVA variant configs — lives exclusively inside `packages/ui/`. This is how drift is prevented. There is no exception to this rule.

```tsx
// ✅ Correct — feature code
<Button variant="primary" size="md">Save changes</Button>
<Card variant="module">CMS content here</Card>
<Badge variant="success">Active</Badge>

// ❌ Wrong — never in feature code
<button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md">
  Save changes
</button>
```

---

## 2. Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Token foundation | `globals.css` (CSS custom properties) | Single source of truth for all colors, spacing, radius, typography |
| Component scaffolding | Shadcn/ui | Pre-built accessible component shells, immediately customized |
| Variant engine | CVA (Class Variance Authority) | Named variant → class mapping, locked inside `@sparx/ui` |
| Primitive accessibility | Radix UI | ARIA, keyboard navigation, focus management (via Shadcn) |
| Style composition | `cn()` (clsx + tailwind-merge) | Class deduplication, conditional class logic |
| Module theming | `ModuleProvider` | CSS variable context shifting per active module |
| Icons | Lucide React | Consistent, tree-shakeable, outline style |

---

## 3. Package Structure

```
packages/
└── ui/
    ├── package.json           # name: "@sparx/ui"
    ├── index.ts               # barrel export — all public components
    ├── tokens.css             # imported by apps — all CSS custom properties
    │
    ├── components/
    │   ├── primitives/        # Atomic — Button, Input, Badge, Avatar, Spinner
    │   ├── layout/            # Structural — Card, Stack, Grid, Divider, Container
    │   ├── overlay/           # Floating — Modal, Drawer, Popover, Tooltip, Toast
    │   ├── navigation/        # Nav — Sidebar, Tabs, Breadcrumb, Pagination
    │   ├── data/              # Display — Table, Stat, Timeline, EmptyState
    │   └── form/              # Forms — Select, Checkbox, Switch, DatePicker, FileUpload
    │
    ├── hooks/
    │   ├── use-module.ts      # reads current module context
    │   ├── use-debounce.ts
    │   ├── use-clipboard.ts
    │   └── use-media-query.ts
    │
    ├── providers/
    │   └── module-provider.tsx  # ModuleProvider + useModule
    │
    └── utils/
        ├── cn.ts              # clsx + tailwind-merge
        ├── cva.ts             # re-export CVA for consistent usage
        └── format.ts          # formatCurrency, formatDate, formatRelative
```

---

## 4. CSS Token Foundation (`tokens.css`)

This file is the single source of truth. Imported once in each app's root layout. All components reference these variables — never hardcoded values.

> **Source of truth.** These tokens are the binding contract for every component. `packages/ui/src/tokens.css` must mirror this list exactly — when this doc changes, that file must be updated in the same change. Any drift between the doc and the file is a bug; reviewers should reject PRs that touch one without the other.

```css
/* ── SPARX BRAND ──────────────────────────────────────────── */
:root {
  --sparx-primary:          #6366F1;
  --sparx-primary-hover:    #4F46E5;
  --sparx-primary-subtle:   #818CF8;
  --sparx-primary-tint:     #EEF2FF;

  /* ── MODULE COLORS ─────────────────────────────────────── */
  --module-storefront:      #6366F1;
  --module-commerce:        #F97316;
  --module-cms:             #14B8A6;
  --module-crm:             #06B6D4;
  --module-email:           #0EA5E9;
  --module-b2b:             #475569;
  --module-ai:              #EC4899;
  --module-dropship:        #10B981;

  /* Active module — set by ModuleProvider, read by components */
  --module-active:          var(--sparx-primary);
  --module-active-tint:     var(--sparx-primary-tint);
  --module-active-text:     #4338CA;

  /* ── NEUTRALS — LIGHT MODE ─────────────────────────────── */
  --color-bg-page:          #FAFAFA;
  --color-bg-surface:       #FFFFFF;
  --color-bg-elevated:      #FFFFFF;
  --color-bg-subtle:        #F4F4F5;
  --color-bg-muted:         #E4E4E7;

  --color-border-default:   #E5E5E5;
  --color-border-strong:    #D4D4D8;
  --color-border-focus:     #6366F1;

  --color-text-primary:     #0A0A0A;
  --color-text-secondary:   #52525B;
  --color-text-tertiary:    #A1A1AA;
  --color-text-muted:       #71717A;  /* Sits between secondary and tertiary; used for neutral metadata, trend=neutral, hint text */
  --color-text-disabled:    #D4D4D8;
  --color-text-inverse:     #FFFFFF;

  /* ── SEMANTIC ───────────────────────────────────────────── */
  --color-success:          #10B981;
  --color-success-tint:     #ECFDF5;
  --color-success-text:     #065F46;

  --color-warning:          #F59E0B;
  --color-warning-tint:     #FFFBEB;
  --color-warning-text:     #92400E;

  --color-danger:           #EF4444;
  --color-danger-tint:      #FEF2F2;
  --color-danger-text:      #991B1B;

  /* ── TYPOGRAPHY ─────────────────────────────────────────── */
  --font-sans:    'Geist', 'Inter', system-ui, sans-serif;
  --font-mono:    'Geist Mono', 'JetBrains Mono', monospace;

  --text-xs:      0.6875rem;   /* 11px */
  --text-sm:      0.8125rem;   /* 13px */
  --text-base:    0.9375rem;   /* 15px */
  --text-lg:      1.0625rem;   /* 17px */
  --text-xl:      1.25rem;     /* 20px */
  --text-2xl:     1.5rem;      /* 24px */
  --text-3xl:     1.875rem;    /* 30px */
  --text-4xl:     2.25rem;     /* 36px */

  --weight-regular: 400;
  --weight-medium:  500;

  --leading-tight:    1.2;
  --leading-normal:   1.5;
  --leading-relaxed:  1.625;

  --tracking-tight:   -0.025em;
  --tracking-wide:    0.05em;
  --tracking-wider:   0.08em;

  /* ── SPACING ─────────────────────────────────────────────── */
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-5:  1.25rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* ── RADIUS ──────────────────────────────────────────────── */
  --radius-sm:    4px;
  --radius-md:    6px;
  --radius-lg:    8px;
  --radius-xl:    12px;
  --radius-full:  9999px;

  /* ── SHADOWS ─────────────────────────────────────────────── */
  --shadow-sm:    0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:    0 2px 8px 0 rgb(0 0 0 / 0.08);
  --shadow-lg:    0 10px 24px -6px rgb(0 0 0 / 0.12);
  --shadow-focus: 0 0 0 3px rgb(99 102 241 / 0.25);

  /* ── TRANSITIONS ─────────────────────────────────────────── */
  --transition-fast:   100ms ease;
  --transition-base:   175ms ease;
  --transition-slow:   250ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── DARK MODE ───────────────────────────────────────────── */
[data-theme="dark"] {
  --color-bg-page:          #0F0F0F;
  --color-bg-surface:       #1A1A1A;
  --color-bg-elevated:      #222222;
  --color-bg-subtle:        #1F1F1F;
  --color-bg-muted:         #2A2A2A;

  --color-border-default:   #2A2A2A;
  --color-border-strong:    #3F3F46;
  --color-border-focus:     #818CF8;

  --color-text-primary:     #F0F0F0;
  --color-text-secondary:   #A1A1AA;
  --color-text-tertiary:    #52525B;
  --color-text-muted:       #8A8A93;
  --color-text-disabled:    #3F3F46;
  --color-text-inverse:     #0A0A0A;

  --sparx-primary-tint:     #1E1B4B;
}
```

---

## 5. Tailwind Config

Tailwind is configured to use CSS variables as its design tokens. This means Tailwind's `bg-primary` maps to `var(--sparx-primary)`.

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './apps/**/*.{ts,tsx}',
    './packages/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        primary:  'var(--sparx-primary)',
        // Module — active module color (shifts with ModuleProvider)
        module:   'var(--module-active)',
        // Semantic
        success:  'var(--color-success)',
        warning:  'var(--color-warning)',
        danger:   'var(--color-danger)',
        // Surfaces
        page:     'var(--color-bg-page)',
        surface:  'var(--color-bg-surface)',
        elevated: 'var(--color-bg-elevated)',
        subtle:   'var(--color-bg-subtle)',
        muted:    'var(--color-bg-muted)',
        // Text
        foreground:       'var(--color-text-primary)',
        'foreground-muted': 'var(--color-text-secondary)',
        // Border
        border:   'var(--color-border-default)',
        'border-strong': 'var(--color-border-strong)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      spacing: {
        // extends Tailwind's default spacing scale
        // custom values via CSS variables where needed
      },
      boxShadow: {
        sm:    'var(--shadow-sm)',
        md:    'var(--shadow-md)',
        lg:    'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '175ms',
        slow: '250ms',
      },
    },
  },
  plugins: [],
} satisfies Config
```

---

## 6. The CVA Pattern

Every component uses CVA to define its variants. This is the contract between the component library and feature code.

### Anatomy of a CVA Component

```typescript
// packages/ui/components/primitives/button.tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

// ── 1. Variant definition (the only place Tailwind lives) ──
const buttonVariants = cva(
  // Base — applied to every instance regardless of variant
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-md text-sm font-medium',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-40',
    'select-none whitespace-nowrap',
  ],
  {
    variants: {
      variant: {
        // Standard variants
        primary:   'bg-[var(--sparx-primary)] text-white hover:bg-[var(--sparx-primary-hover)]',
        secondary: 'border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]',
        ghost:     'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
        link:      'text-[var(--sparx-primary)] underline-offset-4 hover:underline p-0 h-auto',
        danger:    'bg-[var(--color-danger)] text-white hover:opacity-90',

        // Module variant — uses active module color from CSS context
        // Shifts automatically when inside a ModuleProvider
        module:    'bg-[var(--module-active)] text-white hover:opacity-90',
        'module-outline': 'border border-[var(--module-active)] text-[var(--module-active)] hover:bg-[var(--module-active-tint)]',
      },
      size: {
        xs: 'h-7  px-2.5 text-xs',
        sm: 'h-8  px-3   text-sm',
        md: 'h-9  px-4   text-sm',
        lg: 'h-10 px-5   text-base',
        xl: 'h-11 px-6   text-base',
        // Icon-only sizes (square)
        'icon-sm': 'h-8  w-8  p-0',
        'icon-md': 'h-9  w-9  p-0',
        'icon-lg': 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

// ── 2. Props type — extends CVA variants + HTML element ──
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  asChild?: boolean  // Radix slot pattern for polymorphic use
}

// ── 3. Component implementation ──
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading
          ? <Spinner size="sm" className="mr-1" />
          : leftIcon && <span className="shrink-0">{leftIcon}</span>
        }
        {children}
        {rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

---

## 7. ModuleProvider — The Color Context System

The `ModuleProvider` shifts CSS variables for its entire subtree. Components that reference `--module-active` automatically adopt the active module's color. No props, no conditional classes, no work for feature developers.

```typescript
// packages/ui/providers/module-provider.tsx
import React, { createContext, useContext, useMemo } from 'react'

export type SparxModule =
  | 'storefront'
  | 'commerce'
  | 'cms'
  | 'crm'
  | 'email'
  | 'b2b'
  | 'ai'
  | 'dropship'
  | 'platform'  // default — uses sparx primary

const MODULE_COLORS: Record<SparxModule, {
  color: string
  tint: string
  text: string
}> = {
  storefront: { color: '#6366F1', tint: '#EEF2FF', text: '#4338CA' },
  commerce:   { color: '#F97316', tint: '#FFF7ED', text: '#C2410C' },
  cms:        { color: '#14B8A6', tint: '#F0FDFA', text: '#0F766E' },
  crm:        { color: '#06B6D4', tint: '#ECFEFF', text: '#0E7490' },
  email:      { color: '#0EA5E9', tint: '#F0F9FF', text: '#0369A1' },
  b2b:        { color: '#475569', tint: '#F1F5F9', text: '#334155' },
  ai:         { color: '#EC4899', tint: '#FDF2F8', text: '#9D174D' },
  dropship:   { color: '#10B981', tint: '#ECFDF5', text: '#065F46' },
  platform:   { color: '#6366F1', tint: '#EEF2FF', text: '#4338CA' },
}

const ModuleContext = createContext<SparxModule>('platform')

interface ModuleProviderProps {
  module: SparxModule
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function ModuleProvider({ module, children, className, style }: ModuleProviderProps) {
  const colors = MODULE_COLORS[module]

  const cssVars = useMemo(() => ({
    '--module-active':      colors.color,
    '--module-active-tint': colors.tint,
    '--module-active-text': colors.text,
  } as React.CSSProperties), [colors])

  return (
    <ModuleContext.Provider value={module}>
      <div style={{ ...cssVars, ...style }} className={className} data-module={module}>
        {children}
      </div>
    </ModuleContext.Provider>
  )
}

export function useModule(): SparxModule {
  return useContext(ModuleContext)
}
```

### Usage in the Dashboard

```tsx
// apps/dashboard/app/(dashboard)/cms/layout.tsx
import { ModuleProvider } from '@sparx/ui'

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleProvider module="cms">
      {children}
    </ModuleProvider>
  )
}

// Now everything inside cms/ automatically uses teal:
// - Sidebar nav item highlight → teal
// - Card top stripe → teal
// - Active tab underline → teal
// - Module badge → teal
// - Button variant="module" → teal background
// Zero additional work.
```

---

## 8. Core Component Specs

### Card

```typescript
const cardVariants = cva(
  'rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-default)]',
  {
    variants: {
      variant: {
        default:  '',
        module:   'border-t-[3px] border-t-[var(--module-active)] rounded-t-none',
        elevated: 'shadow-md',
        ghost:    'border-transparent bg-transparent',
        subtle:   'bg-[var(--color-bg-subtle)] border-transparent',
      },
      padding: {
        none: '',
        sm:   'p-3',
        md:   'p-4',
        lg:   'p-6',
      },
    },
    defaultVariants: { variant: 'default', padding: 'md' },
  }
)
```

The `module` variant is the 3px stripe pattern. It applies automatically when `variant="module"` — no module color prop needed because `--module-active` comes from CSS context.

### Badge

```typescript
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full text-xs font-medium px-2 py-0.5 whitespace-nowrap',
  {
    variants: {
      variant: {
        default:  'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
        primary:  'bg-[var(--sparx-primary-tint)] text-[var(--sparx-primary)]',
        success:  'bg-[var(--color-success-tint)] text-[var(--color-success-text)]',
        warning:  'bg-[var(--color-warning-tint)] text-[var(--color-warning-text)]',
        danger:   'bg-[var(--color-danger-tint)] text-[var(--color-danger-text)]',
        module:   'bg-[var(--module-active-tint)] text-[var(--module-active-text)]',
        outline:  'border border-[var(--color-border-default)] text-[var(--color-text-secondary)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)
```

### Input

```typescript
const inputVariants = cva(
  [
    'flex w-full rounded-md border bg-[var(--color-bg-surface)]',
    'text-sm text-[var(--color-text-primary)]',
    'placeholder:text-[var(--color-text-tertiary)]',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
  ],
  {
    variants: {
      variant: {
        default: 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]',
        error:   'border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)]',
      },
      size: {
        sm: 'h-8  px-2.5 py-1.5 text-xs',
        md: 'h-9  px-3   py-2',
        lg: 'h-10 px-4   py-2.5 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)
```

### Stat (metric card)

The Stat component is the canonical metric tile for dashboards (revenue, order count, MRR, active customers, etc.). Two required content slots — `value` and `label` — plus an optional `delta` for period-over-period change and an optional `icon` chip. There is no CVA variant axis; trend color is data-driven from `delta.trend`, and the icon chip adopts the active module color automatically.

```typescript
// packages/ui/components/data/stat.tsx
import * as React from 'react'
import { cn } from '../../utils/cn'

export interface StatDelta {
  /** Display string (e.g. "+12.4%", "-3 vs last week") */
  value: string
  /** Drives the color: success / danger / muted */
  trend: 'up' | 'down' | 'neutral'
}

export interface StatProps {
  /** Primary metric — the big number */
  value: string | number
  /** Caption above the value (uppercase, tracking-wider) */
  label: string
  /** Optional period-over-period change */
  delta?: StatDelta
  /** Optional icon chip; renders in active module color */
  icon?: React.ReactNode
  className?: string
}

// Trend → token mapping. Reads bare semantic tokens, not -text variants,
// so the same component works on tinted and untinted backgrounds.
const TREND_COLOR: Record<StatDelta['trend'], string> = {
  up:      'text-[var(--color-success)]',
  down:    'text-[var(--color-danger)]',
  neutral: 'text-[var(--color-text-muted)]',
}

export function Stat({ value, label, delta, icon, className }: StatProps) {
  return (
    <div className={cn(
      'rounded-lg bg-[var(--color-bg-subtle)] p-4',
      className,
    )}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[var(--tracking-wider)] text-[var(--color-text-tertiary)]">
          {label}
        </p>
        {icon && (
          <div className="rounded-md bg-[var(--module-active-tint)] p-1.5 text-[var(--module-active)]">
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl font-medium text-[var(--color-text-primary)]">
        {value}
      </p>
      {delta && (
        <p className={cn('mt-1 text-xs', TREND_COLOR[delta.trend])}>
          {delta.value}
        </p>
      )}
    </div>
  )
}
```

Trend colors deliberately use the bare semantic tokens (`--color-success`, `--color-danger`, `--color-text-muted`) rather than the `-text` variants — Stat sits on a tinted surface, not inside a tint chip, so the stronger saturation reads correctly. The `-text` variants are reserved for foreground text inside `Badge`/`Toast` tinted backgrounds.

---

## 9. Component Inventory

All components to build in `@sparx/ui`. Each follows the CVA pattern above.

### Primitives
| Component | Key variants | Notes |
|-----------|-------------|-------|
| `Button` | primary, secondary, ghost, link, danger, module, module-outline | Sizes: xs, sm, md, lg, xl, icon-sm, icon-md, icon-lg |
| `Badge` | default, primary, success, warning, danger, module, outline | |
| `Input` | default, error | Sizes: sm, md, lg |
| `Textarea` | default, error | |
| `Select` | default, error | Wraps Radix Select |
| `Checkbox` | — | Wraps Radix Checkbox, uses primary color |
| `RadioGroup` | — | Wraps Radix Radio |
| `Switch` | — | Uses primary color, module-aware |
| `Slider` | — | Uses primary/module color |
| `Avatar` | default, initials | Sizes: sm, md, lg; falls back to initials on image error |
| `Spinner` | — | Sizes: sm, md, lg; inherits current color |
| `Skeleton` | — | Pulse animation, used for loading states |
| `Heading` | levels 1–6 | Visual size via `level`; semantic tag via `as` override (e.g. visually H1, semantically H2) |
| `Text` | default, muted, subtle, inverse, danger, success | Sizes: xs, sm, md, lg; `as` polymorphism for `p` / `span` / `div` / `label` |

### Layout
| Component | Key variants | Notes |
|-----------|-------------|-------|
| `Card` | default, module, elevated, ghost, subtle | module = 3px top stripe |
| `CardHeader` | — | Consistent header within Card |
| `CardContent` | — | |
| `CardFooter` | — | Border-top, action area |
| `Stack` | — | Vertical flex with gap prop |
| `Grid` | — | CSS grid with cols + gap props |
| `Divider` | horizontal, vertical | |
| `Container` | sm, md, lg, xl, full | Max-width containers |
| `ScrollArea` | — | Wraps Radix ScrollArea |

### Overlay
| Component | Key variants | Notes |
|-----------|-------------|-------|
| `Modal` | sm, md, lg, xl | Wraps Radix Dialog |
| `Drawer` | left, right | Wraps Radix Dialog with slide animation |
| `Popover` | — | Wraps Radix Popover |
| `Tooltip` | — | Wraps Radix Tooltip |
| `Toast` | success, warning, danger, info | Via sonner |
| `AlertDialog` | — | Wraps Radix AlertDialog — destructive confirm |
| `DropdownMenu` | — | Wraps Radix DropdownMenu |
| `ContextMenu` | — | Wraps Radix ContextMenu |
| `CommandPalette` | — | ⌘K global search — wraps cmdk |

### Navigation
| Component | Key variants | Notes |
|-----------|-------------|-------|
| `Sidebar` | — | Dashboard sidebar shell |
| `SidebarItem` | default, active | Uses --module-active for active state |
| `Tabs` | default, pills | Wraps Radix Tabs |
| `Breadcrumb` | — | |
| `Pagination` | — | |
| `Stepper` | — | Multi-step flows (onboarding) |

### Data Display
| Component | Key variants | Notes |
|-----------|-------------|-------|
| `Table` | — | Wraps TanStack Table |
| `Stat` | — | Metric card — see spec above |
| `Timeline` | — | Activity feed, order history |
| `EmptyState` | — | Consistent zero-state UI |
| `Code` | — | Inline and block code |
| `Tag` | — | Removable chip/tag for filters |

### Form
| Component | Notes |
|-----------|-------|
| `Form` | Wraps React Hook Form + Zod |
| `FormField` | Label + Input + Error message — composes primitives |
| `DatePicker` | Calendar popover |
| `FileUpload` | Drag-and-drop zone |
| `ColorPicker` | For theme customization |
| `RichTextEditor` | TipTap wrapper |

---

## 10. The `cn()` Utility

```typescript
// packages/ui/utils/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

This is the only place class manipulation happens. It handles:
- Conditional classes (`cn('base', isActive && 'active')`)
- Tailwind class deduplication (`cn('px-4', 'px-6')` → `'px-6'`)
- Array and object class syntax

Feature code never calls `cn()`. Only component internals use it.

---

## 11. Shadcn Initialization

Run this once in the monorepo root to bootstrap the component shell:

```bash
cd packages/ui
npx shadcn@latest init

# When prompted:
# Style: Default
# Base color: Neutral  (we replace with our own tokens immediately after)
# CSS variables: Yes
# Tailwind config: tailwind.config.ts (shared)
# Components directory: ./components
# Utils directory: ./utils

# Then add components we need:
npx shadcn@latest add button card badge input select checkbox switch
npx shadcn@latest add dialog drawer popover tooltip alert-dialog
npx shadcn@latest add tabs scroll-area separator avatar
npx shadcn@latest add dropdown-menu context-menu
```

**Immediately after `shadcn init`:**
1. Replace `globals.css` content with `tokens.css` content
2. Update `tailwind.config.ts` with the token bridge above
3. Gut the Shadcn color variables in the CSS — replace with our own
4. Modify each component's CVA definition to use `var(--...)` tokens instead of Shadcn's `hsl(var(--...))` pattern
5. Add the `module` and `module-outline` variants to `Button`
6. Add the `module` variant to `Card`, `Badge`, `Switch`

---

## 12. Naming Conventions

### Variants
- **Semantic, not descriptive.** `variant="danger"` not `variant="red"`. `variant="module"` not `variant="teal"`.
- **Three standard tiers:** `primary` (strong action), `secondary` (alternative action), `ghost` (tertiary/quiet).
- **Module-aware:** Components that can adopt the active module color expose `variant="module"`.
- **Status:** `success`, `warning`, `danger`, `info` for state communication.

### Sizes
- Standard: `xs`, `sm`, `md`, `lg`, `xl`
- Icon-only: `icon-sm`, `icon-md`, `icon-lg`
- `md` is always the default.

### Props
- Boolean props: `loading`, `disabled`, `readOnly`, `required` — never `isLoading`, `isDisabled`
- Content props: `children`, `label`, `description`, `placeholder`
- Icon props: `leftIcon`, `rightIcon`, `icon` (for icon-only)
- Callback props: `onChange`, `onSubmit`, `onClose` — standard React conventions

---

## 13. Responsive Design

**Every Sparx UI is mobile-first. A surface that doesn't work on a phone is a bug, not a "later" item.** The marketing site, the merchant dashboard, and the storefronts all have to render and remain usable from 320px up to 2560px wide. This is binding for any new feature or page.

### Breakpoints

Three named breakpoints. They're declared in [tokens.css](../packages/ui/src/tokens.css) and reused everywhere — never hardcode pixel widths in `@media` queries inside feature components.

| Name      | Range            | Typical device          |
|-----------|------------------|-------------------------|
| `mobile`  | ≤ 640px          | phones (portrait)       |
| `tablet`  | 641px – 1024px   | tablets, small laptops  |
| `desktop` | > 1024px         | laptops, monitors       |

### Mechanism — two tools, in this order

**1. `clamp()`-based responsive tokens (first choice).** Gutters, type scale, vertical section padding, and any value that should scale fluidly with viewport live in [tokens.css](../packages/ui/src/tokens.css) as `clamp(min, preferred, max)` expressions. Components reference the token; they don't see the breakpoint logic. Example:

```css
:root {
  --gutter-page: clamp(20px, 5vw, 80px);
  --section-py-lg: clamp(80px, 12vw, 140px);
  --display-hero: clamp(48px, 10vw, 120px);
}
```

This handles roughly half of all responsive concerns with zero per-component code.

**2. Named layout classes in `marketing.css` / `app.css` (for structural changes).** Things `clamp()` can't fix — collapsing a 4-column grid to 1 column, hiding the desktop nav, stacking a side-by-side layout — get semantic class names in a small per-app stylesheet. Apply via `className`. The §1 rule bans raw *Tailwind utilities* in feature code; named layout primitives are fine.

```css
/* apps/web/app/marketing.css */
.grid-4-2-1 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
@media (max-width: 1024px) { .grid-4-2-1 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px)  { .grid-4-2-1 { grid-template-columns: 1fr; } }

.stack-on-mobile { display: flex; gap: 32px; }
@media (max-width: 768px) { .stack-on-mobile { flex-direction: column; } }

.hide-on-mobile { display: initial; }
@media (max-width: 640px) { .hide-on-mobile { display: none; } }
```

### Anti-patterns

- ❌ **Inline `@media` queries.** Inline `style={}` can't express media queries — don't try to fake it with `window.innerWidth` reads.
- ❌ **Hardcoded breakpoint pixels in components.** `if (width < 768)` belongs in the stylesheet, not the JSX.
- ❌ **Desktop-first thinking.** Don't author at 1440px and bolt on mobile fixes — the smaller layout is the base case.
- ❌ **Hidden content on mobile.** Hiding marketing copy or pricing on mobile is a content decision, not a layout one. Reflow it; don't drop it.

### Verification

Every new page or feature must be visually verified at **three viewports** before being marked done: 375px (mobile), 768px (tablet), 1440px (desktop). For marketing pages, also check 2560px to confirm the `Container` max-width holds.

---

## 14. Dark Mode

Dark mode is toggled by setting `data-theme="dark"` on the `<html>` element. All tokens shift automatically via the CSS variable overrides in `tokens.css`. Components never implement their own dark mode logic — it's handled entirely at the token level.

```typescript
// apps/dashboard/app/providers.tsx
function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Reads from localStorage or system preference
  const { theme } = useTheme()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return <>{children}</>
}
```

---

## 15. Usage Rules for Feature Developers

These are enforced by ESLint (`no-restricted-syntax` rule on Tailwind classes outside `packages/ui`):

```
✅ Use named component variants
✅ Use layout props (gap, padding, cols)
✅ Use className only for layout overrides (margin, width) when absolutely necessary
✅ Reference CSS variables via style prop for truly one-off values

❌ Never write Tailwind utility classes in feature code
❌ Never write inline styles with hardcoded hex colors
❌ Never import CSS variables directly into components outside @sparx/ui
❌ Never create a one-off styled div instead of an existing component
```

### ESLint Enforcement

```javascript
// .eslintrc.js — applied to apps/** but not packages/ui/**
{
  rules: {
    'no-restricted-syntax': [
      'warn',
      {
        // Warn on className with multiple Tailwind utilities in feature code
        selector: 'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/\\b(bg-|text-|border-|p-|m-|flex|grid|rounded).*(bg-|text-|border-|p-|m-|flex|grid|rounded)/]',
        message: 'Use @sparx/ui components instead of composing Tailwind classes in feature code.'
      }
    ]
  }
}
```

---

## 16. Claude Code Scaffold Instructions

When Claude Code scaffolds the `@sparx/ui` package, it should:

1. Create the directory structure exactly as specified in section 3
2. Initialize with `pnpm init` and set `name: "@sparx/ui"`
3. Run the Shadcn init and component add commands from section 11
4. Replace the Shadcn CSS with `tokens.css` from section 4
5. Update `tailwind.config.ts` per section 5
6. Modify each Shadcn component to use CSS variable tokens (not Shadcn's HSL variables)
7. Add `module` and `module-outline` variants to Button
8. Add `module` variant to Card, Badge, Switch
9. Create `ModuleProvider` per section 7
10. Create `cn.ts` utility per section 10
11. Create barrel export `index.ts` exporting all components
12. Add workspace reference in root `package.json`: `"@sparx/ui": "workspace:*"`
13. Import `@sparx/ui/tokens.css` in each app's root layout
14. Wrap each dashboard module layout in `<ModuleProvider module="{module}">`

The goal: feature code in apps/ should never contain a Tailwind class. If it does, something went wrong.
