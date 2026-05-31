# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

The repo is in **early scaffold phase**: design docs under [docs/](docs/) plus the monorepo shell. `apps/*` are empty placeholders; `packages/ui` (`@sparx/ui`) has its skeleton (tokens, ModuleProvider, `cn()`, barrel) but no actual components yet — those land via Shadcn init per [docs/23-frontend-component-architecture.md](docs/23-frontend-component-architecture.md) §11.

**Stack** (per [docs/02-architecture-overview.md](docs/02-architecture-overview.md), [docs/18-frontend-architecture.md](docs/18-frontend-architecture.md), [docs/23-frontend-component-architecture.md](docs/23-frontend-component-architecture.md)): Node.js 24, TypeScript 5.7 (strict), Fastify, Prisma, Next.js 16 (App Router), React 19, Tailwind CSS 4, Vitest, Playwright. Deployed to GKE.

**Tooling decisions made:** pnpm workspaces + Turborepo, ESLint flat config + Prettier (with `prettier-plugin-tailwindcss`), TypeScript project references off [tsconfig.base.json](tsconfig.base.json). Node version pinned in [.nvmrc](.nvmrc).

### Common commands

| Command                            | Purpose                                            |
| ---------------------------------- | -------------------------------------------------- |
| `pnpm install`                     | Install all workspace dependencies                 |
| `pnpm dev`                         | Run all `dev` tasks (Turborepo, persistent)        |
| `pnpm build`                       | Build everything (`turbo run build`)               |
| `pnpm lint`                        | Lint everything                                    |
| `pnpm typecheck`                   | Type-check everything                              |
| `pnpm test`                        | Run tests (Vitest in packages, Playwright in apps) |
| `pnpm format`                      | Format with Prettier                               |
| `pnpm --filter @sparx/ui <script>` | Run a script in a single workspace                 |

Nothing has been `pnpm install`ed yet — the first time anyone clones, they need to run it. Don't claim builds/tests pass without actually running them.

### Pre-push guard

`pnpm install` wires `git config core.hooksPath .githooks` (via the root `prepare` script), which enables [.githooks/pre-push](.githooks/pre-push). Every `git push` first runs `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck` against the working tree. A red local check blocks the push — this is intentional: CI on `main` is the production tripwire, not a debugging surface. Bypass deliberately with `git push --no-verify` if you really need to (e.g. recovering from a hook bug).

## What this product is

Sparx (sparx.works) is WizeWorks' modular commerce OS — a single platform combining storefront, commerce, CRM, CMS, email, B2B/wholesale, dropship, and MCP/AI integration. Modules activate independently; a merchant pays only for what they use. The first Enterprise client driving the initial feature set is **Gillett Diesel Service** (B2B + fleet + MCP requirements).

Read [docs/00-README.md](docs/00-README.md) first — it is the table of contents for everything else.

## Documentation map (read these to make any non-trivial decision)

Numbered docs are intended to be read in order. Group them by what you're doing:

- **Orienting / "why":** [01-platform-vision.md](docs/01-platform-vision.md), [02-architecture-overview.md](docs/02-architecture-overview.md)
- **Infra & ops:** [03-infrastructure-deployment.md](docs/03-infrastructure-deployment.md), [04-domain-ssl-automation.md](docs/04-domain-ssl-automation.md), [20-operational-runbook.md](docs/20-operational-runbook.md), [21-cost-scaling-guide.md](docs/21-cost-scaling-guide.md)
- **Data & APIs:** [05-data-model.md](docs/05-data-model.md), [06-api-specification.md](docs/06-api-specification.md), [07-mcp-server-spec.md](docs/07-mcp-server-spec.md), [22-typesense-search-spec.md](docs/22-typesense-search-spec.md)
- **Per-module PRDs:** 08 (site builder), 09 (e-commerce), 10 (B2B), 11 (CRM), 12 (CMS), 13 (email), 14 (dropship), 15 (onboarding)
- **Cross-cutting:** [16-auth-security.md](docs/16-auth-security.md), [17-billing-subscriptions.md](docs/17-billing-subscriptions.md), [18-frontend-architecture.md](docs/18-frontend-architecture.md), [19-testing-strategy.md](docs/19-testing-strategy.md)
- **Design:** [sparx-brand-guide.md](docs/sparx-brand-guide.md), [sparx-design-tokens.css](docs/sparx-design-tokens.css)

## Non-obvious conventions that will bind future code

These are architectural commitments that won't be obvious from reading individual files — they cut across modules, so flag any change that violates them:

- **Multi-tenancy is enforced at the database level via PostgreSQL Row Level Security.** Every tenant-scoped table has `tenant_id`; RLS policies are the backstop against application bugs. Do not assume application-tier filtering is sufficient.
- **Auth is Better Auth, self-hosted — not Auth0, Clerk, or any SaaS.** Better Auth organizations map 1:1 to Sparx tenants. Better Auth ships its own primitives for org membership, API keys, and MFA — use them rather than building parallel systems.
- **Modules are feature-flagged, not separately deployed.** A disabled module returns 404 with a clear error, runs no workers, and stores no rows. Activation is event-driven (`module.activated` on Pub/Sub) — never gate features by checking subscription rows inline.
- **Event-driven side effects via Google Pub/Sub.** Business events (`order.created`, `customer.updated`, `email.send`, `domain.verified`) are published and consumed by workers. Don't inline side effects in request handlers.
- **Infra is phased — start cheap.** Phase 1 explicitly uses Redis in a GKE pod (not Memorystore), Postgres full-text search (not Elasticsearch/Typesense), and Postal in a pod (not SendGrid). [docs/03-infrastructure-deployment.md](docs/03-infrastructure-deployment.md) §3 lists the upgrade triggers. Don't propose Phase 2/3 services without a stated revenue/scale trigger.
- **Email goes through self-hosted Postal on `sparx.email`.** Not SendGrid, Postmark, or SES. `sparx.mx` was the original plan; it was already registered to someone else, so `sparx.email` doubles as both Postal sending infrastructure and merchant-facing transactional emails.
- **Outbound email defaults to publishing `email.send` to Pub/Sub.** `email-worker` ([services/email-worker/](services/email-worker/)) consumes events, renders via `@sparx/email`'s React Email templates, and POSTs to the configured provider (console in dev, Postal in prod). New callers MUST publish events — direct calls to `sendTemplate()` / `sendEmail()` from `@sparx/email` are an escape hatch reserved for synchronous-required flows only (OTP codes, future 2FA). Adding a non-OTP direct send requires justification in the PR description.
- **Email templates compose atomic components.** All email templates live in [packages/email/src/templates/](packages/email/src/templates/) inside `<EmailLayout>`, composed from the atomic components in [packages/email/src/components/](packages/email/src/components/) (`EmailHeading`, `EmailParagraph`, `EmailButton`, `EmailLink`, `EmailMuted`, `EmailCallout`, `EmailWordmark`). Templates MUST NOT inline raw `style={...}` props — extend a component instead, or add a new token in `components/tokens.ts`. Plain-text bodies are auto-generated by React Email's `render({plainText: true})` — never hand-write them.
- **MCP server is a first-class service**, not a plugin or afterthought — [docs/07-mcp-server-spec.md](docs/07-mcp-server-spec.md).
- **API-first.** Every UI feature must exist as an API endpoint first; the dashboard is one consumer among many.
- **Onboarding goal: live store in under 5 minutes.** Any onboarding-flow change that adds steps or friction needs justification — see [docs/15-merchant-onboarding-prd.md](docs/15-merchant-onboarding-prd.md).
- **Cloud SQL migrations go through the pipeline, not your laptop.** The Cloud SQL instance is private-IP only — Auth Proxy from a local machine cannot reach it. Author migrations locally against the docker Postgres (`pnpm db:up` + `prisma migrate dev`), then push to `main`; the [DB Migrate workflow](.github/workflows/db-migrate.yml) builds a runner image, applies a K8s Job in `sparx-prod`, and runs `prisma migrate deploy` via the Cloud SQL Auth Proxy sidecar. Re-seed with `gh workflow run db-migrate.yml -f run_seed=true`. Full flow in [packages/db/README.md](packages/db/README.md#applying-a-migration). RLS and `current_tenant_id()` patterns aren't generated by Prisma — hand-edit migration SQL when they're needed.
- **Releases are automated via tags, not PRs.** Every push to `main` runs [auto-tag.yml](.github/workflows/auto-tag.yml), which analyzes conventional-commit messages since the last `v*` tag and pushes a new tag if anything releasable landed. Bumps: `feat:` → minor, `fix:` / `perf:` → patch, `feat!:` or `BREAKING CHANGE:` footer → major; `chore / docs / refactor / ci / build / test / style` don't bump. After tagging, the same workflow dispatches [build-images.yml](.github/workflows/build-images.yml) and [deploy-prod.yml](.github/workflows/deploy-prod.yml) against the new tag (necessary because GITHUB_TOKEN-pushed tags don't trigger workflows by default — no PAT needed). Force a specific bump via `gh workflow run auto-tag.yml -f bump=major|minor|patch`. No bot ever opens a PR; code-change PRs remain a human gate as normal.

## Brand & design (binding for any UI work)

- **A component's _appearance_ lives in `packages/ui/`; feature code never re-skins a control — but it may compose layout with utilities.** Feature code in `apps/*` uses named component variants (`<Button color="primary" variant="soft">`). Layout/positioning/spacing/sizing utilities and one-off chrome (e.g. an `absolute top-0 right-0` indicator) are fine in feature code. The banned pattern is **re-skinning a control**: a background fill paired with a foreground text color (or hand-built `hover:`/`focus:`/`disabled:` states) = recreating a `<Button>`/`<Input>`/`<Badge>` — use the component/variant instead, or add one to `packages/ui`. ESLint flags exactly that fill+foreground fingerprint (a warning), not raw utilities in general. See [docs/23-frontend-component-architecture.md](docs/23-frontend-component-architecture.md) §1 and §15, plus the multi-axis variant system in [docs/35-ui-variant-system.md](docs/35-ui-variant-system.md).
- Components are built with the **CVA pattern** ([docs/23-frontend-component-architecture.md](docs/23-frontend-component-architecture.md) §6) on top of Shadcn/ui shells and Radix primitives. Every variant references a CSS custom property from [packages/ui/src/tokens.css](packages/ui/src/tokens.css) — never a hardcoded color.
- Module color shifting is automatic via `<ModuleProvider module="cms">` ([packages/ui/src/providers/module-provider.tsx](packages/ui/src/providers/module-provider.tsx)). Any component referencing `--module-active` adopts the wrapping module's color — no props, no conditional classes.
- The Sparx wordmark renders with the **"x" always in Sparx Indigo `#6366F1`** — never one solid color. Set in Geist 500, tracking -0.03em.
- Per-module colors (Storefront=Indigo, Commerce=Orange, CMS=Teal, CRM=Cyan, etc.) appear identically across the module's marketing site, its sidebar nav item, and the 3px top stripe on cards via `<Card variant="module">`. Full list in [docs/sparx-brand-guide.md](docs/sparx-brand-guide.md).
- Merchant storefront themes override `:root` tokens via CSS custom properties — never edit `packages/ui/src/tokens.css` for a merchant-specific change.

## Document style

Every doc starts with a `Version`, `Author`, and `Last Updated` header. When editing a doc materially, bump the version and update the date. The author is Brandon Korous. Dates are absolute ISO (`2026-05-27`).
