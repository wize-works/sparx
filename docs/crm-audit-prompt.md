# Task: full functional + UX audit of the Sparx CRM module

You are picking up the Sparx CRM at the moment its Phase 1–6 implementation finished. The job is to drive the CRM in a real browser end-to-end, exercise every page, every button, every form field, every modal, every state — AND apply an _impeccable_ UX audit at the same time. The user wants to be able to check "CRM" off the books with confidence.

Do NOT mark a page or component as passing if it has UX slop. "Renders without crashing" is not the bar. Read the UX standards section before you touch anything.

## Context you need

- Repo root: `g:\code\@wizeworks\sparx.works`
- The dashboard CRM lives in `apps/dashboard/app/(dashboard)/crm/`. Backend REST is `services/api-rest`. GraphQL is `services/api-graphql`. MCP is `services/api-mcp`. Service layer is `packages/crm`. Shared schemas: `packages/crm-schemas`.
- The plan that was implemented is at `C:\Users\brand\.claude\plans\swift-enchanting-puffin.md` — read the seven locked decisions and the per-phase deliverables so you know what was _supposed_ to ship. The plan and the actual implementation map 1:1 for Phases 1–6.
- Project rules in `g:\code\@wizeworks\sparx.works\CLAUDE.md` are binding — especially: no raw Tailwind in app code, every Card carries the module stripe via `<Card variant="module">`, ModuleProvider wraps the route group, Tailwind tokens come from `packages/ui/src/tokens.css`, **CRM color is Cyan `#06B6D4`** (per the brand guide). Verify the active module color resolves to cyan on every CRM page via `getComputedStyle(node).getPropertyValue('--module-active')`.
- Read the user's `MEMORY.md` at `C:\Users\brand\.claude\projects\g--code--wizeworks-sparx-works\memory\MEMORY.md` before starting — there are CORE rules (no git stash, no --no-verify, no Co-Authored-By, no manual kubectl, respect architectural boundaries) that bind your behavior. Open the linked memory files for full context on any rule you're about to brush against.
- The CRM is the module that _introduces_ the customer / B2B / deal / pipeline / activity / task / segment spine — every other module (Commerce, B2B, Email) hangs off these tables later. Test under that assumption: customers and B2B accounts already exist before Commerce attaches orders.
- **Known parked state:** `api-mcp` is scaled to 0 replicas until the SSD_TOTAL_GB quota is bumped (see `k8s/apps/api-mcp.yaml` header). `mcp.sparx.works` therefore returns 502 from Caddy. Do NOT flag this as a bug — flag it under Notes if you find any UI in the dashboard that points at MCP without explaining the parked state.
- Cross-process activation note: dashboard pods and api-rest pods have independent module-gate LRU caches with 60s TTL. When you flip a module via Settings → Modules, expect api-rest to lag by up to 60s before its REST/GraphQL surfaces honor the new state. This is documented behavior, not a bug.

## Surface to test (every route, every state)

Authenticate first (Settings → Modules → make sure CRM is **Active** before you start), then walk each in order. For every route, exercise the happy path, the validation errors, the empty state, the loading state, the error state, and any modal/dropdown/confirm dialog it owns.

### Dashboard — top-level CRM nav

The `CrmTabs` sub-nav is at the top of every top-level CRM page. Confirm every tab routes correctly and the active tab highlight is on the right one for each route.

1. `/crm` — customer list (this IS the landing — there is no `/crm/customers`)
   - Filter bar (type chip group, tag filter, search `?q=`), sort selector, "Find duplicates" CTA, "New customer" CTA
   - Empty state, full-list state, paginated state
   - Click a row → `/crm/customers/[id]`
2. `/crm/customers/new`
   - Type selector (prospect / retail / b2b — the `B2B contact` form should reveal a B2B account picker)
   - Required-field validation (email format, name required), tag input parser, save → redirect to detail
3. `/crm/customers/[id]` — unified customer record
   - Profile header (name, email, phone, company, tags, do-not-contact, assigned rep, GDPR consent)
   - Stat row: total spent, order count, AOV, lifetime days, segment chips
   - B2B card (visible only if linked) with pricing tier, credit progress bar, payment terms
   - Tabs: Activity (infinite scroll, infinite-scroll loading state), Orders, B2B, Deals, Tasks, Notes
   - Right rail: "Add activity" forms (note / call / meeting / task / file.attached). Each goes through `activityService.record`.
   - "Edit" → inline edit, "Merge" → opens the merge dialog
   - Append-only correctness: edit a note → confirm a new row appears with `corrects_activity_id` pointing at the original (check the activity timeline order)
4. `/crm/duplicates` — find-duplicates UI
   - Groups by shared email + (lastName, company) similarity
   - Pick primary, two-pane diff, "Merge" → secondary disappears from list, activities reattach
5. `/crm/pipelines` — pipeline index
   - Each pipeline card shows stage mini-funnel, deal-count badge
   - `?includeArchived=1` toggle
   - "New pipeline" CTA, "Edit" link → `/crm/pipelines/[id]/edit`
6. `/crm/pipelines/new`
   - Name + slug + isDefault checkbox + stage list editor (auto-applies the DEFAULT_PIPELINE_TEMPLATE if untouched)
7. `/crm/pipelines/[id]` — Kanban + list + forecast views
   - `?view=kanban` (default), `?view=list`, `?view=forecast` — share data, switch render
   - Drag a deal across columns: optimistic update, server sync, refresh persists, activity feed shows `crm.deal.stage_changed`
   - Move-to-won / move-to-lost stage → confirm `closedAt` + `closedReason` get set
   - Forecast view: sums weighted values correctly (probability × value, grouped by month)
8. `/crm/pipelines/[id]/edit` — stage editor
   - Add stage, reorder via drag, rename, change probability, change stageType (open/won/lost), delete (rejected if deals reference)
   - Save → `pipelineService.reorderStages` runs in one transaction, no UNIQUE constraint flap
9. `/crm/deals/new`
   - Pipeline + stage picker (stage list reloads when pipeline changes — no stale options)
   - Customer OR B2B account anchor (XOR enforced)
   - Title, value, currency, probability, expectedCloseDate, assignedRep, source, tags
10. `/crm/deals/[id]` — deal detail
    - Profile, value + probability slider, expectedCloseDate, assignedRep, attached customer / B2B
    - Attach Order popover: search by order number, attach → `deal_orders` row created, `orders` table NOT touched
    - Attach Quote popover: same shape
    - Activity feed scoped to the deal
    - Tasks scoped to the deal
11. `/crm/segments` — list (built-ins + custom)
    - 4 built-in segments (high-value, at-risk, b2b-fleet, new-customers) appear with the `System` badge, are cloneable but not deletable
    - Member count per segment renders
    - "Recompute" button on each (triggers `segmentService.recomputeFull`)
12. `/crm/segments/new`
    - Rule builder (recursive AND / OR / NOT tree; leaf predicate row with field + op + value)
    - Field autocomplete shows the documented SegmentField enum only (customer._, b2bAccount._, email.\*)
    - Operator menu adapts to field type (no `gt` on a string field, no `contains` on a number)
    - "Preview count" calls `segmentService.previewCount` — sub-second feedback on every rule edit
    - Save → redirect to detail, member list materialises within a few seconds
13. `/crm/segments/[id]` — detail + member list
    - Edit rules, archive (soft), member table with pagination
    - Cannot edit built-in (`isBuiltIn=true`) — clone first
14. `/crm/tasks` — task list
    - Scope toggle: "Mine" vs "All" (`?scope=me|all`)
    - Open / overdue / completed sections with their own counts
    - Overdue badge color is the warning/danger variant — confirm on a stale task
    - Row click → opens the task drawer (or jumps to attached customer/deal)
15. `/crm/tasks/new`
    - Title, description, dueAt (date+time), priority (low/medium/high/urgent), assignedToUserId, customer / deal anchor
16. `/crm/b2b` — B2B accounts list
    - Status filter (`active | credit_hold | suspended | inactive`), search by company
    - Status pills use the correct variant per status (active=success, credit_hold=warning, suspended=danger, inactive=outline)
17. `/crm/b2b/new`
    - companyName, taxId, website, pricingTier, creditLimit, creditUsed, paymentTerms, discountPercent, status, fleetSize, engineProfiles JSON, notes, tags, assignedRep
    - JSON field shows a structured validator, not raw `<textarea>`
18. `/crm/b2b/[id]` — B2B account detail
    - Linked contacts (customers with `b2bAccountId = this`), credit utilization meter, payment-terms display
    - **Credit Hold toggle** — flips status `active ↔ credit_hold`, fires audit + event, confirms cleanly
19. `/crm/orders` — orders list (under CRM because the orders schema landed with the CRM module)
20. `/crm/orders/new`
21. `/crm/orders/[id]` — order detail (line items, payments, refunds, fulfillments — exercise each sub-action)
22. `/crm/quotes` — quotes list
23. `/crm/quotes/new`
24. `/crm/quotes/[id]` — quote detail
    - **Lifecycle actions** (`quote-lifecycle-actions.tsx`): submit, accept, decline, expire — each fires the matching `crm.quote.*` event
25. `/crm/reports` — KPI snapshot + funnel + win/loss + acquisition
    - 4-stat row renders (customers, B2B accounts, open deals, overdue tasks)
    - Pipeline funnel uses stage colors from `kanban-types.stageColor`
    - Win/loss table groups by rep correctly
    - Acquisition bar chart uses the right max-scale (no flat bars when there's data)

### Dashboard — Settings surface for the CRM

26. `/settings/modules` — module activation
    - All 8 modules listed (Storefront, Commerce, CMS, CRM, Email, B2B, Dropship, AI)
    - Owner can flip each toggle; non-owner sees toggles disabled with the help text
    - Activating CRM: confirm the **default pipeline** + the **4 built-in segments** appear in `/crm/pipelines` and `/crm/segments` within a second (bootstrap runs in-process from the action)
    - Deactivating CRM: confirm `/crm` re-renders ModuleStub immediately (local cache invalidated) and api-rest follows within 60s
27. `/settings/ai-integrations` — external API key issuance
    - Issue a key: scopes `read:crm`, `write:crm`, `write:crm_bulk`. The plaintext is shown ONCE — confirm the reveal panel works, copy-to-clipboard works, and the plaintext is not present in any subsequent page render or network response.
    - Issued key shape: `sk_live_<8 base32>_<32 base32>` — verify by inspection
    - Revoke: confirm the row badges change to `Revoked` and the live-keys count drops
    - Edge cases: try issuing with empty name → validation, with no scope checked → validation
    - Authorize: `curl -H "Authorization: Bearer <key>" https://mcp.sparx.works/v1/mcp` — note that mcp.sparx.works is parked (502), so test instead by hitting the dev MCP at `http://localhost:<port>/v1/mcp` if you boot it locally
28. `/welcome` and any onboarding banner — confirm CRM activation surfaces correctly in the onboarding checklist if/when the module is off

### Non-dashboard surfaces (smoke + correctness)

These are not browser flows but they ARE part of the CRM module and must work for the audit to pass.

29. **REST API at `/v1/crm/*`** — confirm against `services/api-rest/src/routes/v1/crm/*`:
    - `GET /v1/crm/customers` with JWT, with API key (`Bearer sk_live_...`) — both must work
    - `GET /v1/crm/customers/{id}`, `POST /v1/crm/customers`, `PATCH`, `DELETE` (soft), `POST /v1/crm/customers/merge`, `POST /v1/crm/customers/{id}/assign`, `POST /v1/crm/customers/{id}/tag`
    - `GET /v1/crm/pipelines`, `POST`, `PATCH`, `DELETE`, `POST /v1/crm/pipelines/{id}/stages`, `POST /v1/crm/pipelines/{id}/stages/reorder`, `PATCH /v1/crm/pipelines/{id}/stages/{stageId}`
    - `GET /v1/crm/deals`, `POST`, `PATCH`, `POST /v1/crm/deals/{id}/move-stage`, `POST /v1/crm/deals/{id}/attach-order`, `POST .../attach-quote`, `GET /v1/crm/deals/forecast`
    - `GET /v1/crm/b2b-accounts`, full CRUD, `POST /v1/crm/b2b-accounts/{id}/credit-hold`
    - `GET /v1/crm/activities`, `POST /v1/crm/activities`
    - `GET /v1/crm/tasks`, `POST`, `PATCH`, `POST /v1/crm/tasks/{id}/complete`
    - `GET /v1/crm/segments`, `POST`, `PATCH`, `DELETE` (archive), `POST /v1/crm/segments/{id}/recompute`, `POST /v1/crm/segments/preview-count`
    - `GET /v1/crm/reports/snapshot`, `.../pipeline-funnel?pipeline_id=`, `.../win-loss`, `.../acquisition`
    - For each: **module gate** — with CRM off, every endpoint returns the documented 404 envelope `{ success:false, error:{ code:'MODULE_DISABLED', details:{ module:'crm' } } }`
    - **OpenAPI** — `GET /v1/openapi.json` must include every path above and tag them under `crm`
30. **GraphQL surface at `/v1/graphql`** — exercise `crmCustomers`, `crmCustomer`, `createCustomer`, `updateCustomer`, `crmDeals`, `moveDealStage`, `crmPipelines`, `crmSegments`, `crmActivities`, `crmReports*` (one query per resolver group is enough — the resolvers all share the service layer so this is a wiring check). Confirm MODULE_DISABLED bubbles as a GraphQL `errors[]` entry, statusCode 200 (Mercurius lifts resolver throws).
31. **MCP transport (local dev only — prod is parked)** — boot `pnpm --filter @sparx/api-mcp dev`, run `tools/list`, run `tools/call` for `get_customers`, `get_top_customers`, `get_pipeline`, `add_crm_activity` (write), `move_deal_stage` (write). Authenticate with both JWT and an issued API key. Confirm:
    - Read tools work with `read:crm` only
    - Write tools rejected without `write:crm`
    - Write tools require confirmation flag (`destructiveHint: true`)
    - **Rate limits** (docs/07 §7): Pro tenant capped at 60/min and 5,000/day; Enterprise at 300/min and 50,000/day; writes capped at 10/min additional. Burn the budget and confirm 429 + `retry-after` header.
32. **Webhook fan-out** — create a `WebhookSubscription` pointed at `https://webhook.site/<unique>`, perform writes, observe deliveries arrive within 30s with the correct HMAC-SHA256 signature header (`x-sparx-signature`). Test failure path: point at a URL that 500s, confirm retry with exponential backoff (30s → 60s → 5m → …), eventual `status='failed'` after 8 attempts.
33. **Scheduled jobs** — confirm presence and triggerability:
    - `kubectl -n sparx-prod get cronjobs` shows the four CronJobs (partition-rollover, automation-triggers, overdue-reminders, segment-recompute)
    - `kubectl -n sparx-prod create job --from=cronjob/crm-partition-rollover one-shot-test` then check logs — must POST to api-rest with the cron token and return 200
    - Confirm `crm_activities_2026_06` partition exists (`SELECT * FROM pg_inherits JOIN pg_class c ON c.oid = inhrelid WHERE inhparent = 'crm_activities'::regclass;` via the migrate workflow's psql, NOT via direct kubectl exec)
34. **Tenant-activation bootstrap event** — fire `module.activated` for crm against a fresh tenant (use the platform-bus in-process if testing locally, or the dashboard Settings → Modules toggle if testing against prod). Within seconds: `pipelines` table has one row with slug `sales` + 6 stages; `segments` table has 4 rows with `isBuiltIn=true`.

## UX audit standards ("impeccable" — apply on every page)

For each route, check ALL of these. If ANY fails, the page does not pass; capture the screenshot, file the bug. Don't move on until you've noted it.

**Layout & visual consistency**

- Every Card carries the CRM cyan top stripe (3px). If a card is missing `variant="module"`, that's a regression — the page is inside `<ModuleProvider module="crm">` so the stripe should be automatic.
- `getComputedStyle(card).getPropertyValue('--module-active')` resolves to a cyan-family hex on every CRM page. Confirm via `browser_evaluate`.
- No raw Tailwind class names leaking into app code — if you view-source and see `bg-indigo-500` or `px-4` in the rendered DOM, that's an architectural violation. App code uses semantic variants only.
- Spacing rhythm: section gaps look like 24/32/40px (the `Stack gap={5}` / `gap={6}` family), not random. Cards inside a section share the same gap.
- Typography: headings use `<Heading level=>`, body text uses `<Text variant=>`. No raw `<h1>` / `<p>` styled with className.
- No 12px-or-smaller text on critical UI. No low-contrast text on light backgrounds.

**Affordance & interaction**

- Primary action on every form is obvious (`variant="module"` button, top-right or bottom-of-card position).
- Destructive actions (Delete, Discard, Revoke key, Deactivate module, Credit Hold ON, Merge primary picker) show a confirm dialog _and_ require active intent — no one-click destruct.
- Disabled buttons explain why (tooltip or inline text). Loading buttons show a spinner via the `loading` prop, not custom spinning icons.
- Form fields show `*` or "Required" on required ones; validation errors appear inline next to the offending field, not only at top of form.
- Focus states are visible on every interactive element. Tab through the page once — focus order must be logical.
- The Kanban drag handles are obvious. Drag-cancel (Esc mid-drag) restores the card to its origin column. Dropping on the same column is a no-op (no `moveStage` call).
- The Rule builder is keyboard-operable: add-group, add-predicate, delete-predicate, change op, all reachable without a mouse.

**State coverage**

- Loading: every fetch shows a skeleton or spinner. No flash of empty content.
- Empty: every list (customers, deals, pipelines, segments, tasks, B2B accounts, activities, duplicates, API keys) has a designed empty state with a clear CTA — not just blank space.
- Error: kill the network in DevTools and reload — an error state must render, not a white screen.
- Saved state: every form that mutates shows a "Saved" / "Created" / "Updated" toast or pill within 600ms.
- MODULE_DISABLED state: deactivate CRM, navigate to any `/crm/*` route — the ModuleStub must render with the correct module name, tagline, planned-features card grid, and the "Activate" CTA pointing at `/settings/modules`.
- Optimistic UI on Kanban drag: card moves instantly; on server failure, card returns to origin with an error toast.
- Conflict on customer edit: the customer record uses an update; concurrent edits should either merge cleanly or surface a recoverable error (no silent overwrite).

**Copy quality**

- No lorem ipsum, no `TODO`, no `FIXME`, no `placeholder` strings, no `<Heading>Untitled</Heading>` left in production.
- Button labels are verbs ("Save customer", "Move stage", "Add activity", "Issue key"), not nouns.
- Help text on non-obvious fields (engineProfiles JSON shape, segment rule field paths, deal probability vs. stage probability, partition rollover) is present and clear.
- Error messages are actionable — "Could not save customer" without context is a bug.
- Domain wording is correct: it's "B2B account" not "wholesale customer"; "Pipeline stage" not "deal column"; "Segment" not "list" (segments are computed; lists imply manual maintenance).

**Accessibility**

- Every form input has a `<Label>` linked via `htmlFor`. Check with DevTools Accessibility panel.
- ARIA: `aria-live="polite"` on toast/save indicators, `role="alert"` on errors, `aria-pressed` on toggle buttons.
- Keyboard-only run-through: can you complete a full create-customer + create-deal + move-stage flow without touching the mouse? Modals (Merge dialog, Confirm Revoke) must be Esc-dismissable. Focus traps in dialogs.
- Color is never the _only_ signal — status pills, credit-utilization meters, and module-stripe colors carry text too, not just hue.
- The Kanban must be operable without drag-and-drop too: each card needs a "Move to…" menu fallback. (If it doesn't, file under UX violations.)

**Performance feel**

- No layout shift after data loads — the skeleton should occupy the same box as the loaded content.
- The customer-detail activity feed uses infinite scroll with a visible loading sentinel; no jarring jump on append.
- Segment "preview count" returns under 1 second on a tenant with 1k customers. Watch the network tab.
- Module color tokens read from CSS vars, not hardcoded — `getComputedStyle(card).borderTopColor` should resolve to the cyan family on every CRM page.
- The pipeline Kanban with 200 deals across 6 stages still renders without dropping frames while dragging.

**Security & multi-tenancy**

- Bearer JWT for tenant A → confirm `/v1/crm/customers` returns ONLY tenant A's customers. Swap the `tid` claim → must 401 (signature mismatch), not return tenant B's data.
- Issue an API key with `read:crm` only → confirm `POST /v1/crm/customers` is rejected (scope mismatch), `GET` is allowed.
- Webhook signing secret rotation: rotate, confirm previous-secret signatures still verify for 24h grace if that's the documented policy (otherwise note as a gap).

## Tooling

You have the Playwright MCP available. Use it for everything browser-side.

- `mcp__plugin_playwright_playwright__browser_navigate` to each route
- `browser_snapshot` (preferred) or `browser_take_screenshot` (for visual receipts) at each route
- `browser_console_messages` after every navigation — log any React errors, hydration warnings, 404s on assets
- `browser_network_requests` to confirm optimistic mutations re-sync, ETag headers where used, API-key Bearer flows
- `browser_evaluate` to read `getComputedStyle`, check CSS variables, verify computed contrast, confirm the cyan resolution
- `browser_press_key` for keyboard-nav passes (Tab, Shift+Tab, Enter, Escape, arrow keys for the Kanban)
- `browser_drag` for the Kanban happy path; `browser_press_key('Escape')` mid-drag for the cancel path

For the dev environment, you'll typically need three services running:

```
pnpm --filter @sparx/dashboard dev          # http://localhost:3000
pnpm --filter @sparx/api-rest dev           # http://localhost:3100
pnpm --filter @sparx/api-mcp dev            # http://localhost:3200
pnpm --filter @sparx/api-graphql dev        # http://localhost:3300  (if testing GraphQL)
pnpm --filter @sparx/db db:up               # local Postgres
pnpm --filter @sparx/db db:migrate          # apply migrations
pnpm --filter @sparx/db db:seed             # seed the e2e tenant
```

For an authenticated session, the seed creates `e2e-staff@sparx.test` / `e2e-test-password` against the `e2e-store` tenant with all platform modules enabled.

For the non-browser checks (REST, GraphQL, MCP, webhooks, cron):

- Use `curl` against the local dev servers
- Use `kubectl -n sparx-prod get cronjobs` to confirm the four CronJobs exist (read-only; do NOT mutate the cluster)
- For partition checks, run `pnpm --filter @sparx/db db:up` then `docker exec sparx-postgres psql -U sparx_owner -d sparx -c "..."`
- For Pub/Sub event flow, use the in-process `resetPlatformBusForTesting()` helper from `@sparx/crm` and call `publish()` directly — no external Pub/Sub needed for the audit

**Do NOT touch Cloud SQL.** That's prod and migrations only go through the GitHub workflow. Do NOT run raw `kubectl apply` against prod — cluster mutations go through `bootstrap.yml` / `deploy-prod.yml` / `db-migrate.yml`. Reads (`kubectl get`, `kubectl logs`) are fine.

## How to report

Produce a single markdown document at `docs/crm-audit-2026-05-29.md` with this structure:

```
# CRM Audit — 2026-05-29

## Summary

- Routes tested: X / Y
- Pass: N
- Fail: M
- Known parked: api-mcp service (SSD quota), mcp.sparx.works 502

## Pass list

- /crm — customer list ✓
  One sentence on what was verified.
- ...

## Fail list (numbered, with screenshots)

- F-01 /crm/pipelines/[id] Kanban drag-cancel doesn't restore the card
  Severity: medium
  Repro: drag a card halfway, press Esc — card lands in a new column anyway.
  Screenshot: docs/crm-audit/F-01-drag-cancel.png
  Suspected cause: dnd-kit cancel handler missing on the Sortable wrapper.
  Suggested fix: wire onDragCancel → revert local state.
- F-02 ...

## UX violations (no functional break, but slop)

- /crm/segments/new — "Preview count" runs on every keystroke; should debounce to 300ms.
- /crm/b2b/[id] — Credit Hold toggle has no confirmation dialog despite being destructive to the merchant's checkout flow.

## API / GraphQL / MCP / Webhook / Cron checks

- REST `/v1/crm/*` — N endpoints exercised, all pass except F-NN.
- GraphQL CRM resolvers — all wired correctly, error envelope verified.
- MCP smoke (local dev) — read + write tools, scope enforcement, rate-limit verified.
- Webhook fan-out — delivery succeeds, retry backoff observed up to attempt 4 (didn't burn the full 8 in the audit, noted).
- Cron jobs — four CronJobs present in cluster; one-shot test of partition-rollover succeeded.

## Notes

Anything the user should know that doesn't fit above.
- mcp.sparx.works was tested locally only because the prod deployment is parked.
- ...
```

Capture screenshots into `docs/crm-audit/` (create the folder). Reference them with relative links so they render in the markdown.

## Bar for "done"

Every route in the Surface list above has been driven through happy + 1 sad path + the UX standards checklist, and either appears in the Pass list or has a numbered Fail entry with screenshot. No "didn't get to it" entries. If a route doesn't exist that the plan said should, that's a Fail. If a route exists that's not in the plan, document it under Notes.

The non-browser surfaces (REST, GraphQL, MCP, webhooks, cron) also have a pass/fail line each. The CRM is the system of record for every other module — there's no shortcut here.

After the audit document is written, do NOT start fixing things. Hand back to the user — they'll triage which fails to chase. The deliverable here is the audit, not the patches.

One last thing: do not be lazy. The user's exact words last round were "don't be lazy and cut corners. do it right, and do it completely." That standard applies to the audit too.
