# Site MCP — the shopper-facing agent surface

**Version:** 1.3
**Author:** Brandon Korous
**Last Updated:** 2026-07-02

---

## 1. Overview — two MCP planes

sparx already ships **one** MCP server: `mcp.sparx.works`, the **operator plane** — a
tenant's _staff/owner_ connects their own Claude/ChatGPT and runs the business
(orders, CRM, inventory, email, domains…), gated by staff OAuth ([docs/07](07-mcp-server-spec.md) §5).

This document specs the **second, distinct plane**: the **site MCP** — the
tenant's _customers_ (a shopper, someone booking a haircut) point **their own** LLM
at the tenant's site and get real answers + take real actions: browse the catalog,
check availability, **book an appointment**, add to cart, check out, read reviews.

|               | Operator MCP (`mcp.sparx.works`) — built       | Site MCP (this doc) — new                                           |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Who connects  | Tenant **staff/owner**                         | The tenant's **customers**                                          |
| Their LLM     | Claude signed into their business              | The shopper's own Claude/ChatGPT                                    |
| Host          | `mcp.sparx.works`                              | per-site `…/mcp` + `mcp.sparx.zone/s/<store>`                       |
| Auth          | Staff OAuth / `sk_live_` API key               | Anonymous + guest; returning-customer OAuth (Phase 2)               |
| Tools         | get_orders, get_customers, inventory, domains… | search_products, check_availability, book_appointment, add_to_cart… |
| Data boundary | In-process module services (full admin)        | **The public `/v1/public/*` REST API only**                         |

These are siblings, **never merged**. Merging would put an admin tool graph one
misconfiguration away from an anonymous surface. The site MCP has **no**
access to admin scopes, module services, or the DB — it can only do what an
anonymous browser at the site can already do.

`works = run the business · zone = shop the business.`

## 2. What already exists (do not rebuild)

The site MCP is mostly _assembly_, because the platform is API-first:

- **The entire data + action plane exists as public REST** under
  `wizeworks/services/api-rest/src/routes/v1/public/` — catalog, search, scheduling (guest +
  account), cart, checkout, content, reviews, account, B2B portal. Every route already
  enforces tenant isolation (RLS via `withTenant`), public visibility
  (`status='active'`/`published`, site-visibility), module gating, and
  enumeration-safety. **This is the contract the site MCP wraps.**
- **An AI concierge already runs on the site** — the Live Chat module
  ([docs/56](56-live-chat-module.md)) answers shopper questions with Claude Haiku
  (`wizeworks/services/api-rest/src/lib/chat/ai-handler.ts`). But it is **RAG-lite**: it stuffs
  ~30 product titles + 20 page titles into the system prompt with a single `respond`
  tool. It cannot check real availability, search precisely, or book. The tool catalog
  below **upgrades the concierge to real tool use** at the same time.
- **Per-site `llms.txt`** (`wizeworks/apps/site/app/llms.txt/route.ts`) already hands agents a
  map of the store — the natural place to advertise the MCP endpoint.
- **Customer accounts** exist (cookie session `sparx_customer_session`) for the
  returning-customer tier.
- **Site resolution from Host** exists and is authoritative:
  `resolveSiteByHost()` in `wizeworks/services/api-rest/src/lib/domain.ts` (structural for
  `*.sparx.zone`, `domains`-table lookup for custom domains), surfaced at
  `GET /v1/public/site-by-host?host=`. **`mcp` is a reserved tenant slug**
  (`routes/v1/tenant.ts`), so `mcp.sparx.zone` can never collide with a store.

## 3. Architecture

### 3.1 A thin MCP adapter over the public REST API

The site MCP does **not** touch the database or import module packages. Every
tool is a declarative adapter that:

1. resolves the target site → `{ tenantId/slug, propertySlug }`,
2. validates its input with Zod,
3. calls the corresponding **public REST endpoint** on api-rest
   (`${SPARX_API_REST_URL}/v1/public/…?tenant=<slug>&property=<slug>`), relaying guest
   credentials (`x-cart-token`; customer session in Phase 2),
4. returns the JSON envelope's `data` as the tool result.

Consequences: reuses **all** existing public-safety logic (visibility, module gating,
rate limits, projections); the new service's Docker closure is tiny (no `@sparx/*`
module packages, no `@wizeworks/db`, no Prisma); and site/MCP parity is automatic —
a fix in a public route fixes the tool.

### 3.2 New service — `wizeworks/services/mcp-site`

Mirrors `api-mcp`'s transport pattern (Fastify + `@modelcontextprotocol/sdk`,
**stateless per-request**: fresh `McpServer` + `StreamableHTTPServerTransport({
sessionIdGenerator: undefined })`, `reply.hijack()`), but with a different auth
pipeline and **no module bundling**.

- **Deps:** `fastify`, `fastify-plugin`, `@modelcontextprotocol/sdk`, `zod`, `pino`,
  `@wizeworks/site-mcp` (the catalog), `@wizeworks/api-core` (envelope types). That's it.
- **Endpoints:**
  - `POST|GET|DELETE /mcp` — per-site (site from forwarded Host).
  - `POST|GET|DELETE /s/:tenant/:property?/mcp` — canonical (site from subpath, for
    `mcp.sparx.zone`).
  - `GET /health`.
  - `GET /.well-known/oauth-protected-resource` — Phase 2 (returning-customer OAuth). Served
    in every RFC 9728 §3.1 discovery shape: bare root, path-inserted
    (`/.well-known/oauth-protected-resource/mcp`, `/…/s/<tenant>[/<property>]/mcp`), AND the
    path-suffixed `<mcp>/.well-known/oauth-protected-resource` the `WWW-Authenticate` points
    at. An MCP client whose unauthenticated `initialize` succeeds never reads that challenge,
    so it CONSTRUCTS the path-inserted/root URL itself — serving only the suffixed form 404s
    discovery and the client never finds the AS (mirrors `api-mcp`).
- **Site resolution:** subpath if present; else `GET ${SPARX_API_REST_URL}/v1/public/
site-by-host?host=<x-forwarded-host>`. A 404 → MCP error result "unknown site".
- **Env:** `SPARX_API_REST_URL`, `PORT` (new port, e.g. `3200`), `HOST`, `LOG_LEVEL`,
  `SITE_MCP_PUBLIC_ORIGIN` (for discovery URLs), and (Phase 2)
  `BETTER_AUTH_URL`/customer-OAuth wiring. No DB URLs.
- **Rate limiting:** coarse per-(tenant, client-ip) token bucket in-process (the public
  routes are also rate-limited downstream); mirror `api-mcp/src/rate-limit.ts`.

### 3.3 Shared tool catalog — `@wizeworks/site-mcp`

A new package holding the **single source of truth** for shopper tools, consumed by
both the service and the concierge:

```ts
interface SiteTool {
  name: string; // 'search_products', 'book_appointment'
  description: string; // shopper-facing, LLM-readable
  kind: 'read' | 'guest_write' | 'customer'; // auth tier + confirmation hint
  module?: ModuleSlug; // gate: tool absent unless module active
  input: z.ZodType; // Zod → JSON schema for the SDK/Anthropic
  // executor: turn validated input + site + creds into a public-API call
  call(client: SiteApiClient, ctx: SiteCtx, input: unknown): Promise<unknown>;
}
```

- `SiteApiClient` — a typed fetch wrapper over `/v1/public/*` (adds
  `?tenant=&property=`, relays `x-cart-token` / customer session, unwraps the envelope).
- `SITE_TOOLS: SiteTool[]` — the catalog (§6).
- Also exports the tools as **Anthropic tool definitions** (`toAnthropicTools()`) so the
  concierge can register the identical set.

### 3.4 Concierge upgrade (same catalog, real tools)

`ai-handler.ts` graduates from RAG-lite to tool use: register `SITE_TOOLS`
(read + guest_write) as Anthropic tools alongside `respond`, run the tool loop against
`SiteApiClient` (base URL = api-rest, tenant already known), and let Haiku call
`check_availability` / `search_products` / `book_appointment` for grounded, actionable
answers. The `respond`/confidence/escalation contract stays. Persona/tool-policy
([docs/07](07-mcp-server-spec.md) §9) can disable individual tools per tenant.

## 4. Addressing & routing

**Primary — per-site `/mcp` on the store's own origin.** `daisysalon.com/mcp` and
`daisysalon.sparx.zone/mcp`. Caddy's catch-all `:443` (which already routes every
`*.sparx.zone` + every custom domain to `wizeworks/apps/site`) gets a `/mcp*` carve-out **above**
the site fallback → `mcp-site`. Zero new DNS/TLS: those hosts are already
authorized by the on-demand-TLS ask (`internal/domain-check.ts`). The store's MCP lives
at the store's address and is advertised in its own `llms.txt`.

```
# k8s/ingress/Caddyfile — inside the catch-all :443 block, BEFORE `reverse_proxy … site`
handle_path /mcp* { reverse_proxy mcp-site.sparx-prod.svc.cluster.local:3200 }
```

**Canonical — `mcp.sparx.zone/s/<tenant>[/<property>]`.** A distinct, discoverable host
for stores without a custom domain. Needs: an explicit Caddy host block →
`mcp-site`; `'mcp.sparx.zone'` added to `PLATFORM_HOSTNAMES` in
`internal/domain-check.ts` (else the on-demand ask 403s, since no tenant owns slug
`mcp`); optionally an explicit `cloudflare_record.sparx_zone_mcp` (A → ingress IP,
`proxied = false`) in `terraform/envs/prod/cloudflare.tf` (the `*` wildcard already
resolves it).

**Rejected:** `mcp.<tenant>.sparx.zone` — the first label is parsed as a _property_
slug by `zoneSiteRoute`/`resolveSiteByHost`, so it would mean "a property named mcp,"
not an MCP host.

## 5. Auth model & tiers

Customer identity today is the **`sparx_customer_session` httpOnly cookie**, not a
bearer token — a mismatch for MCP. Tools split by tier:

- **`read` (anonymous):** catalog, search, services, availability, store info,
  content, reviews. Tenant-resolved only; no identity.
- **`guest_write` (anonymous, side-effecting):** book_appointment / join waitlist
  (email inline — **no login; the haircut case works fully anonymously**), cart
  operations (owned by an `x-cart-token` the MCP mints on `create_cart` and holds for
  the session), checkout, submit_review. Marked `destructiveHint` so clients confirm.
- **`customer` (returning-customer — BUILT, Phase 2G):** my profile, orders, bookings,
  reschedule/cancel my booking, wishlist, addresses, B2B portal. Runs on the **customer Better
  Auth `mcp()` OAuth server** ([docs/27](27-customer-accounts-site-auth.md) §6) — the same hardened
  machinery as the operator flow ([docs/07](07-mcp-server-spec.md) §5) but pointed at the customer
  account tier, with the shopper scope vocabulary (`account:read/write`, `orders:read`,
  `bookings:read/write`, `b2b:read`) and a **store-branded `/account/authorize` consent page**. The
  AS lives on the store's own origin (docs/27 §6.1) so the shopper stays same-origin with their
  session cookie. mcp-site relays the bearer; **api-rest verifies + scope-gates** it on each
  `customer`-tier public route (mcp-site holds no DB).

**Phase 1 ships `read` + `guest_write`** — a complete, valuable surface (books
appointments, shops, checks out end to end). **Phase 2G** adds the `customer` tier (built).

## 6. Tool catalog (Phase 1)

Each tool wraps the named public route. `property` is threaded on every call.

**Discovery / store**

| tool            | kind | public route                                                                                                                          |
| --------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `get_site_info` | read | **new** lean `GET /v1/public/site-info` (projected: name, tagline, hours, contact, socials, policy links) — _not_ raw `tenants/:slug` |
| `search_site`   | read | `GET /v1/public/search` (products + collections + pages)                                                                              |

**Catalog**

| tool                      | kind        | public route                                                                              |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `search_products`         | read        | `GET /v1/public/commerce/search` (Typesense facets, price/stock/fitment filters, sort)    |
| `list_products`           | read        | `GET /v1/public/commerce/products`                                                        |
| `get_product`             | read        | `GET /v1/public/commerce/products/:handle` (full PDP: variants, options, images, fitment) |
| `list_collections`        | read        | `GET /v1/public/commerce/collections`                                                     |
| `get_collection_products` | read        | `GET /v1/public/commerce/collections/:handle/products`                                    |
| `list_categories`         | read        | `GET /v1/public/commerce/categories`                                                      |
| `get_reviews`             | read        | `GET /v1/public/commerce/products/:handle/reviews`                                        |
| `get_questions`           | read        | `GET /v1/public/commerce/products/:handle/questions`                                      |
| `submit_review`           | guest_write | `POST /v1/public/commerce/products/:handle/reviews`                                       |
| `ask_question`            | guest_write | `POST /v1/public/commerce/products/:handle/questions`                                     |

**Scheduling**

| tool                  | kind        | public route                                              |
| --------------------- | ----------- | --------------------------------------------------------- |
| `list_services`       | read        | `GET /v1/public/scheduling/services`                      |
| `check_availability`  | read        | `GET /v1/public/scheduling/availability`                  |
| `list_class_sessions` | read        | `GET /v1/public/scheduling/sessions`                      |
| `book_appointment`    | guest_write | `POST /v1/public/scheduling/bookings` (name/email inline) |
| `join_waitlist`       | guest_write | `POST /v1/public/scheduling/waitlist`                     |
| `join_class`          | guest_write | `POST /v1/public/scheduling/sessions/:id/join`            |

**Cart / checkout** (MCP holds the `x-cart-token` for the session)

| tool                                                    | kind               | public route                                                                                                    |
| ------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `create_cart` / `get_cart`                              | guest_write / read | `POST` / `GET /v1/public/commerce/cart[/:id]`                                                                   |
| `add_to_cart` / `update_cart_item` / `remove_cart_item` | guest_write        | `…/cart/:id/items…`                                                                                             |
| `apply_discount` / `remove_discount`                    | guest_write        | `…/cart/:id/discount…`                                                                                          |
| `start_checkout` … `complete_checkout`                  | guest_write        | the `…/checkout/:sessionId/*` chain (contact → shipping-quote → shipping → payment-intent → payment → complete) |

**Newsletter**
| `subscribe_newsletter` | guest_write | `POST /v1/public/newsletter` |

**Excluded (over-exposing — see §7):** `content/types/:key`, raw `tenants/:slug`
settings, unauthenticated `b2b/service-types`. Customer-tier tools (`my orders`,
`my bookings`, reschedule/cancel, wishlist, addresses, B2B portal) are **Phase 2**.

## 7. Security

- **No admin surface, ever.** Only the tools in §6 exist; they map only to public
  routes. No DB, no module services, no staff scopes in the service.
- **Curate, don't proxy blindly.** Three public routes over-expose and must **not** be
  wrapped as-is: `GET /content/types/:key` (returns the full unprojected `ContentType`
  row), `GET /tenants/:slug` (returns `tenant.settings` verbatim), and
  `GET /b2b/service-types` (no auth/contact check). Add a lean projected
  `GET /v1/public/site-info` for `get_site_info`; fix the B2B route's missing
  `requireContactRole` before any B2B tool ships (tracked here, not in Phase 1).
- **Guest writes have side effects** — booking/waitlist/class-join **create a CRM
  customer by email**; newsletter/signup create prospects + capture IP. Every such tool
  is `kind: 'guest_write'` with `destructiveHint: true` so the shopper's client prompts
  before acting.
- **Tenant isolation** rides entirely on the public routes' `withTenant` RLS; the MCP
  never bypasses it (it has no DB handle).
- **Abuse:** coarse per-(tenant, ip) rate limit in the service + the existing per-route
  limits; `bodyLimit` cap; no PII in logs (mirror `api-mcp`).
- **CORS / discovery** endpoints public + cached; tool endpoints require no auth in
  Phase 1 (anonymous by design) — the _write_ tools are still safe because they can only
  do what the anonymous public routes allow.

## 8. Discovery

- **`llms.txt`** (`wizeworks/apps/site/app/llms.txt/route.ts`) gains an MCP pointer line, e.g.
  `## Assistant\n- [MCP endpoint](${origin}/mcp): Connect an AI assistant to shop, check availability, and book.`
- **`.well-known`**: Phase 2 serves `oauth-protected-resource` from the service for the
  customer tier. Phase 1 needs none (anonymous).
- Optionally advertise the canonical `mcp.sparx.zone/s/<slug>` alias in `llms.txt` for
  stores on a bare `*.sparx.zone` host.

## 9. Build steps (phased)

### Phase 0 — shared catalog package

1. `wizeworks/packages/site-mcp/` (`@wizeworks/site-mcp`): `SiteApiClient`,
   `SiteTool` type, `SITE_TOOLS` (§6 read + guest_write), `toAnthropicTools()`,
   `toMcpRegistrations()`. Zod schemas per tool. Unit tests for schema + client URL/relay.

### Phase 1 — service + concierge + routing (anonymous/guest)

2. `wizeworks/services/mcp-site/`: Fastify app mirroring `api-mcp` (`app.ts`, `server.ts`,
   `env.ts`, `rate-limit.ts`, `index.ts`), stateless transport, `/mcp` + `/s/:tenant/:property?/mcp`
   - `/health`. Site resolution via api-rest `site-by-host` / subpath.
3. **New lean endpoint** `GET /v1/public/site-info` in api-rest (projected store
   info) to back `get_site_info` without leaking `settings`.
4. **Concierge upgrade** — `ai-handler.ts` registers `SITE_TOOLS` (read +
   guest_write) as Anthropic tools + runs the tool loop via `SiteApiClient`.
5. **Discovery** — add the MCP pointer to `llms.txt`.
6. **Infra**: `wizeworks/services/mcp-site/Dockerfile` (tiny closure — no module packages);
   `k8s/apps/mcp-site.yaml` (Deployment+Service, port 3200, reuse `sparx-app-env`/
   `sparx-app-secrets`, `sparx-app` SA); add to `k8s/apps/kustomization.yaml`; Caddyfile
   `/mcp*` carve-out in the catch-all + explicit `mcp.sparx.zone` block; `'mcp.sparx.zone'`
   in `PLATFORM_HOSTNAMES`; matrix entry in `build-images.yml`; rollout entry in
   `deploy-prod.yml`; optional DNS record + uptime check.
7. **Local `.env`** + `k8s/sparx-prod/app-env-configmap.yaml`: `SPARX_API_REST_URL`,
   `SITE_MCP_PUBLIC_ORIGIN`, port.

### Phase 2G — returning-customer tier (BUILT)

8. Customer-side OAuth on the customer Better Auth `mcp()` provider (docs/27 §6): the AS is served
   by api-rest under `<store>/v1/public/auth/*` on the store's OWN origin (Caddy carve-out, tenant
   from Host), with our own AS metadata (real shopper scope vocab), a `/mcp/authorize` consent guard,
   and a store-branded `/account/authorize` consent page in `wizeworks/apps/site`. The bearer is **verified in
   api-rest** (not the DB-less mcp-site): the `customer`-tier public routes accept
   `Authorization: Bearer`, verify it (`verifyCustomerMcpToken`), resolve the per-site membership,
   and scope-gate. mcp-site advertises `oauth-protected-resource` + challenges unauthenticated
   `customer`-tool calls with `401 + WWW-Authenticate`. Tools: `get_my_profile`, `list_my_orders`,
   `get_my_order`, `list/add_my_address(es)`, `list/add/remove …wishlist`, `list/get_my_booking(s)`,
   `reschedule/cancel_my_booking`, `list/get_my_b2b_account(s)`, `list_my_b2b_invoices`. (The B2B
   `requireContactRole` gap was already closed in Phase 1's punch-list.)

## 10. Testing

Mirror the operator-MCP e2e ([docs/07](07-mcp-server-spec.md) §5 verification): scripted
`initialize` → `tools/list` → representative `tools/call` for each tier against local
dev, asserting (a) read tools return live data for a seeded store, (b) `book_appointment`
creates a real booking + CRM customer, (c) cart→checkout completes with a held cart
token, (d) an unknown-host request yields a clean MCP error, (e) tenant isolation (a tool
for store A never returns store B's data). Add the concierge tool-loop path to the chat
tests.

## 11. Open decisions

- **Service/package names** — `mcp-site` / `@wizeworks/site-mcp` (proposed).
- **Canonical host shape** — `mcp.sparx.zone/s/<tenant>[/<property>]` vs `?tenant=`
  query. Subpath proposed (cleaner, cache-friendly).
- **Phase 2 cut line** — build now vs immediately-next (see §5).

---

**Related:** [07-mcp-server-spec.md](07-mcp-server-spec.md) (operator MCP + OAuth),
[56-live-chat-module.md](56-live-chat-module.md) (concierge),
[04-domain-ssl-automation.md](04-domain-ssl-automation.md) (Caddy/on-demand TLS),
[58-per-site-context.md](58-per-site-context.md) (Host→site resolution),
[06-api-specification.md](06-api-specification.md) (public REST).
