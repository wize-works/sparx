# Sparx Platform — Authentication, Multi-Tenancy & Security

**Version:** 2.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Authentication Strategy — Better Auth

Sparx uses **Better Auth** (betterauth.dev) as the authentication foundation. Better Auth is open source, self-hosted, TypeScript-native, and handles all core auth primitives without a SaaS dependency.

### Why Better Auth Over Rolling Our Own

Rolling auth primitives from scratch — password hashing, token rotation, MFA, OAuth flows — is high-risk with low upside. The failure modes (timing attacks, token theft, CSRF, credential stuffing) are severe and well-documented. Better Auth solves these correctly and is auditable since it's open source.

### Why Better Auth Over Auth0 / Clerk / Supabase Auth

- **No SaaS dependency** — runs on our infrastructure, our database, our rules
- **No per-user pricing** — critical for a multi-tenant platform with thousands of merchant customers
- **TypeScript-native** — first-class types, integrates cleanly with Fastify and Next.js
- **Multi-tenant / organizations built in** — maps directly to our tenant model
- **Full control** — customize any behavior without waiting for a vendor roadmap

### What Better Auth Provides

- Email/password authentication with secure hashing (Argon2)
- Magic link (passwordless) authentication
- OAuth2 social login (Google, GitHub, Apple — merchant staff)
- Multi-factor authentication (TOTP, SMS)
- Session management with refresh token rotation
- Organization/tenant management (maps to our tenant model)
- API key management
- Rate limiting on auth endpoints
- Brute force protection
- Device session tracking (list active sessions, revoke specific sessions)

---

## 2. Auth Layers

Sparx has two distinct user populations requiring auth:

### Layer 1 — Merchant Staff (Platform Users)

Staff members managing a Sparx merchant account.

```
Merchant Owner (Brandon's contact at GDS)
├── Creates Sparx account → becomes tenant owner
├── Invites staff → they receive email invite → set password
├── Staff auth: email/password OR magic link OR Google OAuth
└── Session: JWT (15 min) + refresh token (30 day, HTTP-only cookie)
```

Better Auth's organization plugin maps directly: **Organization = Tenant**. Organization member = Staff user with role.

- Organization = Tenant
- Organization member = Staff user with role
- Roles: owner | admin | editor | viewer

Example: Merchant Owner (e.g., Brandon's contact at Gillett Diesel Service) creates a Sparx account → becomes tenant owner → invites staff via Better Auth's organization invitations.

### Layer 2 — Merchant's Customers (Storefront Users)

End customers logging into a merchant's storefront, B2B portal, or account page.

```
Customer of "Gillett Diesel"
├── Registers on gillettdiesel.com storefront
├── Auth scoped to GDS tenant (cannot log into other storefronts)
├── Email/password OR magic link (no Google OAuth — keeps it clean)
└── Session: separate JWT pool, tenant-scoped
```

Critical: a customer account at Tenant A has zero relationship to Tenant B. The same email address can register as a customer at multiple merchants — they are completely separate records with separate credentials.

### Layer 3 — API Keys (Programmatic Access)

For headless frontends, MCP servers, and third-party integrations.

```
Format: sparx_live_{tenant_short_id}_{32_random_hex}
        sparx_test_{tenant_short_id}_{32_random_hex}

Storage: Full key shown once at creation
         SHA-256 hash stored in DB for lookup
         Prefix + tenant_short_id stored for identification
         (Display prefix `sx_live_` + short tenant ID is stored
          alongside the hash for identification; the secret portion
          is hashed and never persisted.)

Scopes: Granular (read:orders, write:inventory, mcp:read, etc.)
Expiry: Optional — set at creation (none, 30d, 90d, 1y)
Rotation: Old key valid for configurable overlap window
```

---

## 3. Session Management

### JWT Structure

```typescript
// Access token payload
{
  sub: userId,              // Better Auth user ID
  tid: tenantId,            // Tenant context
  role: 'admin',            // Staff role
  layer: 'staff' | 'customer',
  scopes: string[],         // For API keys
  iat: timestamp,
  exp: timestamp            // 15 min for staff, 7 days for customers
}
```

### Refresh Token Rotation

- Refresh token is opaque random bytes (not JWT)
- Stored hashed (SHA-256) in DB via Better Auth
- Single-use: new refresh token issued on every refresh
- Token family tracking: if old refresh token is reused → entire family revoked (theft detection)
- All active sessions visible in dashboard → user can revoke any session

### Tenant Context Establishment

After JWT validation, API middleware sets database tenant context:

```typescript
fastify.addHook('preHandler', async (request) => {
  const user = await betterAuth.validateToken(request.headers.authorization);
  request.tenantId = user.tid;
  await db.$executeRaw`SET LOCAL app.tenant_id = ${user.tid}`;
});
```

A minimal per-request hook that issues `SET LOCAL app.tenant_id` once the
tenant has been resolved:

```typescript
app.addHook('preHandler', async (req) => {
  if (req.tenant) {
    await req.db.execute(`SET LOCAL app.tenant_id = '${req.tenant.id}'`);
  }
});
```

---

## 4. Multi-Tenancy & Data Isolation

### Row Level Security (RLS)

Every tenant-scoped table enforces isolation at the database level:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  AS PERMISSIVE FOR ALL TO application_user
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

This is a backstop — if application-level tenant filtering has a bug, RLS prevents cross-tenant data leaks at the database level.

### FORCE RLS — Closing the BYPASSRLS Hole (Decision F3)

**Tenant-scoped tables** use `ALTER TABLE <table> FORCE ROW LEVEL SECURITY;` so even table owners (the app role) cannot bypass policies — closing the BYPASSRLS hole. **Shared/global tables** (e.g., `tenants`, `plans`, `modules`, `migrations`) do not use FORCE since they're intentionally readable across all tenant contexts.

### Enterprise Isolation

Enterprise clients (like Gillett Diesel) can have a dedicated Cloud SQL instance. Same application code, different connection target resolved from tenant configuration.

---

## 5. Authorization (RBAC)

### Staff Roles

| Role     | Capabilities                                                    |
| -------- | --------------------------------------------------------------- |
| `owner`  | Everything including billing, tenant deletion, staff management |
| `admin`  | Everything except billing and tenant deletion                   |
| `editor` | CRUD on products, orders, customers, content                    |
| `viewer` | Read-only all data                                              |
| `api`    | Scope-based access via API key only                             |

### Customer Roles (B2B Portal)

| Role            | Capabilities                                           |
| --------------- | ------------------------------------------------------ |
| `account_admin` | Manage contacts, approve purchases, full portal access |
| `buyer`         | Place orders, submit RFQs, view history                |
| `viewer`        | View orders and invoices only                          |

### Enforcement (Defense in Depth)

Authorization checked at both route level (fast reject) and service level (defense in depth):

```typescript
// Route level
fastify.addHook('preHandler', requireRole('editor'));

// Service level — never trust route-level alone
async function updateProduct(userId: string, productId: string, data: UpdateInput) {
  const user = await getUser(userId);
  if (!hasPermission(user.role, 'products.write')) {
    throw new ForbiddenError();
  }
}
```

Tenant scoping follows the same defense-in-depth pattern — the route guard
attaches `req.tenant`, and the service layer re-validates before any DB
access:

```typescript
// Route guard
app.get('/orders/:id', { preHandler: requireTenant }, async (req) => {
  // Service still re-validates
  return orderService.getById(req.params.id, { tenantId: req.tenant.id });
});
```

---

## 6. Data Encryption

### At Rest

- Cloud SQL: Google-managed AES-256
- GCS: Google-managed AES-256
- Sensitive fields (API credentials, DKIM private keys, Postal credentials, payment tokens): application-level AES-256-GCM before storage, key in Google Secret Manager

### In Transit

- TLS 1.3 for all external connections
- TLS 1.2 minimum for internal service-to-service
- HSTS: max-age=31536000; includeSubDomains; preload

### PII Handling

Customer PII (name, email, phone, address) is:

- Never written to application logs
- Masked in error reporting (Sentry)
- Exportable by merchant (GDPR data export)
- Deletable on customer request (GDPR right to erasure, anonymizes while retaining order records for accounting)

---

## 7. Audit Logging

Every state-changing operation logged:

```typescript
{
  id: uuid,
  tenant_id: uuid,
  actor_id: uuid | null,
  actor_type: 'staff' | 'customer' | 'system' | 'api' | 'mcp',
  actor_ip: string,
  action: string,           // 'order.status.updated', 'customer.created'
  entity_type: string,
  entity_id: uuid,
  before: JSON | null,
  after: JSON | null,
  diff: JSON | null,
  created_at: timestamp
}
```

Logged: all data mutations, auth events (login/logout/failed/reset), permission changes, billing events, admin overrides, MCP tool calls (sanitized), webhook deliveries.

Retention: 90 days queryable in dashboard, 2 years in GCS cold storage, 7 years for Enterprise.

---

## 8. Security Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: [per-page policy]
```

---

## 9. Input Validation & Injection Prevention

- All API inputs validated with Zod schemas before processing
- Prisma ORM parameterizes all queries — no raw string interpolation
- User-generated HTML sanitized with DOMPurify before storage
- React JSX escaping handles XSS in rendered output
- SameSite=Strict cookies for CSRF protection

---

## 10. GDPR & Privacy Compliance

Merchant tools: data export, right to erasure, consent tracking (timestamp + IP), cookie consent banner, data retention configuration.

Sparx is data processor; merchants are data controllers. DPA available for all merchants, required for EU merchants.

---

## 11. Vulnerability Management

- npm audit + Trivy in CI on every PR
- Dependabot auto-PRs for security updates
- Annual penetration test
- OWASP Top 10 review before each major release
- Bug bounty program (responsible disclosure policy)

Breach notification: affected merchants notified within 72 hours per GDPR.
