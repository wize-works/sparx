# 32 — Workspace Switching & the Smart Breadcrumb

**Version:** 0.2 (Phase 1 shipped)
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Purpose

The dashboard header's "smart" breadcrumb (`apps/dashboard/.../breadcrumb-trail.tsx`)
was built to the shape in [24-dashboard-shell.md §4.2](24-dashboard-shell.md) but two
segments were left under-implemented. This doc plans the work to finish them and,
critically, to de-risk the part that has no backend yet: **switching between the
workspaces a user belongs to**.

Two behaviors are in scope:

1. **Segment 1 — Workspace.** The leftmost segment names the current workspace and,
   on click, opens a menu to **switch** to another workspace the user belongs to,
   **create** a new one, or jump to **settings** to manage them.
2. **Segment 2 — Module.** The next segment names the active module (Sitebuilder,
   Commerce, CMS, …). Clicking the label navigates to that module's home; the
   dropdown lets you **switch to a sibling module**, with the active one marked.

The risk is not evenly distributed: segment 2 ships today with zero backend
dependency, while segment 1's switch/create depends on auth machinery that is
**deliberately turned off**. The phasing below isolates that risk.

## 2. Terminology

- **Tenant** — the internal entity. Every tenant-scoped table FKs to `tenants.id`;
  RLS isolates on it. This name stays in code, schema, APIs, and these docs.
- **Workspace** — the **user-facing** name for a tenant. Dropdown copy is
  "Create workspace", "Manage workspaces", "Switch workspace". Chosen over
  store/shop/site because a tenant may run any mix of modules (a CMS-only or
  email-only tenant is not a "store"). The breadcrumb segment itself always
  renders the workspace's **name** (e.g. "Gillett Diesel"), never the noun.

> One tenant = one Better Auth organization (1:1), per
> [02-architecture-overview.md](02-architecture-overview.md) and
> [16-auth-security.md §2](16-auth-security.md). "Workspace" is the label on top
> of that pair. There is **no** separate `Store`/`Site` model and we are not
> introducing one.

## 3. Current state

### 3.1 What works

- The breadcrumb renders `Tenant › Module › Section › Page` with responsive
  collapse to a `…` popover. Segment 1 already shows the tenant name; its menu has
  _Workspace settings_ + _Sign out_.
- Segment 2 (module) renders in the module accent color and, on click, opens a
  menu of **that module's sections** (lateral nav).
- RLS context flows end to end: `User.tenantId` → session (`requireSession()`,
  `packages/auth/src/session.ts`) → `withTenant({ tenantId })` (`@sparx/db`) →
  `SET LOCAL app.tenant_id` → RLS `tenant_isolation` policy.

### 3.2 What does not exist yet (the gap)

- **One user belongs to exactly one tenant.** `User.tenantId` is a scalar column
  set once at sign-up (`packages/auth/src/sign-up.ts`). There is no membership
  join table, no "active organization", no `setActive`.
- **The Better Auth organization plugin is intentionally OFF**
  (`packages/auth/src/server.ts:14` — "the organization plugin … is intentionally
  NOT enabled yet"). Switching/creating tenants therefore has **no API to call**.
- The shell renders **all** module manifests without filtering by the tenant's
  enabled-module set, even though §4.2 says inactive modules should be hidden.
  The module switcher must respect the enabled set.

### 3.3 Deviation from the existing spec

[24-dashboard-shell.md §4.2](24-dashboard-shell.md) currently says the **Module**
popover lists _that module's sections_. Segment-2's new behavior (switch to sibling
modules) changes that. Sections remain reachable via segment 3 and the sidebar, so
nothing is lost — but **§4.2 must be updated** when Phase 1 lands (see §8).

## 4. Target UX

```
 [Gillett Diesel ▾]  ›  [Commerce ▾]  ›  [Orders]      ⏱  ⋯  ★  🌓
   └ workspace menu       └ module switcher   └ section (link)
```

**Segment 1 — Workspace menu**

- Header: current workspace name + plan badge.
- List: other workspaces the user is a member of (✓ on the active one). Selecting
  one switches the active tenant and re-scopes the whole session.
- `+ Create workspace` → onboarding ([15-merchant-onboarding-prd.md](15-merchant-onboarding-prd.md)).
- `⚙ Manage workspaces` → `/settings` (workspace settings + members + invites).
- `Sign out`.
- Single-membership case: no switch list; just create / manage / sign out.

**Segment 2 — Module switcher (desktop)** — _split control (locked)_

- The module name is a **link** → the active module's `routePrefix` home.
- An adjacent `▾` button opens the switcher: **enabled** sibling modules, each a
  link to its home, active one checked + accent-colored.

**Mobile (< md) — condensed chip + bottom sheet (locked)**

The multi-segment trail does not fit a phone header, and the two switchers are
exactly the segments that would collapse into `…`. So below `md` the trail becomes
a single **context chip** (module-color dot + current module/page name + `▾`) that
opens a **bottom sheet** with grouped, full-width touch rows:

- **Workspace** — name (✓) + settings + sign out (switch/create gated to Phase 2).
- **Modules** — enabled set, active checked.
- **\<Module\> pages** — the current module's sections (lateral nav, surfaced here
  since the desktop module menu no longer lists sections).

Desktop/mobile are toggled by Tailwind `md:` visibility (both in the DOM), not a
post-mount media query — avoids a first-paint flash. The bottom sheet is shared
infrastructure: Phase 2 lights up its Workspace group's switch/create rows.

## 5. Phased plan

Each phase is independently shippable and pushed on its own (small-deploy
discipline). Phases 1–2 are pure frontend; the auth-heavy work is quarantined to
phases 3–5.

### Phase 0 — This document & decisions ✅

Locks terminology (Workspace), confirms tenant = workspace = Better Auth org, and
records the sequencing decision (ship UI first, defer switching). No code.

### Phase 1 — Module switcher + mobile sheet ✅ _shipped 2026-05-30_

What landed:

- **`listEnabledModules(tenantId)`** added to `@sparx/auth`'s module-gate (one
  `tenants` read, same default-deny as `isModuleEnabled`). Computed in the
  dashboard `layout.tsx` and threaded through `DashboardShell` →
  `BreadcrumbTrail` + the sidebar `NavSections`.
- **Sidebar Modules section** now filters to the enabled set (closes the §3.2
  gap — disabled modules no longer render).
- **Desktop module segment** rebuilt as a split control (label → home, `▾` →
  enabled-sibling switcher, active checked + accent). The module segment is now
  interactive even when it is the current page.
- **Mobile** breadcrumb rebuilt as the condensed chip + bottom sheet described in
  §4. Desktop/mobile toggled by `md:` visibility.
- [24-dashboard-shell.md §4.2 + §4.2.1](24-dashboard-shell.md) updated.
- Typecheck + lint clean (no new warnings); no schema, no auth changes.

Deferred from this phase: automated tests (unit for active-marking/enabled-filter,
Playwright for the dropdown + bottom sheet) — see §9 / TODO.

### Phase 2 — Workspace segment UI (segment 1) — _switching still gated_

- Rename copy to "Workspace" throughout the menu; keep showing the real workspace
  name.
- Wire the actions that work **today**: `⚙ Manage workspaces` → `/settings`,
  `Sign out`.
- Render `Switch workspace` and `+ Create workspace` as first-class affordances but
  **disabled with a "coming soon" treatment** until Phase 4/5. No fake switching.
- **Risk:** low. **Outcome:** the final visual/IA is in place; only the gated
  actions light up later, so no rework of the menu when the backend lands.

### Phase 3 — Enable Better Auth organizations — _auth + data foundation_

The load-bearing phase. Turn on the org plugin and back-fill the 1:1 mapping
without breaking the scalar-`tenantId` world that everything currently reads.

- Add Better Auth `organization` plugin to `createAuth()` (`server.ts`) and its
  client counterpart.
- Migration (hand-authored SQL via the DB Migrate pipeline — Cloud SQL is
  private-IP, never local): create `organization` / `member` / `invitation` tables;
  back-fill one organization per existing tenant (org.id = tenant.id to keep the 1:1
  mapping literal) and one `member` row per existing user from `User.tenantId`.
- Decide the source of truth for "active tenant": Better Auth's
  `session.activeOrganizationId`. `getSession()` resolves
  `tenantId = activeOrganizationId` (falling back to `User.tenantId` during
  transition). **RLS is unchanged** — only the value feeding `app.tenant_id`
  changes; isolation guarantees stay identical.
- Membership is the new authorization gate: a user may only set-active an org they
  are a `member` of. RLS remains the backstop.
- **Risk:** HIGH — touches every `tenantId` consumer, sign-up, and the session
  shape. Mitigations in §6.

### Phase 4 — Wire workspace switching — _segment 1 lights up_

- API: `GET /v1/me/workspaces` (memberships for the current user),
  `POST /v1/me/active-workspace` (set active org → membership-checked → new
  session). API-first per CLAUDE.md before the UI consumes it.
- Switching re-scopes the session; the dashboard `router.refresh()`es so server
  components re-fetch under the new tenant. Verify `withTenant` in api-rest reads
  the new active tenant on the next request.
- Enable the `Switch workspace` list in segment 1.
- **Risk:** medium. **Test:** integration — a user in two orgs sees only each
  org's rows after switching; a user cannot set-active an org they don't belong to
  (membership + RLS both enforce).

### Phase 5 — Create workspace — _segment 1 fully live_

- `+ Create workspace` routes into onboarding ([15](15-merchant-onboarding-prd.md));
  refactor `signUpMerchant`'s tenant-creation into a reusable "create tenant +
  membership + org" path that works for an **already-authenticated** user (today it
  assumes a brand-new user). New tenant gets a `member` row for the creator as
  `owner`, then becomes the active workspace.
- Respect the 5-minute onboarding goal — adding a workspace must not be heavier
  than first signup.
- **Risk:** medium (billing: a new workspace is a new billable tenant — coordinate
  with [17-billing-subscriptions.md](17-billing-subscriptions.md)).

### Phase 6 — Members & invitations _(future / optional)_

Invite teammates to a workspace, manage roles. The org plugin ships invitation
primitives; surface them in `/settings`. Out of scope for the breadcrumb itself;
listed so the menu's "Manage workspaces" destination has a known endpoint.

## 6. Risk register

| #   | Risk                                                                                | Phase | Mitigation                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Enabling the org plugin breaks the scalar-`tenantId` read path that all modules use | 3     | Back-fill org.id = tenant.id (1:1 literal); `getSession()` falls back to `User.tenantId` until `activeOrganizationId` is guaranteed; ship behind a check, not a flag-day cutover |
| R2  | A switch leaks cross-tenant data                                                    | 3,4   | RLS is unchanged and remains the backstop; membership check gates set-active; integration test asserts isolation after switch                                                    |
| R3  | Migration must run on private-IP Cloud SQL                                          | 3     | Author against docker Postgres + `prisma migrate dev`, push to `main`, let the DB Migrate workflow + K8s Job apply it — never local Auth Proxy                                   |
| R4  | Throwaway UI if we build segment 1 before the backend                               | 2     | Phase 2 ships the _final_ IA with switch/create gated; only the gated actions light up later — no menu rework                                                                    |
| R5  | Creating a workspace silently creates a billable tenant                             | 5     | Gate behind onboarding + billing confirmation; coordinate with doc 17                                                                                                            |
| R6  | Module switcher shows modules the tenant hasn't paid for                            | 1     | Filter by enabled-module set from the module-gate; closes the existing §3.2 gap as a side effect                                                                                 |
| R7  | Session shape change ripples to api-rest auth context                               | 3,4   | api-rest derives `tenantId` from the same active-org claim; add an integration test through `@sparx/api-core`'s `withTenant` wrapper                                             |

## 7. API & data surface (summary)

- **New tables (Phase 3):** `organization`, `member`, `invitation` (Better Auth
  shapes). Back-fill 1:1 from existing tenants/users.
- **Session (Phase 3):** `tenantId` resolves from `activeOrganizationId`.
- **New endpoints (Phase 4–5):** `GET /v1/me/workspaces`,
  `POST /v1/me/active-workspace`, `POST /v1/workspaces` (create; likely behind the
  onboarding flow).
- **Unchanged:** RLS policies, `current_tenant_id()`, `withTenant()`, every
  module's data access. Only the _value_ of the active tenant becomes switchable.

## 8. Docs to update as phases land

- [24-dashboard-shell.md §4.2](24-dashboard-shell.md) — Module popover behavior
  (sections → sibling-module switch); Tenant→Workspace naming. (Phase 1–2)
- [16-auth-security.md](16-auth-security.md) — org plugin now enabled; membership
  as the active-tenant authorization gate. (Phase 3)
- [05-data-model.md](05-data-model.md) — organization/member/invitation tables and
  the 1:1 tenant↔org mapping. (Phase 3)
- [00-README.md](00-README.md) — add this doc to the index (also stale on 24/27/29+).

## 9. Open questions

1. **Active-tenant source of truth long-term** — keep the scalar `User.tenantId` as
   a "home/default workspace" pointer, or drop it entirely once
   `activeOrganizationId` is authoritative? (Leaning: keep as the default-on-login
   workspace.)
2. **Custom-domain / storefront resolution** — domain → tenant lookup
   ([02 §routing](02-architecture-overview.md)) is independent of the dashboard
   active-org, but confirm switching in the dashboard never affects storefront
   tenant resolution.
3. **Billing on create** — does adding a second workspace start a new subscription
   immediately, or a trial? (Doc 17.)
4. **Role per membership** — a user may be `owner` of one workspace and `editor` of
   another; confirm `role` moves from `User` to `member` in Phase 3.
