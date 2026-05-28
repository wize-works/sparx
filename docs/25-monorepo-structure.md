# Sparx Platform — Monorepo Structure

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

TypeScript monorepo managed with pnpm workspaces + Turborepo. All apps and packages in a single repository.

> **Package manager:** pnpm 9+ | **Node:** 20 LTS | **TypeScript:** 5.4+ strict
>
> ⚠️ These version pins are from the v2 spec as written. The repo's [CLAUDE.md](../CLAUDE.md), [.nvmrc](../.nvmrc), and [tsconfig.base.json](../tsconfig.base.json) reflect the current pins (Node 24, TS 5.7). Treat those as authoritative — this section is a v2 historical baseline.

---

## 2. Directory Structure

```
sparx/
├── pnpm-workspace.yaml
├── package.json              # root scripts, devDependencies
├── turbo.json                # Turborepo pipeline
├── tsconfig.base.json        # shared TS config
├── .eslintrc.base.js
├── .prettierrc
├── .nvmrc                    # Node 20 (see §1 caveat)
├── .env.example              # all env var keys, no values
│
├── apps/
│   ├── web/                  # @sparx/web — sparx.works marketing site (Next.js)
│   ├── dashboard/            # @sparx/dashboard — app.sparx.works merchant admin (Next.js)
│   ├── storefront/           # @sparx/storefront — multi-tenant merchant storefronts (Next.js)
│   └── api/                  # @sparx/api — Fastify REST + GraphQL + MCP server
│
├── packages/
│   ├── ui/                   # @sparx/ui — component library (CVA + Shadcn + ModuleProvider)
│   ├── db/                   # @sparx/db — Prisma client + schema + migrations
│   ├── auth/                 # @sparx/auth — Better Auth config (staff + customer layers)
│   ├── email/                # @sparx/email — React Email templates + Postal client
│   ├── sdk/                  # @sparx/sdk — public storefront SDK
│   ├── config/               # @sparx/config — shared ESLint, Prettier, TS, Tailwind configs
│   └── types/                # @sparx/types — shared TypeScript types
│
├── workers/
│   ├── email/                # @sparx/worker-email — Pub/Sub → Postal
│   ├── domain/               # @sparx/worker-domain — CNAME validation + SSL
│   ├── dropship/             # @sparx/worker-dropship — supplier catalog sync
│   ├── billing/              # @sparx/worker-billing — Stripe webhooks + renewals
│   └── search/               # @sparx/worker-search — Typesense sync
│
├── k8s/
│   ├── sparx-prod/           # Kubernetes manifests (namespace, redis, typesense, postal, caddy, api, dashboard, storefront, web, workers)
│   └── sparx-staging/        # mirrors prod
│
├── infrastructure/           # Terraform (gke, cloudsql, pubsub, gcs, secrets modules)
│
└── .github/workflows/
    ├── ci.yml                # lint + typecheck + test on PR
    ├── deploy-staging.yml    # auto on merge to main
    └── deploy-prod.yml       # auto on release tag
```

---

## 3. Dashboard App Structure (`apps/dashboard`)

```
middleware.ts                 # Better Auth session validation
app/
├── layout.tsx                # imports @sparx/ui/tokens.css
├── (auth)/                   # login, register, forgot-password
├── (onboarding)/
│   ├── step-1/page.tsx       # business info
│   ├── step-2/page.tsx       # theme selection
│   ├── step-3/page.tsx       # first product or dropship
│   ├── step-4/page.tsx       # domain (purchase or connect) — GoDaddy integrated
│   └── step-5/page.tsx       # payments (Stripe connect)
└── (dashboard)/
    ├── layout.tsx            # sidebar shell
    ├── page.tsx              # home / overview stats
    ├── storefront/layout.tsx # <ModuleProvider module="storefront">
    ├── commerce/layout.tsx   # <ModuleProvider module="commerce">
    │   ├── products/page.tsx + [id]/page.tsx
    │   └── orders/page.tsx + [id]/page.tsx
    ├── cms/layout.tsx        # <ModuleProvider module="cms">
    ├── crm/layout.tsx        # <ModuleProvider module="crm">
    │   ├── customers/page.tsx + [id]/page.tsx
    │   └── pipeline/page.tsx
    ├── email/layout.tsx      # <ModuleProvider module="email">
    ├── b2b/layout.tsx        # <ModuleProvider module="b2b">
    ├── ai/layout.tsx         # <ModuleProvider module="ai">
    ├── dropship/layout.tsx   # <ModuleProvider module="dropship">
    ├── domains/page.tsx      # domain purchase + management
    ├── analytics/page.tsx
    └── settings/             # general, billing, staff, domains, ai
```

---

## 4. `@sparx/ui` Package Structure

```
tokens.css                    # ALL CSS custom properties (single source of truth)
index.ts                      # barrel export
module-provider.tsx           # ModuleProvider + useModule hook

components/primitives/        # Button (module variant), Badge (module variant),
                              # Input, Textarea, Select, Checkbox, RadioGroup,
                              # Switch (module variant), Slider, Avatar, Spinner, Skeleton

components/layout/            # Card (module variant = 3px stripe), Stack, Grid,
                              # Divider, Container, ScrollArea

components/overlay/           # Modal, Drawer, Popover, Tooltip, Toast (sonner),
                              # AlertDialog, DropdownMenu, ContextMenu,
                              # CommandPalette (cmdk, ⌘K global search)

components/navigation/        # Sidebar, SidebarItem (module-aware active state),
                              # Tabs, Breadcrumb, Pagination, Stepper

components/data/              # Table (TanStack), Stat, Timeline, EmptyState, Code, Tag

components/form/              # Form (RHF+Zod), FormField, DatePicker, FileUpload,
                              # ColorPicker, RichTextEditor (TipTap)

utils/cn.ts                   # clsx + tailwind-merge
utils/cva.ts                  # re-export CVA
utils/format.ts               # formatCurrency, formatDate, formatRelative
```

---

## 5. API Structure (`apps/api`)

```
src/
├── index.ts                  # server entry point
├── app.ts                    # Fastify app setup
├── auth/                     # Better Auth config + middleware
├── routes/                   # auth, products, orders, customers, domains,
│                             # email, b2b, dropship, billing, search, analytics, webhooks
├── services/
│   ├── domain/               # godaddy.client.ts, availability.ts, purchase.ts
│   ├── search/               # typesense.client.ts, product.search.ts, customer.search.ts
│   ├── email/                # postal.client.ts
│   └── billing/              # stripe.client.ts
├── graphql/                  # Pothos schema + resolvers
└── mcp/                      # MCP server + tools (orders, customers, analytics, email, products, domains)
```

---

## 6. Root `package.json` Scripts

- `build`, `dev`, `lint`, `typecheck`, `test`, `test:e2e`, `clean`
- `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:studio`
- `ui:add` (`pnpm --filter @sparx/ui shadcn add`)
- `search:init`, `search:reindex`

---

## 7. `turbo.json` Tasks

| Task        | Settings                                          |
| ----------- | ------------------------------------------------- |
| `build`     | `dependsOn: ^build`, outputs `.next/**` `dist/**` |
| `dev`       | `cache: false`, `persistent: true`                |
| `lint`      | `dependsOn: ^build`                               |
| `typecheck` | `dependsOn: ^build`                               |
| `test`      | `dependsOn: ^build`, outputs `coverage/**`        |
| `test:e2e`  | `dependsOn: build`, `cache: false`                |

---

## 8. `tsconfig.base.json` Key Settings

- `target: ES2022`, `moduleResolution: Bundler`, `strict: true`
- `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- `noImplicitReturns: true`, `isolatedModules: true`
- `declaration: true`, `declarationMap: true`, `sourceMap: true`

---

## 9. Workspace Dependencies

| Workspace    | Depends on                                                 |
| ------------ | ---------------------------------------------------------- | --- | ----- |
| `dashboard`  | `@sparx/ui`, `@sparx/auth`, `@sparx/db`, `@sparx/types`    |
| `api`        | `@sparx/db`, `@sparx/auth`, `@sparx/email`, `@sparx/types` |
| `storefront` | `@sparx/ui`, `@sparx/sdk`, `@sparx/types`                  |
| `ui`         | `@sparx/types` (peerDeps: `react ^18                       |     | ^19`) |

All internal: `"workspace:*"`

---

## 10. Environment Variables (`.env.example` keys)

```
DATABASE_URL | REDIS_URL | BETTER_AUTH_SECRET | BETTER_AUTH_URL
STRIPE_SECRET_KEY | STRIPE_WEBHOOK_SECRET | STRIPE_PUBLISHABLE_KEY
GODADDY_API_KEY | GODADDY_API_SECRET | GODADDY_ENV (ote|production)
TYPESENSE_API_KEY | TYPESENSE_HOST | TYPESENSE_PORT
POSTAL_API_KEY | POSTAL_API_URL
GCS_BUCKET | GOOGLE_CLOUD_PROJECT | PUBSUB_TOPIC_PREFIX
CLOUDFLARE_API_TOKEN | CLOUDFLARE_ZONE_ID
NEXT_PUBLIC_APP_URL | NEXT_PUBLIC_API_URL | NEXT_PUBLIC_STOREFRONT_URL
```

---

## 11. Dev Server Ports

| Service      | Port |
| ------------ | ---- |
| `api`        | 3000 |
| `dashboard`  | 3001 |
| `storefront` | 3002 |
| `web`        | 3003 |
| Typesense    | 8108 |
| Redis        | 6379 |
| PostgreSQL   | 5432 |

---

## 12. Build Order (Turborepo handles automatically)

1. `@sparx/types` (no deps)
2. `@sparx/config` (no deps)
3. `@sparx/db` (types)
4. `@sparx/auth` (db, types)
5. `@sparx/email` (types)
6. `@sparx/ui` (types)
7. `@sparx/sdk` (types)
8. `@sparx/api` (db, auth, email, types)
9. `apps/web` (ui, types)
10. `apps/dashboard` (ui, auth, db, types)
11. `apps/storefront` (ui, sdk, types)
12. `workers/*` (db, email, types)

---

## 13. Claude Code Bootstrap Order

1. Root config files (`turbo.json`, `tsconfig.base.json`, `.eslintrc`, `.prettierrc`, `.nvmrc`, `.env.example`, `.gitignore`)
2. `packages/config` — shared configs
3. `packages/types` — shared types (must exist before anything else)
4. `packages/db` — Prisma schema from doc [05](05-data-model.md), run `prisma generate`
5. `packages/auth` — Better Auth per doc [16](16-auth-security.md) (two layers: staff organizations + customer tenant-scoped)
6. **`packages/ui` — PRIORITY.** Follow doc [23](23-frontend-component-architecture.md) exactly. Order: `tokens.css` → `cn.ts` → `module-provider.tsx` → `button.tsx` → `card.tsx` → `badge.tsx` → rest
7. `apps/api` — Fastify, Better Auth middleware, all routes, Typesense, GoDaddy, Postal
8. `apps/dashboard` — Next.js App Router, `tokens.css` in root layout, `ModuleProvider` per module section
9. `apps/web` — Next.js marketing site, `@sparx/ui` components
10. `apps/storefront` — Next.js, tenant resolution middleware, theme CSS vars
11. `workers/` — five Node.js Pub/Sub consumer processes
12. `k8s/` and `infrastructure/` — manifests and Terraform
