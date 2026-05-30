# Sparx Platform — Customer Accounts & Storefront Authentication

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Overview

This document specifies **Layer 2 authentication** — accounts for the *shoppers* who buy
from a merchant's storefront. It is deliberately separate from **Layer 1** (merchant staff
auth, [docs/16-auth-security.md](16-auth-security.md)), which uses Better Auth and lives in
`packages/auth`.

A shopper who registers at `acme.sparx.zone` is a customer of **Acme**, not of Sparx. They
have no relationship to the Sparx dashboard, no `users` row, and no presence on any other
merchant's store. The same person can hold a separate account at `bravo.sparx.zone` with the
**same email address** and a **different password** — the two are unrelated identities.

> **Hard rule (non-negotiable):** we store password **hashes only**, never plaintext, never
> reversibly encrypted. Argon2id, the same algorithm and parameters Layer 1 uses.

### 1.1 What ships here

- Register / login / logout for storefront shoppers, tenant-scoped.
- Customer session (first-party httpOnly cookie), issued by `api-rest`, relayed through the
  storefront's `/api/sparx` proxy.
- Account area: order history, order detail, address book, profile.
- Guest → customer **cart merge** on login (reuses the existing `cartService.merge`).
- Password reset via the existing `email.send` Pub/Sub path.

### 1.2 What is explicitly out of scope (deferred)

- Social / OAuth login (Google, Apple). The schema leaves room (see §4) but no providers ship.
- Customer MFA / passkeys.
- B2B buyer accounts with approval chains, net-terms gating, multi-seat org buyers — these are
  Layer 2½ and belong to the B2B module ([docs/10-b2b-wholesale-prd.md](10-b2b-wholesale-prd.md)).
- Wishlist persistence tied to the account (the table exists; wiring it to the account UI is a
  follow-up slice, not a blocker).

---

## 2. Why not a second Better Auth instance

The instinct — and the initial direction — was "give the storefront its own Better Auth
instance." We are **not** doing that, and the reason is structural, not stylistic.

Better Auth keys credential sign-in on a **globally unique email**. Staff auth leans on this
hard: `users.email` carries a global `@unique`, and `signUpMerchant` provisions a fresh tenant
per registration so the compound `(tenantId, email)` never actually mattered
([docs/16 §1](16-auth-security.md), `packages/db/prisma/schema/03-auth.prisma`). Sign-in does
`findOne({ email })` with no tenant in the predicate.

For shoppers that assumption is **wrong**: the same email must be able to register at two
different merchants as two distinct accounts. To bend Better Auth to a `(tenantId, email)`
key you have to either (a) namespace the stored identifier (e.g. `tenantId\0email`), which
corrupts the column you also want to email and index on, or (b) write a sign-in plugin that
injects tenant into every internal query — fighting the framework on its hottest path. Both
are worse than the alternative.

### The insight that makes it easy

**For a shopper, the tenant is known *before* authentication.** It is the storefront's
hostname (`acme.sparx.zone`, or `?tenant=acme` in dev), resolved at the edge in
[apps/storefront/middleware.ts](../apps/storefront/middleware.ts) and carried to `api-rest` as
the `?tenant=<slug>` param the public commerce surface already uses. Staff sign-in can't do
this — a staff member types only an email, and the tenant is *discovered* from their user row.
A shopper's tenant is ambient context.

Because the tenant is known up front, **every customer-auth operation runs inside
`withTenant({ tenantId }, …)`**, and Postgres RLS enforces isolation for free — exactly the
same backstop every other tenant-scoped table gets. There is no "look up by email before we
know the tenant" moment, so there is no global-email requirement, no owner-bypass connection,
no namespacing. The hard problem Better Auth would have forced on us simply does not exist.

### Decision

Build a **purpose-built, tenant-scoped customer-auth module**, `@sparx/customer-auth`, that
reuses the platform's existing primitives rather than a framework:

- **Hashing:** Argon2id via `@node-rs/argon2` — the identical algorithm and parameters Layer 1
  uses (already a dependency of `@sparx/db`, see `packages/db/prisma/seed.ts`).
- **Sessions:** opaque 256-bit random tokens, SHA-256-hashed at rest, in a first-party
  httpOnly cookie — the same shape as our API-key model (`packages/auth/src/api-keys.ts`).
- **Isolation:** every table is tenant-scoped with `ENABLE + FORCE` RLS and a
  `tenant_isolation` policy on `current_tenant_id()`; every query runs in `withTenant()` on the
  standard `sparx_app` (NOBYPASSRLS) client.

This is ~300 lines under our full control, it is auditable, and it never touches the staff auth
package or its tables. It honours the boundary rule in
`memory/feedback_respect_architectural_boundaries.md`: `@sparx/auth` stays "the Better Auth
package"; customer auth gets its own clearly-named home.

---

## 3. Architecture

```
Browser (acme.sparx.zone)
  │  POST /api/sparx/v1/public/commerce/account/register   { email, password, name }
  ▼
apps/storefront  /api/sparx/[...path]  (same-origin proxy)
  │  forwards to api-rest; relays Set-Cookie back as first-party on acme.sparx.zone
  ▼
services/api-rest  /v1/public/commerce/account/*   (tenant by ?tenant=<slug>)
  │  resolves tenantId, asserts Storefront/Commerce module active
  ▼
@sparx/customer-auth   registerCustomer / authenticateCustomer / {create,verify,revoke}Session
  │  Argon2id hashing · opaque session tokens · all inside withTenant()
  ▼
Postgres (RLS FORCE)   customer_credentials · customer_sessions · customer_password_resets
        + CRM customers (the profile spine — already exists)
```

Two cookies coexist on the storefront origin, never colliding with staff auth (which lives on
`app.sparx.works`, a different origin):

| Cookie                   | Set by   | Purpose                                  | Flags                                   |
| ------------------------ | -------- | ---------------------------------------- | --------------------------------------- |
| `sparx_cart` (token)     | existing | guest cart ownership (`x-cart-token`)    | httpOnly, SameSite=Lax, Secure          |
| `sparx_customer_session` | this doc | authenticated shopper session            | httpOnly, SameSite=Lax, Secure, Path=/  |

The proxy already relays `Set-Cookie` and `cookie` in both directions
([apps/storefront/app/api/sparx/[...path]/route.ts](../apps/storefront/app/api/sparx/%5B...path%5D/route.ts)),
so no proxy change is needed beyond ensuring the customer cookie name is forwarded.

---

## 4. Data model

The CRM **already owns the customer spine** (`customers`,
`packages/db/prisma/schema/20-crm-customers.prisma`) with `(tenantId, email)` unique and an
`authUserId` column reserved for exactly this layer. We **do not** create a parallel customer
table. Customer auth adds only the credential + session + reset tables that hang off a
`customers.id`.

### 4.1 New tables

```prisma
// packages/db/prisma/schema/40-customer-auth.prisma  (new file)

// Credential for a storefront shopper. One row per registered customer.
// A `customers` row can exist with no credential (guest checkout, CRM-imported
// prospect); a credential row means "this customer has set a password".
model CustomerCredential {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  customerId   String   @unique @map("customer_id") @db.Uuid
  passwordHash String   @map("password_hash") @db.Text   // Argon2id — NEVER plaintext
  emailVerified Boolean @default(false) @map("email_verified")
  lastLoginAt  DateTime? @map("last_login_at") @db.Timestamptz
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  sessions CustomerSession[]

  @@index([tenantId])
  @@map("customer_credentials")
}

// Opaque rotating session. `tokenHash` = SHA-256 of the random token in the
// cookie; the plaintext token is never stored. Expiry is enforced in-app AND
// by a partial index for cheap cleanup.
model CustomerSession {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  customerId   String   @map("customer_id") @db.Uuid
  credentialId String   @map("credential_id") @db.Uuid
  tokenHash    String   @unique @map("token_hash") @db.VarChar(64) // sha256 hex
  expiresAt    DateTime @map("expires_at") @db.Timestamptz
  ipAddress    String?  @map("ip_address") @db.Inet
  userAgent    String?  @map("user_agent") @db.Text
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  tenant     Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  credential CustomerCredential @relation(fields: [credentialId], references: [id], onDelete: Cascade)

  @@index([tenantId, customerId])
  @@index([expiresAt])
  @@map("customer_sessions")
}

// Single-use password-reset tokens. `tokenHash` = SHA-256 of the token mailed
// to the customer. Short-lived; consumed on use.
model CustomerPasswordReset {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  customerId String    @map("customer_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash") @db.VarChar(64)
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz
  usedAt     DateTime? @map("used_at") @db.Timestamptz
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, customerId])
  @@map("customer_password_resets")
}
```

`Customer` (schema 20) gains the inverse relations (`credential CustomerCredential?`,
`customerSessions CustomerSession[]`, `passwordResets CustomerPasswordReset[]`) and `Tenant`
gains its inverses. `Customer.authUserId` stays as-is — reserved for a future external-IdP
link; "has a `customer_credentials` row" is the source of truth for "is a registered account".
No social-login table ships now, but adding a `customer_oauth_accounts` table later is additive
and parallels the staff `accounts` shape.

### 4.2 Migration & RLS

A new migration `2026XXXX000000_customer_auth` (number assigned at author time), authored
locally against docker Postgres and applied **only** through the DB Migrate workflow per
`memory/project_db_migration_pipeline.md`. Prisma does not emit RLS, so the migration SQL is
hand-edited to append, for **each** of the three tables (following the exact pattern in
`20260601000000_crm_module/migration.sql`):

```sql
ALTER TABLE "customer_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_credentials" FORCE  ROW LEVEL SECURITY;
CREATE POLICY customer_credentials_tenant_isolation ON "customer_credentials"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
-- …repeat for customer_sessions, customer_password_resets
```

These tables are `FORCE` (unlike the staff `users`/`sessions`/`accounts`, which are
`NO FORCE` so the owner-connection can read them pre-tenant). Customer auth never needs a
pre-tenant read — the tenant is always known — so `FORCE` is correct and strictly safer. The
`updated_at` columns must `DROP DEFAULT` after table creation (Prisma `@updatedAt` drift
guard), same as every prior migration.

---

## 5. `@sparx/customer-auth` package

New workspace package. Server-only (no React surface; the storefront calls it via `api-rest`,
never directly — honouring the "storefront talks to api-rest only" constraint). Mirrors the
ergonomics of `packages/auth` but is its own thing.

```
packages/customer-auth/
  package.json          // deps: @sparx/db, @node-rs/argon2, zod; type: module
  tsconfig.json
  eslint.config.js
  src/
    index.ts            // barrel
    hash.ts             // argon2id hash() / verify() — shared params (docs/16 §1)
    session.ts          // token mint (256-bit), sha256, cookie name/flags constants
    service.ts          // the public surface (below)
    errors.ts           // CustomerAuthError { code: EMAIL_TAKEN | INVALID_CREDENTIALS | … }
```

### 5.1 Public surface (`service.ts`)

Every function takes a tenant-scoped context `{ tenantId }` and runs in `withTenant`:

```ts
registerCustomer(ctx, { email, password, firstName?, lastName? })
  → { customerId, sessionToken }      // find-or-attach Customer, create credential, open session
authenticateCustomer(ctx, { email, password })
  → { customerId, sessionToken } | null   // null on bad creds (constant-time-ish: always verify)
verifyCustomerSession(ctx, token)
  → { customerId, credentialId } | null   // hash, look up, check expiry; sliding-refresh if near expiry
revokeCustomerSession(ctx, token) → void  // logout
requestPasswordReset(ctx, { email }) → void   // always 200; publishes email.send if account exists
resetPassword(ctx, { token, password }) → void
```

**Security properties baked in:**

- `registerCustomer` rejects a duplicate `(tenantId, email)` that already has a credential with
  `EMAIL_TAKEN`; if a `Customer` row exists *without* a credential (guest/prospect), it attaches
  the credential to that row rather than creating a duplicate — preserving the single-spine rule.
- `authenticateCustomer` performs an Argon2 verify even when the email is unknown (against a
  dummy hash) to flatten the timing signal between "no such user" and "wrong password".
- Passwords: minimum length 8 (matches Layer 1), validated with Zod before hashing.
- `requestPasswordReset` is **enumeration-safe** — identical response whether or not the email
  exists; the email is only sent when it does.
- Reset tokens and session tokens are single-purpose and stored only as SHA-256 hashes.

### 5.2 Email

Password-reset and welcome emails publish `email.send` to Pub/Sub via `@sparx/events`, the
same path `packages/auth/src/email-events.ts` uses — never a direct send. New templates
(`customer-welcome`, `customer-password-reset`) are added to `packages/email` in the
atomic-component style mandated by CLAUDE.md. (OTP-style synchronous send is **not** needed
here; reset is a link, not a code.)

---

## 6. `api-rest` public account routes

New file `services/api-rest/src/routes/v1/public/account.ts`, registered in
[app.ts](../services/api-rest/src/routes/v1/public/) alongside `publicCartRoutes` /
`publicCheckoutRoutes`. All routes resolve the tenant via the existing
`publicCommerceContext(request)` helper and gate on the Storefront module.

| Method | Path                                              | Purpose                                            |
| ------ | ------------------------------------------------- | -------------------------------------------------- |
| POST   | `/v1/public/commerce/account/register`            | Create account, set session cookie, merge cart     |
| POST   | `/v1/public/commerce/account/login`               | Authenticate, set session cookie, merge cart       |
| POST   | `/v1/public/commerce/account/logout`              | Revoke session, clear cookie                        |
| GET    | `/v1/public/commerce/account/me`                  | Current customer profile (or 401)                  |
| PATCH  | `/v1/public/commerce/account/me`                  | Update profile (name, phone)                       |
| GET    | `/v1/public/commerce/account/orders`              | The customer's orders (paged)                      |
| GET    | `/v1/public/commerce/account/orders/:orderId`     | One order, scoped to the customer                  |
| GET    | `/v1/public/commerce/account/addresses`           | Address book                                       |
| POST   | `/v1/public/commerce/account/addresses`           | Add address                                        |
| PATCH  | `/v1/public/commerce/account/addresses/:id`       | Edit address                                       |
| DELETE | `/v1/public/commerce/account/addresses/:id`       | Remove address                                     |
| POST   | `/v1/public/commerce/account/password/forgot`     | Request reset link (enumeration-safe)              |
| POST   | `/v1/public/commerce/account/password/reset`      | Consume token, set new password                    |

**Session wiring.** Authenticated routes read `sparx_customer_session` from the cookie, call
`verifyCustomerSession`, and attach `{ customerId }` to the request (a small `preHandler`).
`register` / `login` set the cookie via `Set-Cookie` (the proxy relays it). Orders are read
through the existing CRM/commerce read services, filtered by `customerId` inside `withTenant`.

**Cart merge on auth.** `register` and `login` accept the current guest `x-cart-token`. After
the session is established, if the customer already has an active cart, we call
`cartService.merge({ sourceCartId: guestCart, targetCartId: customerCart, conflictPolicy:
'sum_quantities' })`; otherwise the guest cart is re-owned by setting its `customerId`. This
reuses the merge logic verified in `cart-service.ts` — no new merge code.

---

## 7. Storefront UI (`apps/storefront`)

All token-driven `sf-*` classes (no Tailwind in feature code), responsive, with loading/empty/
error states. New customer-session client mirrors the existing `cart-provider` pattern.

- `lib/customer-client.ts` — typed wrappers over `/api/sparx/.../account/*` (register, login,
  logout, me, orders, addresses, password reset), carrying cookies + `x-cart-token`.
- `components/customer-provider.tsx` — client context exposing `{ customer, status, login,
  register, logout, refresh }`; hydrates from `/account/me` on mount.
- Routes under `app/account/`:
  - `app/account/login/page.tsx`, `app/account/register/page.tsx`,
    `app/account/forgot/page.tsx`, `app/account/reset/page.tsx`
  - `app/account/page.tsx` (dashboard: greeting, recent orders, quick links)
  - `app/account/orders/page.tsx`, `app/account/orders/[orderId]/page.tsx`
  - `app/account/addresses/page.tsx`, `app/account/profile/page.tsx`
  - `app/account/layout.tsx` — guards the subtree (redirect to `/account/login` when signed out),
    renders the account nav tabs (the `.sf-account` / `.sf-tabs` CSS blocks already exist).
- Header: the account icon links to `/account` when signed in, `/account/login` otherwise; the
  checkout flow offers "sign in for faster checkout" without ever *requiring* it (guest checkout
  stays first-class unless the merchant sets `requireAuthForCheckout`).

---

## 8. Delivery slices (deploy early, deploy small)

Per `memory/feedback_deploy_early_deploy_small.md`, ship in independently-deployable slices:

1. **DB + package** — migration (through the pipeline) + `@sparx/customer-auth` with unit tests
   for hash/verify, session lifecycle, register/login/reset. Nothing user-facing yet.
2. **API** — `account.ts` routes (register/login/logout/me) + session preHandler + cart merge.
   Verifiable with `curl` against a seeded tenant.
3. **Storefront auth UI** — login/register/forgot/reset pages + `customer-provider` + header
   wiring. Guest→customer merge live end-to-end.
4. **Account area** — orders list/detail, address book, profile.
5. **Polish** — password-reset emails, rate-limiting on login/register, a11y pass, E2E
   (register → add to cart as guest → log in → cart merged → checkout → order shows in account).

---

## 9. Security checklist (must all hold before slice 2 ships)

- [ ] Passwords stored **only** as Argon2id hashes; no plaintext in DB, logs, or events.
- [ ] All three tables `ENABLE + FORCE` RLS with a `tenant_isolation` policy; verified by a
      cross-tenant test (tenant A cannot read tenant B's credential/session rows).
- [ ] Every customer-auth query runs inside `withTenant` on the `sparx_app` (NOBYPASSRLS) role.
- [ ] Session + reset tokens are 256-bit random, stored as SHA-256, never logged.
- [ ] Session cookie is `httpOnly; Secure; SameSite=Lax; Path=/`.
- [ ] Login + password-reset request are enumeration-safe and timing-flattened.
- [ ] Rate-limiting on `register` / `login` / `password/forgot` (slice 5; tracked, not skipped).
- [ ] No customer-auth code imports or mutates the staff `@sparx/auth` instance or its tables.

---

## 10. Open decisions

- **Account email verification before first login** — Layer 1 ships with
  `requireEmailVerification: false`; customer accounts follow suit for the 5-minute-store goal,
  with verification as an opt-in merchant setting later. (Default: not required.)
- **Custom-domain cookie scope** — when merchants attach custom domains (`acme.com`), the
  session cookie is naturally first-party on that origin via the proxy; no `Domain=` attribute
  is set, so each origin gets its own cookie. This is the desired isolation, documented here so
  it isn't "fixed" later by mistake.
