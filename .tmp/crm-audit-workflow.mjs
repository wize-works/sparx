export const meta = {
  name: 'crm-audit-2026-05-29',
  description: 'Full functional + UX audit of Sparx CRM module — dashboard routes, REST/GraphQL/MCP/webhooks/cron, write report to docs/crm-audit-2026-05-29.md',
  whenToUse: 'Run once when CRM Phase 1-6 is implemented and the user wants a comprehensive audit report.',
  phases: [
    { title: 'Setup' },
    { title: 'Non-browser surfaces' },
    { title: 'Browser routes — read-only' },
    { title: 'Browser routes — mutation' },
    { title: 'Synthesis' },
  ],
}

const REPO = 'g:/code/@wizeworks/sparx.works'
const STATE_FILE = `${REPO}/.tmp/audit-state.json`
const RESULTS_DIR = `${REPO}/.tmp/audit-results`
const SCREENSHOTS_DIR = `${REPO}/docs/crm-audit`
const REPORT_PATH = `${REPO}/docs/crm-audit-2026-05-29.md`

const CORE_RULES = `
BINDING USER RULES (from MEMORY.md):
- NEVER run git stash (any form) — pre-push hook handles it
- NEVER use --no-verify on git operations
- NEVER add "Co-Authored-By: Claude ..." trailers
- NEVER run kubectl mutations against the cluster — only \`kubectl get\` / \`kubectl logs\` reads
- Don't touch Cloud SQL — migrations only via the DB Migrate GitHub workflow
- Respect architectural boundaries; this audit is READ-ONLY (no fixes)
- Don't claim work passes that didn't actually run
`

const SETUP_SCHEMA = {
  type: 'object',
  required: ['ready', 'dashboardUrl', 'apiRestUrl', 'apiGraphqlUrl', 'apiMcpUrl', 'sessionCookie', 'apiKey', 'tenantId', 'userId', 'notes'],
  properties: {
    ready: { type: 'boolean' },
    dashboardUrl: { type: 'string' },
    apiRestUrl: { type: 'string' },
    apiGraphqlUrl: { type: 'string' },
    apiMcpUrl: { type: 'string' },
    sessionCookie: { type: 'string', description: 'Raw Cookie header value for authenticated dashboard requests (may be empty if Playwright handles it via storage state).' },
    storageStatePath: { type: 'string' },
    apiKey: { type: 'string', description: 'A sk_live_ API key issued for use against /v1/crm/* in the smoke tests. Empty if issuance not possible at setup time.' },
    tenantId: { type: 'string' },
    userId: { type: 'string' },
    notes: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

const ENDPOINT_SCHEMA = {
  type: 'object',
  required: ['surface', 'passed', 'failed', 'notes'],
  properties: {
    surface: { type: 'string' },
    passed: { type: 'array', items: { type: 'string' } },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'severity', 'detail'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          detail: { type: 'string' },
          suspectedCause: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const BROWSER_SCHEMA = {
  type: 'object',
  required: ['cluster', 'routes', 'notes'],
  properties: {
    cluster: { type: 'string' },
    routes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'status', 'verified', 'fails', 'uxViolations'],
        properties: {
          path: { type: 'string' },
          status: { type: 'string', enum: ['pass', 'fail', 'partial', 'skipped'] },
          verified: { type: 'string', description: 'One-sentence statement of what was actually verified.' },
          skipReason: { type: 'string' },
          fails: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title', 'severity', 'repro'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                repro: { type: 'string' },
                screenshot: { type: 'string' },
                consoleErrors: { type: 'array', items: { type: 'string' } },
                suspectedCause: { type: 'string' },
                suggestedFix: { type: 'string' },
              },
            },
          },
          uxViolations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'detail'],
              properties: {
                title: { type: 'string' },
                detail: { type: 'string' },
                screenshot: { type: 'string' },
              },
            },
          },
          cyanResolved: { type: 'boolean', description: 'Whether --module-active resolved to a cyan-family hex on this route.' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

// ========================================================================
phase('Setup')

const setupPrompt = `You are the SETUP agent for the Sparx CRM audit.

${CORE_RULES}

Your job: get the local dev environment up so subsequent agents can audit the CRM. You write your result via the StructuredOutput tool — do NOT echo state into chat.

Repo root: ${REPO}
State file to read by later agents: ${STATE_FILE}
Results dir (other agents write here): ${RESULTS_DIR}
Screenshots go to: ${SCREENSHOTS_DIR}

Concrete tasks (do them, don't just plan):

1. \`mkdir -p ${RESULTS_DIR} ${SCREENSHOTS_DIR}\` (Windows-friendly via PowerShell or Bash).
2. Confirm sparx-postgres docker container is healthy: \`docker ps --filter name=sparx-postgres --format '{{.Status}}'\`.
3. Run migrations + seed:
   - \`pnpm --filter @sparx/db db:migrate:deploy\` (preferred; or db:migrate if deploy unavailable)
   - \`pnpm --filter @sparx/db db:seed\`
4. Discover service ports — read each service's src/index.ts or .env to find the actual listen port. The prompt claims 3000/3100/3200/3300; dashboard is actually 3001 (\`apps/dashboard/package.json\` -> \`next dev --port 3001\`). Confirm api-rest, api-graphql, api-mcp ports.
5. Boot services in background (use Bash run_in_background OR powershell Start-Job; the workflow runtime will keep them alive):
   - \`pnpm --filter @sparx/dashboard dev\` (port 3001)
   - \`pnpm --filter @sparx/api-rest dev\`
   - \`pnpm --filter @sparx/api-graphql dev\`
   - DO NOT boot \`@sparx/api-mcp\` here — leave that to the MCP smoke agent so it owns the lifecycle.
6. Wait until each service returns 200 on its health endpoint (most likely \`/health\` or \`/\`) — poll with a max wait of ~90s each. Use curl from PowerShell or Bash. If a service refuses to come up, capture last 50 log lines and put them in \`failures[]\` but still write the state file with what you have.
7. Authenticate against the dashboard as \`e2e-staff@sparx.test\` / \`e2e-test-password\` (the seed user). Use Playwright via the playwright MCP — load Playwright tool schemas via ToolSearch ("select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_fill_form,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_evaluate"). Walk through the login flow and confirm you land on a dashboard route. Capture session info via \`browser_evaluate\` (document.cookie) and write the cookie string to the state. Note: subsequent browser agents will simply re-use the live browser session as long as nothing closes it.
8. Issue an API key via the dashboard UI at /settings/ai-integrations (scopes read:crm + write:crm). Capture the plaintext sk_live_... and store in apiKey. If issuance UI is broken, leave apiKey empty and log a failure for the synthesis stage.
9. Grab tenantId and userId from the JWT / session payload by hitting \`/api/auth/me\` or equivalent dashboard endpoint, OR by reading \`SELECT id, "tenantId" FROM users WHERE email='e2e-staff@sparx.test'\` via \`docker exec sparx-postgres psql -U sparx_owner -d sparx -c "..."\` (check the actual DB name & user from \`packages/db/docker-compose.yml\`).
10. Write the final result via StructuredOutput. Also write the same JSON to \`${STATE_FILE}\` (use the Write tool) so subsequent agents can read it without re-deriving anything.

If something is genuinely impossible (e.g. seed crashes), continue with what you can, but be explicit about it in \`notes\` and \`failures\`. The audit can still partially proceed.

Return: setup state object matching schema.`

const setup = await agent(setupPrompt, { schema: SETUP_SCHEMA, phase: 'Setup', label: 'setup' })

log(`Setup complete. ready=${setup.ready}, dashboardUrl=${setup.dashboardUrl}`)
if (!setup.ready) {
  log(`Setup reported not ready — continuing with degraded audit. Notes: ${setup.notes}`)
}

// Pass state inline to every downstream agent (don't re-discover).
const STATE_BLOCK = `\nSHARED STATE (from setup agent):\n${JSON.stringify(setup, null, 2)}\nState file: ${STATE_FILE}\nResults dir (write your JSON result here too): ${RESULTS_DIR}\nScreenshots dir: ${SCREENSHOTS_DIR}\n`

// ========================================================================
phase('Non-browser surfaces')

// These all hit the live services. Most are read-only (REST/GraphQL/cron get).
// MCP smoke owns its own service lifecycle. Webhook test does writes but in isolation.
const nonBrowserAgents = [
  {
    label: 'rest-api-smoke',
    prompt: `You are auditing the REST API surface at /v1/crm/* of the live api-rest dev server.

${CORE_RULES}
${STATE_BLOCK}

Exercise every endpoint listed in the audit prompt (Surface item 29 — customers, pipelines, deals, b2b-accounts, activities, tasks, segments, reports). For each:
- Hit it with the Bearer JWT (use the dashboard session cookie's JWT or extract from setup state)
- Hit GET /v1/crm/customers ALSO with the issued API key as Bearer
- Confirm 200 + envelope shape \`{ success: true, data: ... }\`
- For at least one endpoint, confirm a 4xx error returns the documented envelope \`{ success: false, error: { code, message, details } }\`
- Hit /v1/openapi.json and confirm every /v1/crm/* path is listed and tagged 'crm'
- For module-gate check: skip live deactivation here (it'll happen later in the mutation phase); just inspect the source to confirm the gate is wired (grep services/api-rest/src/routes/v1/crm for module-gate usage)

Use curl from PowerShell / Bash. Do NOT use raw shell grep — use the Grep tool.

Document each endpoint as either pass (one line) or fail (id+severity+detail). Save your JSON result both via StructuredOutput AND to ${RESULTS_DIR}/rest-api-smoke.json.`,
  },
  {
    label: 'graphql-smoke',
    prompt: `You are auditing the GraphQL surface at /v1/graphql on the live api-graphql dev server.

${CORE_RULES}
${STATE_BLOCK}

Exercise one query per resolver group (Surface item 30):
- crmCustomers, crmCustomer
- crmDeals, moveDealStage (mutation)
- crmPipelines
- crmSegments
- crmActivities
- crmReports* (any one)
- createCustomer / updateCustomer (mutations)

Use curl with POST. Confirm:
- 200 statusCode for all (including MODULE_DISABLED — skipped here, deferred to mutation phase)
- Each returns either \`data\` or \`errors\` per GraphQL spec
- The error envelope includes the underlying service error code when present

Save result via StructuredOutput AND to ${RESULTS_DIR}/graphql-smoke.json.`,
  },
  {
    label: 'mcp-local-smoke',
    prompt: `You are auditing the MCP surface (Surface item 31). The prod MCP at mcp.sparx.works is parked (scaled to 0 replicas) — TEST LOCALLY ONLY.

${CORE_RULES}
${STATE_BLOCK}

Tasks:
1. Boot \`pnpm --filter @sparx/api-mcp dev\` in background. Discover port by reading services/api-mcp/src/index.ts or its .env.
2. Wait for the server to be ready (poll a health endpoint, ~60s max).
3. Use curl to POST JSON-RPC against the MCP endpoint:
   - tools/list → confirm presence of get_customers, get_top_customers, get_pipeline, add_crm_activity, move_deal_stage
   - tools/call get_customers with JWT auth — confirm read works
   - tools/call get_customers with the API key (read:crm scope) — confirm read works
   - tools/call add_crm_activity without write:crm scope — confirm rejection
   - tools/call add_crm_activity with confirmation flag missing — confirm rejection per destructiveHint
4. Rate-limit smoke: hit tools/list 70 times in a minute; check that the 60-per-minute Pro cap fires a 429 with retry-after header. (If your tenant is Enterprise per seed, document and skip the burn.)
5. If anything is genuinely impossible (e.g. MCP refuses to boot), document it as a fail with the boot logs and skip the dependent checks.
6. Tear down the api-mcp process when done (kill the background bash).

Save result via StructuredOutput AND to ${RESULTS_DIR}/mcp-local-smoke.json.`,
  },
  {
    label: 'webhook-fanout',
    prompt: `You are auditing webhook fan-out (Surface item 32).

${CORE_RULES}
${STATE_BLOCK}

Tasks:
1. Create a WebhookSubscription against api-rest pointed at a fresh https://webhook.site URL (generate one via \`curl -sX POST https://webhook.site/token\` and use \`tokens[0].uuid\` → \`https://webhook.site/<uuid>\`).
2. Issue a CRM write (e.g. POST /v1/crm/customers or POST a /v1/crm/activities) that should trigger fan-out.
3. Poll \`https://webhook.site/token/<uuid>/requests\` for up to 60s, confirm a request arrived with header x-sparx-signature (HMAC-SHA256). Verify the signature against the subscription's signing secret.
4. Failure path: create a second subscription pointed at \`https://httpstat.us/500\`, trigger another write, observe the retry attempts. You do NOT need to wait for all 8 retries — confirm at least attempts 1-3 occur with exponential backoff (~30s, ~60s, ~5m) by inspecting the WebhookDelivery table via \`docker exec sparx-postgres psql ...\`. Document the observed cadence.
5. Clean up: archive/delete the test subscriptions when done.

Save result via StructuredOutput AND to ${RESULTS_DIR}/webhook-fanout.json.`,
  },
  {
    label: 'cron-and-partitions',
    prompt: `You are auditing scheduled jobs + DB partitions (Surface item 33).

${CORE_RULES}
${STATE_BLOCK}

Tasks:
1. \`kubectl -n sparx-prod get cronjobs\` (READ-ONLY) — confirm presence of the four CronJobs: crm-partition-rollover, crm-automation-triggers, crm-overdue-reminders, crm-segment-recompute.
2. Do NOT \`kubectl create job\` against prod (CORE rule — no manual kubectl mutations). Instead:
   - Open the CronJob manifests in k8s/ and confirm the spec template references the cron-runner container with the right CRON_TOKEN env source and an HTTP target on api-rest.
   - Run the equivalent target locally: \`curl -X POST -H "X-Cron-Token: <token>" http://<api-rest-port>/internal/crm/partition-rollover\` (or whatever the actual route is — find it in services/api-rest/src/routes/internal/). Confirm 200.
3. Partition check via local docker postgres (NOT cloud SQL):
   - \`docker exec sparx-postgres psql -U <user> -d <db> -c "SELECT child.relname FROM pg_inherits JOIN pg_class child ON child.oid = inhrelid JOIN pg_class parent ON parent.oid = inhparent WHERE parent.relname = 'crm_activities';"\`
   - Confirm crm_activities_2026_06 (or the current/next month partition) exists.
4. If api-rest doesn't expose the cron HTTP target, document that as a fail with severity medium.

Save result via StructuredOutput AND to ${RESULTS_DIR}/cron-and-partitions.json.`,
  },
  {
    label: 'bootstrap-event',
    prompt: `You are auditing the tenant-activation bootstrap event (Surface item 34).

${CORE_RULES}
${STATE_BLOCK}

Tasks:
1. Locate the bootstrap consumer in packages/crm/src/consumers/ — confirm it subscribes to module.activated and runs createDefaultPipeline + createBuiltInSegments for the crm module.
2. Run a one-shot test: write a tiny tsx script (or use \`pnpm exec tsx -e "..."\`) that imports \`resetPlatformBusForTesting\` and \`publish\` from @sparx/crm, fires module.activated for crm against a freshly inserted tenant. Then query the local DB:
   - SELECT * FROM pipelines WHERE tenant_id=<new> AND slug='sales' — expect 1 row
   - SELECT count(*) FROM pipeline_stages WHERE pipeline_id=<...> — expect 6
   - SELECT count(*) FROM segments WHERE tenant_id=<new> AND is_built_in=true — expect 4
3. If you can't construct the in-process bus test (env wiring trouble), use the dashboard Settings → Modules toggle as a fallback — but DEFER that to the mutation phase, and skip this check here, noting why.
4. Clean up: drop the test tenant rows when done.

Save result via StructuredOutput AND to ${RESULTS_DIR}/bootstrap-event.json.`,
  },
]

const nonBrowserResults = await parallel(
  nonBrowserAgents.map(a => () => agent(a.prompt, { schema: ENDPOINT_SCHEMA, phase: 'Non-browser surfaces', label: a.label }))
)

log(`Non-browser surfaces complete: ${nonBrowserResults.filter(Boolean).length}/${nonBrowserAgents.length} ran to completion.`)

// ========================================================================
phase('Browser routes — read-only')

const browserBaseRules = `${CORE_RULES}
${STATE_BLOCK}

You drive the SHARED Playwright MCP browser. Other agents may run after you on the same browser. RULES OF THE ROAD:
- Load Playwright tool schemas via ToolSearch: select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_network_requests,mcp__plugin_playwright_playwright__browser_press_key,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_fill_form,mcp__plugin_playwright_playwright__browser_drag
- DO NOT call browser_close.
- If the session has dropped auth, log in again as e2e-staff@sparx.test / e2e-test-password before continuing.
- For each route in your cluster: navigate → snapshot → console_messages → network_requests → run the UX standards checklist below → take a screenshot ONLY if you found a fail or violation (name it docs/crm-audit/<route-slug>-<id>.png).
- DO NOT mutate data unless explicitly instructed for this cluster (no creating customers, no toggling modules, no issuing API keys).

UX STANDARDS CHECKLIST — apply on EVERY route:
* Layout: every Card has cyan top stripe (browser_evaluate getComputedStyle on a Card → --module-active resolves to a #06B6D4-family hex). Spacing rhythm uses Stack gap={5}/{6}. Typography uses <Heading>/<Text>, not raw h1/p with className. No raw Tailwind classes (e.g. bg-indigo-500, px-4) in rendered DOM.
* Affordance: primary action obvious (variant="module" button). Destructive actions show confirm dialog. Disabled buttons explain why. Loading buttons use the loading prop. Required fields marked. Validation errors render inline.
* State coverage: loading skeleton present, empty state designed, error state renders on network kill (you don't need to actually kill the network — just confirm an error UI exists by inspecting source or rendering a deliberate bad request).
* Copy: no lorem/TODO/FIXME/Untitled in DOM. Button labels are verbs. Help text on non-obvious fields. Error messages actionable. Domain wording: "B2B account", "Pipeline stage", "Segment".
* Accessibility: every input has a Label htmlFor. ARIA aria-live on toasts, role="alert" on errors. Focus order logical. Color is never sole signal.
* Performance: no layout shift after load (skeleton box matches loaded box).

Capture console errors and 4xx/5xx network responses as fails.

For each route in your cluster, fill the routes[] entry with: path, status, verified (one sentence), fails[], uxViolations[], cyanResolved (boolean).

Save your JSON result via StructuredOutput AND write the same object to ${RESULTS_DIR}/browser-<cluster-slug>.json.`

const readOnlyClusters = [
  {
    slug: 'customers',
    label: 'browser:customers',
    routes: [
      '/crm — customer list (filter bar, sort, Find duplicates CTA, New customer CTA, empty state, paginated state; click a row)',
      '/crm/customers/[id] — pick a seeded customer; verify profile header, stat row, B2B card if linked, tabs (Activity / Orders / B2B / Deals / Tasks / Notes), right rail add-activity forms (DO NOT submit), Edit + Merge buttons exist',
      '/crm/duplicates — duplicates index; verify group rendering, primary picker, two-pane diff layout',
    ],
  },
  {
    slug: 'pipelines',
    label: 'browser:pipelines',
    routes: [
      '/crm/pipelines — pipeline index; mini-funnel, deal-count badge, includeArchived toggle, New pipeline + Edit CTAs',
      '/crm/pipelines/[id] — Kanban view (default); verify column rendering, deal cards, stage colors from kanban-types.stageColor. DO NOT actually drag (mutation deferred). Verify ?view=list and ?view=forecast share data and switch render.',
      '/crm/pipelines/[id]/edit — stage editor; verify add stage, reorder handles, rename/probability/stageType inputs, delete control. DO NOT save changes.',
    ],
  },
  {
    slug: 'deals',
    label: 'browser:deals',
    routes: [
      '/crm/deals/[id] — pick a seeded deal; verify profile, value+probability slider, expectedCloseDate, assignedRep, attached customer/B2B, Attach Order popover (open it, search, but DO NOT submit), Attach Quote popover, activity feed scoped to deal, tasks scoped to deal',
    ],
  },
  {
    slug: 'segments',
    label: 'browser:segments',
    routes: [
      '/crm/segments — list with 4 built-ins (high-value, at-risk, b2b-fleet, new-customers) carrying System badge; member counts render; Recompute button per segment (DO NOT click)',
      '/crm/segments/[id] — pick a built-in segment; verify rule rendering, member list pagination, edit is disabled with clone prompt',
      '/crm/segments/new — rule builder; verify recursive AND/OR/NOT tree, leaf predicate row, field autocomplete shows SegmentField enum only, operator menu adapts to field type, Preview count input (try one keystroke — note debounce behavior). DO NOT save.',
    ],
  },
  {
    slug: 'tasks-b2b-orders-quotes',
    label: 'browser:tasks-b2b-orders-quotes',
    routes: [
      '/crm/tasks — task list; scope toggle Mine vs All, Open/Overdue/Completed sections with counts, overdue badge variant on stale tasks',
      '/crm/tasks/new — verify form: title, description, dueAt, priority dropdown (low/medium/high/urgent), assignedToUserId picker, customer/deal anchor. DO NOT save.',
      '/crm/b2b — accounts list; status filter chips with correct pill variants (active=success, credit_hold=warning, suspended=danger, inactive=outline), search by company',
      '/crm/b2b/new — form; verify companyName, taxId, website, pricingTier, creditLimit, creditUsed, paymentTerms, discountPercent, status, fleetSize, engineProfiles structured editor (NOT raw textarea), notes, tags, assignedRep. DO NOT save.',
      '/crm/b2b/[id] — pick a seeded account; verify linked contacts list, credit utilization meter, payment-terms display, Credit Hold toggle visible (DO NOT toggle)',
      '/crm/orders — list',
      '/crm/orders/new — form smoke',
      '/crm/orders/[id] — pick a seeded order; line items, payments, refunds, fulfillments tabs render',
      '/crm/quotes — list',
      '/crm/quotes/new — form smoke',
      '/crm/quotes/[id] — quote detail; verify lifecycle actions (Submit/Accept/Decline/Expire) exist (DO NOT click)',
      '/crm/reports — 4-stat row (customers, B2B accounts, open deals, overdue tasks), pipeline funnel uses stageColor, win/loss table, acquisition bar chart with non-flat bars when data exists',
    ],
  },
  {
    slug: 'new-forms',
    label: 'browser:new-forms',
    routes: [
      '/crm/customers/new — verify type selector (prospect/retail/b2b), b2b reveals B2B account picker, required-field markers, email-format validation (try a bad email — DO NOT submit), tag input parser',
      '/crm/pipelines/new — verify name + slug + isDefault checkbox + stage list editor; DEFAULT_PIPELINE_TEMPLATE auto-applied when untouched',
      '/crm/deals/new — pipeline + stage picker (try switching pipeline, verify stage options refresh — no stale options). XOR enforced between customer and B2B anchor. All required fields marked.',
    ],
  },
]

const readOnlyBrowserResults = []
for (const cluster of readOnlyClusters) {
  const prompt = `${browserBaseRules}

YOUR CLUSTER (slug=${cluster.slug}): drive these routes in order and report on each.

ROUTES:
${cluster.routes.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Output JSON matching the BROWSER schema. cluster='${cluster.slug}'.`
  const r = await agent(prompt, { schema: BROWSER_SCHEMA, phase: 'Browser routes — read-only', label: cluster.label })
  readOnlyBrowserResults.push(r)
}

// ========================================================================
phase('Browser routes — mutation')

const mutationClusterRoutes = [
  {
    slug: 'mutation-flows',
    label: 'browser:mutation',
    routes: [
      '/crm/customers/new — actually create a customer (name + email + type=retail). Confirm redirect to /crm/customers/[id]. Confirm save toast within 600ms. Capture the new customer id.',
      '/crm/customers/[id] — on the just-created customer, add a Note activity via the right-rail form. Then EDIT that note (append-only: a new row with corrects_activity_id pointing at the original). Confirm in the timeline.',
      '/crm/pipelines — open the default pipeline /crm/pipelines/[id]?view=kanban. Drag one deal across columns (use browser_drag). Confirm optimistic UI + server sync via network tab. Refresh and confirm persisted. Test Esc-mid-drag cancel.',
      '/crm/deals/[id] — open the moved deal, confirm a stage-change activity entry appears.',
      '/crm/b2b/[id] — flip the Credit Hold toggle ON. Confirm confirm-dialog presence + post-toggle status pill update + audit/event fired (check network tab for the POST and an activity write).',
      '/crm/segments/new — author a tiny single-predicate rule (e.g. customer.type EQUALS retail). Use Preview count, then SAVE. Confirm redirect and member list materialises.',
      '/settings/ai-integrations — issue an API key (confirm sk_live_<8>_<32> shape, copy-to-clipboard works, plaintext disappears on re-render). Then REVOKE one key. Confirm badge change + live count drop. Test edge cases: empty name validation, no-scope validation.',
      '/settings/modules — DEACTIVATE the CRM module. Immediately navigate to /crm and confirm ModuleStub renders (correct module name, tagline, planned-features grid, Activate CTA pointing at /settings/modules). Then REACTIVATE CRM and confirm /crm/pipelines + /crm/segments show the default pipeline + 4 built-in segments within a second (bootstrap runs in-process).',
      '/welcome — confirm CRM activation surfaces correctly in the onboarding checklist for an active CRM. If checklist references MCP without explaining parked state, flag under uxViolations (NOT under fails — this is documented state).',
    ],
  },
]

// Allow mutation cluster to mutate.
const mutationBrowserResults = []
for (const cluster of mutationClusterRoutes) {
  const prompt = `${browserBaseRules.replace('DO NOT mutate data unless explicitly instructed for this cluster (no creating customers, no toggling modules, no issuing API keys).', 'YOU ARE ALLOWED TO MUTATE — this is the mutation cluster. Be deliberate; capture screenshots of every confirm dialog.')}

YOUR CLUSTER (slug=${cluster.slug}): mutation flows. Drive these in order; later steps depend on earlier ones.

ROUTES + ACTIONS:
${cluster.routes.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Each one is a separate routes[] entry — set path to the route, verified to what you confirmed, fails[]/uxViolations[] accordingly. Output JSON matching BROWSER schema. cluster='${cluster.slug}'.`
  const r = await agent(prompt, { schema: BROWSER_SCHEMA, phase: 'Browser routes — mutation', label: cluster.label })
  mutationBrowserResults.push(r)
}

// ========================================================================
phase('Synthesis')

const allResults = {
  setup,
  nonBrowser: nonBrowserResults,
  readOnlyBrowser: readOnlyBrowserResults,
  mutationBrowser: mutationBrowserResults,
}

const synthPrompt = `You are the SYNTHESIS agent for the Sparx CRM audit. Write the final audit document.

${CORE_RULES}
${STATE_BLOCK}

INPUT — all prior agent outputs (already structured):
\`\`\`json
${JSON.stringify(allResults, null, 2)}
\`\`\`

ALSO read whatever JSONs exist in ${RESULTS_DIR}/ as a backup source of truth (some agents may have stored extra detail there that didn't make it into the structured output).

DELIVERABLE: write ${REPORT_PATH} with EXACTLY this structure (markdown, not HTML):

# CRM Audit — 2026-05-29

## Summary

- Routes tested: X / Y
- Pass: N
- Fail: M
- Known parked: api-mcp service (SSD quota), mcp.sparx.works 502

## Pass list

(one bullet per passing route, with a one-sentence verification statement)

## Fail list (numbered, with screenshots)

(F-01, F-02, ... — each entry: route, severity, repro, screenshot path, suspectedCause, suggestedFix)

## UX violations (no functional break, but slop)

(bullet list with route + violation)

## API / GraphQL / MCP / Webhook / Cron checks

(one bullet per non-browser surface — pass/fail summary)

## Notes

(anything that doesn't fit — parked MCP, partial coverage, env quirks, etc.)

REQUIREMENTS:
- Use the actual numbers from the input data. Count routes; count fails (use IDs F-01.. sequentially regardless of cluster).
- Reference screenshots that actually exist (paths in the agent results); don't fabricate screenshot links.
- If a route was skipped, list it under Fail with the reason and severity=medium.
- Be honest about gaps: if MCP couldn't boot, say so. If a route 404'd, say so.
- Do NOT write fix code — this is a read-only audit deliverable.
- Use markdown links for file references where they apply.

After writing the file, return a one-paragraph summary of the audit (counts + top concerns). This summary IS your final text return.`

const synth = await agent(synthPrompt, { phase: 'Synthesis', label: 'synthesis' })

return { reportPath: REPORT_PATH, summary: synth }
