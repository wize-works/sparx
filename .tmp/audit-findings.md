# CRM Audit running findings — app.sparx.works (prod, e2e-store tenant)

Target: https://app.sparx.works
Logged in: e2e-staff@sparx.test (E2E Staff)
Tenant: e2e-store
Date: 2026-05-29

## Numbered fails

### F-01 — Home dashboard "active modules" count disagrees with Settings → Modules

- Severity: medium
- Repro: Visit /. Home says "1 of 8 modules active" and renders a CMS active card. Then visit /settings/modules — all 8 modules show **Inactive** status pills (before any activation in this session).
- Suspected cause: home dashboard reads from a different/stale source than the Settings → Modules page. Possible module-activation cache miss or a static demo card that ignores tenant state.
- Suggested fix: home dashboard active-modules section must read the same module-state source the Settings page reads, or be disabled if the tenant has no active modules.

### F-02 — /crm landing route renders ModuleStub even when CRM is Active

- Severity: critical
- Repro: Activate CRM via /settings/modules. /crm/pipelines and /crm/segments render full CRM UI with module-active state. But /crm (which the audit prompt + sub-nav both treat as the customer list landing) renders the ModuleStub ("CRM is coming online", "Planned" feature cards). Cache:reload + no-cache header — same result. /crm/duplicates server-redirects to /crm → ModuleStub, so duplicates is also unreachable.
- Screenshot: .playwright-mcp/F-02-crm-root-modulestub-when-active.png
- Suspected cause: the /crm/page.tsx server component module gate is not consulting the same active-module state as the sibling /crm/(pipelines|segments)/page.tsx, OR the page was prerendered with CRM=off and never invalidated.
- Suggested fix: ensure /crm/page.tsx checks the same module-active value the sub-route pages do; revalidate the path when module.activated fires.

### F-03 — `--module-active` resolves to Sparx Indigo `#6366f1` on every CRM page, not Cyan `#06B6D4`

- Severity: high (brand regression)
- Repro: On every /crm/\* page tested (pipelines, segments, tasks, b2b, reports, pipelines/[id], pipelines/[id]/edit, segments/[id]), `getComputedStyle(document.documentElement).getPropertyValue('--module-active')` returns `#6366f1` (Sparx Indigo = Storefront color). Per CLAUDE.md + sparx-brand-guide.md, **CRM color is Cyan `#06B6D4`**. ModuleProvider is supposed to set this automatically when wrapping the route group.
- Suspected cause: ModuleProvider isn't being rendered around the CRM route group, OR it's hardcoded to indigo (the default Storefront color), OR the `--module-active` value isn't reading from the module token map for CRM.
- Suggested fix: verify the `<ModuleProvider module="crm">` wraps `apps/dashboard/app/(dashboard)/crm/layout.tsx`; check the module→color map includes `crm → #06B6D4`.

### F-04 — api.sparx.works exposes no CORS headers and no /api/\* proxy on app.sparx.works

- Severity: low (architectural / documentation gap, not necessarily a bug)
- Repro: From the dashboard browser context at https://app.sparx.works, `fetch('https://api.sparx.works/v1/crm/customers')` fails with CORS error ("No 'Access-Control-Allow-Origin' header"). `fetch('/api/v1/crm/customers')` on app.sparx.works returns 404 (HTML next.js not-found).
- This means: the audit prompt's REST-API smoke (#29) is only possible via curl + API key, not via the logged-in browser session.
- Suggested fix: either add CORS for app.sparx.works → api.sparx.works (if dashboard ever needs client-side fetches) or document explicitly that the dashboard uses Next.js Server Actions exclusively and that public API consumers must use issued API keys.

### F-05 — Orders & Quotes pages exist but are not in the CrmTabs sub-nav

- Severity: medium (UX / discoverability)
- Repro: /crm/orders and /crm/quotes both render their list pages (H1 "Orders" / "Quotes", 0-items empty state). But the CrmTabs sub-nav at the top of CRM pages only lists Customers, Pipelines, Segments, Tasks, B2B accounts, Reports, Duplicates. A user has no way to navigate to Orders or Quotes from within the CRM UI without knowing the URL.
- Suggested fix: either add Orders / Quotes tabs to CrmTabs, or move those routes under /crm/customers/[id]/orders + /crm/deals/[id]/quotes if they're only meant to be deep-linked from related records.

## Pass list

### /settings/modules

- All 8 modules listed with descriptions + Activate/Deactivate buttons. Activation worked end-to-end.
- Buttons are not disabled for E2E Staff — implies owner-level permission for this tenant. Could not test the non-owner-disabled-toggle path (no non-owner account available).
- After activate: no visible success toast (UX nit — audit standard expects Saved indicator within 600ms).

### /crm/pipelines

- 1 pipeline (Sales Pipeline) with Default badge, slug `sales`.
- Stage mini-funnel renders 6 stages with probabilities: Lead 10, Qualified 25, Proposal Sent 50, Negotiation 75, Closed Won 100, Closed Lost 0.
- `Show archived` toggle present.
- `New pipeline` and `Edit pipeline` CTAs present. List/Forecast/Open Kanban view-switcher present per pipeline.

### /crm/pipelines/[id] (Kanban view)

- H1 "Sales Pipeline" ✓. 6 columns render with the correct stage names. View switcher (Kanban/List/Forecast) wired. No deals seeded so I could not exercise drag-drop in the read-only walk.

### /crm/pipelines/[id]/edit

- H1 "Edit Sales Pipeline" ✓. 24 inputs across 6 stages (each row: name + probability number + stageType select). Drag/reorder copy present, Archive pipeline button present (no Delete — correct per spec since stages with deals can't be deleted). Each stage has its own Save button (per-stage save UX — note this is unusual; most editors batch-save).

### /crm/segments

- 4 built-in segments (At Risk, B2B Fleet, High Value, New Customers), each tagged `Built-in`, slug + description + 0 members + Open link.
- Top-of-page Recompute button + New segment + Show archived CTAs.
- **Copy nit**: audit spec called for `System` badge; impl renders `Built-in`.

### /crm/segments/[id] (At Risk built-in)

- H1 "At Risk" ✓. Sections: Rule + Members 0. Has Clone and Edit (Edit is allowed even for built-in — audit prompt says "Cannot edit built-in — clone first"; the edit link is present but I did not click through to see if it's a soft-disable or actually disallowed mid-form). 0 editable inputs in the detail view.

### /crm/tasks

- H1 "Tasks" with `0 open`. Scope tabs `My tasks` / `Team tasks` present. `New task` CTA present. Empty state "No open tasks" with helpful copy.
- **Gap**: audit prompt expects Open / Overdue / Completed sections each with their own counts. On empty state only "Open 0" renders — Overdue and Completed sections are not visible. May only render when there's content. Could not verify on empty tenant.

### /crm/b2b

- H1 "B2B accounts" ✓. Empty state present.
- **Gap**: audit prompt expects status filter chips (active / credit_hold / suspended / inactive) — they don't appear in the visible UI on an empty list. May only render with data.

### /crm/reports

- H1 "Reports" ✓.
- 4-stat row: CUSTOMERS=0, B2B ACCOUNTS=0, OPEN DEALS=0, OPEN TASKS=0.
- **Copy mismatch**: audit prompt called for the 4th stat to be `Overdue tasks`; impl shows `OPEN TASKS`.
- Sections present: `Pipeline funnel — Sales Pipeline`, `Win/loss by rep`, `Customer acquisition (last 12 months)`.

### /crm/orders

- H1 "Orders" + `0 orders` empty state. CrmTabs sub-nav NOT present on this page (see F-05).

### /crm/quotes

- H1 "Quotes" + `0 quotes` empty state. CrmTabs sub-nav NOT present on this page (see F-05).

## Routes NOT yet walked

- /crm/customers/new — needs validation walk
- /crm/customers/[id] — needs a customer id (will get one in mutation phase)
- /crm/duplicates — currently unreachable (F-02 cascade)
- /crm/pipelines/new — needs validation walk
- /crm/deals/new — needs validation walk
- /crm/deals/[id] — needs a deal id (mutation phase)
- /crm/segments/new — needs validation walk
- /crm/tasks/new — needs validation walk
- /crm/b2b/new — needs validation walk
- /crm/b2b/[id] — needs a b2b account id (mutation phase)
- /crm/orders/new, /crm/orders/[id]
- /crm/quotes/new, /crm/quotes/[id]
- /settings/ai-integrations — mutation phase
- /welcome — onboarding checklist

## Mutation phase

(Will populate as I run mutations to create the test seeded data needed for [id] routes.)

## Non-browser surfaces

(Will run after browser walk completes — REST via curl + API key issued in mutation phase, GraphQL same path, MCP confirmation parked-state, webhook fan-out, cron read-only kubectl, OpenAPI.)
