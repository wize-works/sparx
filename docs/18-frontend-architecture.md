# WizeWorks Platform — Frontend Architecture

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

WizeWorks has three frontend applications sharing a common design system and component library:

1. **Merchant Dashboard** — Admin interface for managing the store (Next.js)
2. **Storefront** — Customer-facing store (Next.js, multi-tenant, theme-driven)
3. **B2B Portal** — Wholesale/fleet account portal (Next.js)

All three consume the WizeWorks REST/GraphQL API and share the `@sparx/ui` component library.

---

## 2. Technology Stack

| Concern         | Technology                      | Rationale                                                |
| --------------- | ------------------------------- | -------------------------------------------------------- |
| Framework       | Next.js 15 (App Router)         | SSR/SSG, edge rendering, streaming, image optimization   |
| Language        | TypeScript (strict)             | Type safety, better DX, fewer runtime errors             |
| Styling         | Tailwind CSS 4                  | Utility-first, design tokens, no runtime overhead        |
| State (server)  | React Query (TanStack)          | Cache management, background refetch, optimistic updates |
| State (client)  | Zustand                         | Lightweight, no boilerplate, works with SSR              |
| Forms           | React Hook Form + Zod           | Performant, type-safe validation                         |
| Components      | Radix UI primitives             | Accessible, unstyled, composable                         |
| Icons           | Lucide React                    | Consistent, tree-shakeable                               |
| Rich text       | TipTap                          | ProseMirror-based, extensible                            |
| Charts          | Recharts                        | React-native, composable                                 |
| Tables          | TanStack Table                  | Headless, powerful, flexible                             |
| Drag & drop     | dnd-kit                         | Accessible, touch support                                |
| Email templates | React Email                     | Component-based, preview in browser                      |
| Testing         | Playwright (E2E), Vitest (unit) | Fast, modern, excellent TS support                       |

---

## 3. Monorepo Structure

```
apps/
├── dashboard/              # Merchant admin (Next.js)
├── storefront/             # Customer storefront (Next.js, multi-tenant)
└── b2b-portal/             # B2B wholesale portal (Next.js)

packages/
├── ui/                     # Shared component library
│   ├── components/         # Button, Input, Modal, Table, Badge, etc.
│   ├── hooks/              # useDebounce, useMediaQuery, useClipboard, etc.
│   └── utils/              # cn(), formatCurrency(), formatDate(), etc.
├── api-client/             # Type-safe API client (generated from OpenAPI)
├── storefront-sdk/         # Public SDK for headless storefronts
├── email-templates/        # React Email templates
├── theme-engine/           # Theme rendering, CSS variable generation
└── types/                  # Shared TypeScript types (DTOs, enums)
```

---

## 4. Design System

### Design Tokens (CSS Custom Properties)

Defined in `packages/ui/tokens.css`:

```css
:root {
  /* Colors */
  --color-primary: hsl(221, 83%, 53%);
  --color-primary-hover: hsl(221, 83%, 48%);
  --color-danger: hsl(0, 84%, 60%);
  --color-success: hsl(142, 71%, 45%);
  --color-warning: hsl(38, 92%, 50%);

  /* Neutral scale */
  --color-gray-50: hsl(210, 40%, 98%);
  --color-gray-100: hsl(210, 40%, 96%);
  --color-gray-900: hsl(222, 47%, 11%);

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;

  /* Spacing */
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-8: 2rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

[data-theme='dark'] {
  /* Dark mode overrides */
}
```

### Theme Overrides (Merchant Themes)

Merchant themes override the base tokens via CSS custom properties on the `:root` of their storefront:

```css
/* Industrial theme (Gillett Diesel) */
:root {
  --color-primary: hsl(0, 80%, 40%); /* GDS red */
  --color-background: hsl(0, 0%, 4%); /* Near black */
  --color-surface: hsl(0, 0%, 11%); /* Dark charcoal */
  --font-sans: 'Bebas Neue', 'Inter', sans-serif;
}
```

---

## 5. Component Library (`@sparx/ui`)

> See [docs/23-frontend-component-architecture.md](23-frontend-component-architecture.md) for the authoritative component spec (CVA pattern, ModuleProvider, full inventory). This section is a summary.

### Core Components

**Layout:**
Container, Grid, Stack, Flex, Divider, ScrollArea

**Inputs:**
Button, Input, Textarea, Select, Checkbox, RadioGroup, Switch, Slider, DatePicker, FilePicker, RichTextEditor, ColorPicker

**Feedback:**
Toast, Alert, Badge, Spinner, Progress, Skeleton, EmptyState, ErrorBoundary

**Overlay:**
Modal, Dialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu

**Data Display:**
Table, DataGrid, Avatar, Card, Stat, Timeline, Tag, Code

**Navigation:**
Sidebar, Breadcrumb, Tabs, Pagination, Stepper, NavMenu

### Component Conventions

```typescript
// All components follow this pattern:
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), props.className)}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && <Spinner size="sm" />}
        {children}
      </button>
    )
  }
)
```

---

## 6. Merchant Dashboard

### App Router Structure

```
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── forgot-password/page.tsx
├── (onboarding)/
│   ├── step-1/page.tsx          # Business info
│   ├── step-2/page.tsx          # Theme selection
│   ├── step-3/page.tsx          # First product
│   ├── step-4/page.tsx          # Domain
│   └── step-5/page.tsx          # Payments
└── (dashboard)/
    ├── layout.tsx                # Sidebar + topbar shell
    ├── page.tsx                  # Dashboard home (stats, tasks)
    ├── products/
    │   ├── page.tsx              # Product list
    │   └── [id]/page.tsx         # Product editor
    ├── orders/
    │   ├── page.tsx              # Order list
    │   └── [id]/page.tsx         # Order detail
    ├── customers/
    │   ├── page.tsx              # Customer list
    │   └── [id]/page.tsx         # Customer record + CRM
    ├── crm/
    │   ├── pipeline/page.tsx     # Kanban pipeline
    │   └── tasks/page.tsx        # Task list
    ├── email/
    │   ├── automations/page.tsx
    │   ├── templates/page.tsx
    │   └── broadcasts/page.tsx
    ├── content/
    │   ├── pages/page.tsx
    │   └── blog/page.tsx
    ├── dropship/page.tsx
    ├── analytics/page.tsx
    ├── b2b/
    │   ├── accounts/page.tsx
    │   └── quotes/page.tsx
    ├── domains/page.tsx
    └── settings/
        ├── general/page.tsx
        ├── billing/page.tsx
        ├── staff/page.tsx
        └── ai/page.tsx
```

### Data Fetching Strategy

- Server Components for initial page data (no loading flash)
- Client Components for interactive elements
- React Query for client-side mutations and real-time updates
- Optimistic updates for common actions (order status change, toggle)

---

## 7. Storefront (Multi-Tenant)

### Tenant Resolution

The storefront resolves the correct tenant from the request's `Host` header:

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  const tenant = await resolveTenant(host); // DB lookup, cached in Redis

  if (!tenant) return NextResponse.rewrite(new URL('/not-found', request.url));

  const response = NextResponse.next();
  response.headers.set('x-tenant-id', tenant.id);
  response.headers.set('x-tenant-theme', tenant.theme);
  return response;
}
```

### Theme Rendering

Each storefront page reads the tenant's theme configuration and generates CSS variables:

```typescript
// app/layout.tsx
export default async function RootLayout({ children }) {
  const tenant = await getTenantFromHeaders()
  const themeVars = generateThemeVars(tenant.settings.theme)

  return (
    <html>
      <head>
        <style>{`:root { ${themeVars} }`}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
```

### Caching Strategy

- Product pages: ISR (Incremental Static Regeneration), revalidate every 60s
- Collection pages: ISR, revalidate every 300s
- Cart: no caching (always fresh)
- Customer account: no caching (private)
- CMS pages: ISR, revalidate on publish

---

## 8. Performance

### Core Web Vitals Targets

| Metric    | Target  | Strategy                                     |
| --------- | ------- | -------------------------------------------- |
| LCP       | < 2.5s  | Image optimization, CDN, ISR                 |
| FID / INP | < 100ms | Code splitting, minimal JS                   |
| CLS       | < 0.1   | Explicit image dimensions, font display swap |
| TTFB      | < 200ms | Edge caching, regional deployment            |

### Optimization Techniques

- `next/image` for automatic WebP, lazy load, blur placeholder
- Dynamic imports for heavy components (rich text editor, charts)
- Route-level code splitting (automatic in Next.js App Router)
- Bundle analysis in CI (fail if bundle exceeds threshold)
- Font subsetting via `next/font`
- Prefetch on hover for predictive navigation

---

## 9. Testing

### Unit Tests (Vitest)

- Component rendering tests
- Hook logic tests
- Utility function tests
- Coverage threshold: 80% for UI package

### E2E Tests (Playwright)

Key flows tested on every deploy to staging:

- Merchant signup → onboarding → live store
- Add product → publish
- Place order as customer → checkout
- Order fulfillment flow
- Custom domain setup flow
- Email automation trigger

### Accessibility

- Radix UI primitives are ARIA-compliant by default
- Keyboard navigation tested in E2E suite
- Color contrast ratios meet WCAG AA
- `axe-playwright` accessibility scan in CI
