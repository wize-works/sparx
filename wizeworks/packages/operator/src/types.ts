// Shared DTOs for the operator ↔ api-rest internal seam (docs/apps/admin
// build-plan §2 D6). Kept dependency-free so both the caller (wizeworks/apps/admin) and
// the handler (wizeworks/services/api-rest) share one contract.

import type { OperatorCapability } from './capabilities';

/** The authenticated operator, as the admin app knows them after a session
 *  lookup. No `tid` — operators are tenant-less (docs/16 §2.4). */
export interface OperatorIdentity {
  id: string;
  email: string;
  name: string | null;
  capabilities: OperatorCapability[];
  /** Whether this operator has completed authenticator-app MFA setup. MFA is
   *  mandatory for operators (docs/16 §2.4) — `requireOperator()` sends anyone
   *  false here to the setup screen and nowhere else — so in practice every
   *  identity that reaches a console surface has this true. */
  twoFactorEnabled: boolean;
}

/** Response of the Slice-1 round-trip probe `GET /internal/operator/whoami`.
 *  Proves the shared-secret auth + the X-Operator-Id header made it through the
 *  Layer-5 seam end-to-end before any real data endpoint is built. */
export interface OperatorWhoAmIResult {
  ok: true;
  /** The operator id api-rest received in the `X-sparx-Operator-Id` header
   *  (echoed back so the admin app can confirm the round-trip), or null if the
   *  header was absent. */
  operatorId: string | null;
  /** Always 'api-rest' — identifies which service answered. */
  service: 'api-rest';
  /** Server timestamp (ISO-8601) so a stale/cached response is obvious. */
  time: string;
}

/** Error shape the internal client throws on a non-2xx api-rest response. */
export interface OperatorApiErrorBody {
  code: string;
  message: string;
}

// ─── Slice 2: tenant list + detail (representation parity, D7) ───────────────
// These DTOs are the dashboard-shaped payloads api-rest computes so the operator
// console renders a tenant's account state exactly as the tenant's own dashboard
// shows it — same subscription snapshot (via @wizeworks/billing.getBillingState), the
// same module derivation (@wizeworks/modules.deriveModuleStates), and real storage.

/** Billing/annual interval — mirrors `@wizeworks/billing`'s BillingInterval without
 *  taking a runtime dependency on that (server-only) package from this dep-free one. */
export type OperatorBillingInterval = 'monthly' | 'annual';

/** One row in the cross-tenant tenant list. Derived from the (non-RLS) `tenants`
 *  row alone — no per-tenant query — so the list stays a single findMany. */
export interface OperatorTenantListItem {
  id: string;
  slug: string;
  /** The tenant's LEGAL/org name (billing/ownership) — never a customer-facing
   *  site name. Operators identify accounts by this. */
  name: string;
  email: string;
  plan: string;
  /** Account lifecycle: `active` | `suspended` (the tenants.status column). */
  status: string;
  /** Stripe-reconciled subscription state, or null before billing is live. */
  subscriptionStatus: string | null;
  planType: 'standard' | 'enterprise';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: OperatorBillingInterval;
  /** Every module enabled for the tenant, INCLUDING bundled-free capabilities
   *  (module keys, e.g. `commerce`, `invoicing`). */
  activeModules: string[];
  /** Monthly recurring revenue in cents — the sum of EXPLICIT billable modules
   *  (bundled-free capabilities contribute $0), matching the dashboard's plan total. */
  mrrCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorTenantListResult {
  tenants: OperatorTenantListItem[];
  /** Total matching the filter (for pagination), not just this page. */
  total: number;
  limit: number;
  offset: number;
}

/** Query parameters for the tenant list. */
export interface OperatorTenantListParams {
  /** Case-insensitive search across name / slug / email. */
  q?: string;
  /** Exact-match filter on `tenants.status`. */
  status?: string;
  /** Exact-match filter on `tenants.plan`. */
  plan?: string;
  /** Exact-match filter on `tenants.acquisition_campaign` — every account a
   *  given campaign produced. */
  campaign?: string;
  limit?: number;
  offset?: number;
}

/** A single module's enablement state for a tenant (mirrors
 *  `@wizeworks/modules.deriveModuleStates`). */
export interface OperatorTenantModule {
  key: string;
  enabled: boolean;
  /** `explicit` = tenant turned it on (billed); `bundled` = free with a provider
   *  module (e.g. invoicing with Commerce/B2B); `off` = not active. */
  source: 'explicit' | 'bundled' | 'off';
  /** Provider modules that bundle this one free, when `source === 'bundled'`. */
  includedBy: string[];
  /** Active modules that REQUIRE this one — non-empty means the toggle is locked
   *  ON (you must disable the dependent first, e.g. Commerce while B2B is on). */
  requiredBy: string[];
  /** Monthly list price in cents; 0 for bundled/non-billable. */
  monthlyCents: number;
}

/** The tenant's subscription snapshot — the exact shape the dashboard's Finance →
 *  subscription page renders (from `@wizeworks/billing.getBillingState`). */
export interface OperatorTenantBilling {
  configured: boolean;
  billingActive: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: OperatorBillingInterval;
  planTotalCents: number;
  planType: 'standard' | 'enterprise';
}

export interface OperatorTenantDomain {
  host: string;
  /** subdomain | custom | purchased. */
  type: string;
  /** pending | verifying | verified | active | failed. */
  status: string;
  isCanonical: boolean;
  verifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Real storage footprint — the sum of media asset + variant `byteSize`. */
export interface OperatorTenantStorage {
  assetBytes: number;
  variantBytes: number;
  totalBytes: number;
  assetCount: number;
  /** Operator-set per-tenant storage cap in bytes, or null when no override is
   *  set (the platform default applies). Persisted at `settings.limits.storageBytes`.
   *  NOTE: not yet enforced at the upload path — see docs/apps/admin/slice-8-enforcement-followups.md. */
  storageLimitBytes: number | null;
}

/** One tenant audit-log row (the tenant's OWN activity trail, read under tenant
 *  context) — the read-only "understand this account" view that replaces
 *  impersonation (D7). */
export interface OperatorTenantActivity {
  id: string;
  action: string;
  /** user | system | api | mcp | customer | operator. */
  actorType: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

/** One of a tenant's team members, for the tenant-detail Team card (links into
 *  the user surface). Identity is resolved cross-tenant so consultant members
 *  (whose home tenant differs) still show a name. */
export interface OperatorTenantMember {
  userId: string;
  name: string | null;
  email: string | null;
  /** Per-membership role. */
  role: string;
  /** owner | staff | consultant. */
  memberType: string;
  /** active | invited | suspended. */
  status: string;
}

/** One of a tenant's sites, for the tenant-detail Sites card (links into the site
 *  surface). */
export interface OperatorTenantSite {
  id: string;
  name: string;
  slug: string;
  /** active | paused | archived. */
  status: string;
  isPrimary: boolean;
}

/** Full tenant detail — everything the operator console's tenant page renders. */
export interface OperatorTenantDetail {
  id: string;
  slug: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Whether a Stripe platform customer exists — a boolean signal, never the id
   *  itself (operators don't need the raw Stripe identifier). */
  hasStripeCustomer: boolean;
  /** L-PLAT acquisition snapshot (how the tenant found sparx), or nulls. */
  acquisition: {
    channel: string | null;
    source: string | null;
    campaign: string | null;
    acquiredAt: string | null;
  };
  billing: OperatorTenantBilling;
  modules: OperatorTenantModule[];
  domains: OperatorTenantDomain[];
  storage: OperatorTenantStorage;
  recentActivity: OperatorTenantActivity[];
  /** The tenant's team (staff + consultants), for the Team card. */
  members: OperatorTenantMember[];
  /** The tenant's sites, for the Sites card. */
  sites: OperatorTenantSite[];
}

// ─── Slice 3: platform metrics ───────────────────────────────────────────────
// Cross-tenant platform health, computed server-side in api-rest from the single
// non-RLS `tenants` dispatch table (no per-tenant scans): lifecycle, revenue,
// module adoption, signups over time, churn. Metrics that need tenant-scoped
// tables (storage/email/revenue-over-time) are intentionally NOT here — they
// require a platform-daily rollup + cron, tracked separately.

/** Account-lifecycle counts across every tenant. */
export interface OperatorMetricsLifecycle {
  total: number;
  /** `tenants.status = 'active'`. */
  active: number;
  /** `tenants.status = 'suspended'`. */
  suspended: number;
  trialing: number;
  pastDue: number;
  /** subscriptionStatus `canceled` or `unpaid`. */
  canceled: number;
  paused: number;
  /** `settings.billing.planType = 'enterprise'`. */
  enterprise: number;
  /** Has a live Stripe subscription id. */
  withSubscription: number;
  /** `cancelAtPeriodEnd = true` — churn in flight. */
  pendingCancel: number;
}

/** Per-module adoption + revenue contribution across all tenants. */
export interface OperatorMetricsModule {
  key: string;
  /** Tenants where the module is effectively enabled (incl. bundled-free). */
  active: number;
  /** Tenants where it is EXPLICITLY enabled (billable). */
  billed: number;
  /** `active / total`, 0–100 (1 decimal). */
  adoptionPct: number;
  /** `billed × monthly list price`, in cents — this module's MRR contribution. */
  mrrCents: number;
}

/** Aggregate recurring revenue (the sum of explicit billable modules). */
export interface OperatorMetricsRevenue {
  mrrTotalCents: number;
  arrTotalCents: number;
  /** MRR per PAYING tenant (≥1 explicit billable module), in cents. */
  arpuCents: number;
  payingTenants: number;
}

export interface OperatorMetricsSignupPoint {
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  count: number;
}

export interface OperatorMetricsSignups {
  windowDays: number;
  /** Signups within the window. */
  total: number;
  last7: number;
  last30: number;
  /** Dense daily series across the window (zero-filled). */
  series: OperatorMetricsSignupPoint[];
}

export interface OperatorMetricsChurn {
  canceled: number;
  pendingCancel: number;
  /** `canceled / (active + canceled)`, 0–100 (1 decimal). */
  ratePct: number;
}

export interface OperatorMetricsResult {
  generatedAt: string;
  lifecycle: OperatorMetricsLifecycle;
  revenue: OperatorMetricsRevenue;
  churn: OperatorMetricsChurn;
  signups: OperatorMetricsSignups;
  /** Every platform module, sorted by adoption descending. */
  modules: OperatorMetricsModule[];
}

export interface OperatorMetricsParams {
  /** Signup-series window in days (default 90, clamped 1–365). */
  windowDays?: number;
}

// ─── Acquisition ── where our own tenants came from (docs/80 §10, L-PLAT) ─────
// Aggregated from the `tenants.acquisition_*` columns, written once at signup
// from the first-party attribution cookies on the marketing site. The same
// aggregation backs the shared-token CSV endpoint, so the console and the
// spreadsheet cannot report different totals for the same week.

/** One row of a breakdown — a channel, a source, or a campaign. */
export interface OperatorAcquisitionBucket {
  /** The channel / source / campaign value this row groups. */
  key: string;
  /** Dominant channel among this row's tenants (the row itself, for byChannel). */
  channel: string;
  /** Dominant source among this row's tenants. */
  source: string;
  tenants: number;
  /** Has a Stripe customer id — the proxy for "reached billing". */
  withBilling: number;
  /** `status === 'active'`. */
  active: number;
  firstAcquiredAt: string | null;
  lastAcquiredAt: string | null;
}

export interface OperatorAcquisitionTotals {
  tenants: number;
  /** Signups carrying a classified channel. */
  attributed: number;
  /**
   * Signups with NO channel recorded — pre-attribution accounts, and everybody
   * who declined the consent bar. This is the denominator honesty of the whole
   * report: it is not "direct traffic", it is traffic nobody measured.
   */
  unattributed: number;
  withBilling: number;
}

export interface OperatorAcquisitionSummary {
  generatedAt: string;
  /** The signup-date window the rows were read over; nulls mean all time. */
  window: { since: string | null; until: string | null };
  totals: OperatorAcquisitionTotals;
  /** Every row sorted by tenant count descending. */
  byChannel: OperatorAcquisitionBucket[];
  bySource: OperatorAcquisitionBucket[];
  byCampaign: OperatorAcquisitionBucket[];
}

export interface OperatorAcquisitionParams {
  /** Window in days on SIGNUP date (default 90, clamped 1–365). */
  windowDays?: number;
}

// ─── Slice 4: billing operations ─────────────────────────────────────────────
// Cross-tenant billing ops driven through the PLATFORM Stripe account. Shapes are
// wire-compatible with `@wizeworks/billing`'s operator results (api-rest returns those
// directly). Reads are empty when billing is unconfigured; writes error clearly.

/** A platform Stripe event — the webhook-log viewer row. */
export interface OperatorStripeEvent {
  id: string;
  type: string;
  createdAt: string;
}

/** A platform charge (money sparx collected from a tenant) — the refund source. */
export interface OperatorCharge {
  id: string;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
  status: string;
  created: string;
  description: string | null;
  paymentIntentId: string | null;
  receiptUrl: string | null;
  refunded: boolean;
}

/** A platform coupon (a discount on a tenant's sparx bill). */
export interface OperatorCoupon {
  id: string;
  name: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  timesRedeemed: number;
  valid: boolean;
}

export type OperatorRefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';

export interface OperatorRefundInput {
  chargeId: string;
  /** Partial amount in cents; omit for a full refund. */
  amountCents?: number;
  reason?: OperatorRefundReason;
}

export interface OperatorRefundResult {
  id: string;
  status: string;
  amountCents: number;
}

export interface OperatorCouponInput {
  name: string;
  percentOff?: number;
  amountOffCents?: number;
  currency?: string;
  duration: 'forever' | 'once' | 'repeating';
  durationInMonths?: number;
}

/** A promotion code — the typeable string (`LAUNCH50`) a tenant redeems in the
 *  Checkout discount box, layered on a coupon. `customerId` non-null ⇒ locked to
 *  one tenant (tenant-targeted); null ⇒ any tenant (public). */
export interface OperatorPromotionCode {
  id: string;
  code: string;
  couponId: string;
  couponName: string | null;
  active: boolean;
  customerId: string | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: string | null;
  firstTimeOnly: boolean;
  minimumAmountCents: number | null;
}

export interface OperatorPromotionCodeInput {
  /** The coupon this code redeems. */
  couponId: string;
  /** Customer-facing code; Stripe generates one if omitted. Letters + digits only. */
  code?: string;
  /** Lock the code to a single tenant (its Stripe customer is resolved server-side).
   *  Omit for a public code any tenant can redeem. */
  tenantId?: string;
  maxRedemptions?: number;
  /** ISO date the code stops working. */
  expiresAt?: string;
  firstTimeOnly?: boolean;
  minimumAmountCents?: number;
}

export interface OperatorInvoiceLine {
  description: string;
  amountCents: number;
}

export interface OperatorInvoiceInput {
  /** The tenant to invoice (its platform Stripe customer id is resolved server-side). */
  tenantId: string;
  lines: OperatorInvoiceLine[];
  daysUntilDue?: number;
  memo?: string;
  autoFinalize: boolean;
}

export interface OperatorInvoiceResult {
  id: string;
  status: string;
  totalCents: number;
  hostedInvoiceUrl: string | null;
}

/** A tenant's platform-billing view: the subscription snapshot + recent charges. */
export interface OperatorTenantBillingView {
  tenantId: string;
  name: string;
  hasStripeCustomer: boolean;
  billing: OperatorTenantBilling;
  charges: OperatorCharge[];
}

// ─── Slice 5: domain management ──────────────────────────────────────────────
// All custom + purchased domains across every tenant, with SSL/TLS readiness,
// live DNS diagnostics, GoDaddy purchase history, and a force re-verify that
// re-runs the same verification the tenant's own dashboard does (custom hosts:
// synchronous DNS re-check; purchased hosts: re-trigger the domain-worker path).
// `domains` is a non-RLS dispatch table, so the cross-tenant list reads it
// directly; per-domain purchase history is tenant-scoped (FORCE RLS).

/** TLS readiness DERIVED from the domain's routing lifecycle. In this
 *  architecture Caddy issues on-demand certs once a host is authorized
 *  ('verified'/'active', or a purchased host already routing), so TLS readiness
 *  is a function of domain status — there is no separate cert store to read. */
export type OperatorDomainSslStatus = 'secured' | 'provisioning' | 'unsecured';

/** One row in the cross-tenant domain list. Joins the (non-RLS) tenant for its
 *  name/slug; the property is FORCE-RLS and resolved only on the detail view. */
export interface OperatorDomainListItem {
  id: string;
  host: string;
  /** subdomain | custom | purchased. */
  type: string;
  /** pending | verifying | verified | active | failed | pending_ssl | transfer_pending. */
  status: string;
  sslStatus: OperatorDomainSslStatus;
  isCanonical: boolean;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  /** The tenant's account lifecycle (`active` | `suspended`) for context. */
  tenantStatus: string;
  registrar: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  /** Purchased domain whose registration lapses within 30 days. */
  expiringSoon: boolean;
  autoRenew: boolean;
  createdAt: string;
}

/** Cross-tenant domain counts for the list header strip (scoped to the tenant
 *  filter when one is active, but NOT to the finer q/status/type filters). */
export interface OperatorDomainCounts {
  total: number;
  custom: number;
  purchased: number;
  subdomain: number;
  /** custom/purchased hosts not yet live (pending/verifying/failed/pending_ssl/transfer_pending). */
  needsAttention: number;
  /** purchased hosts expiring within 30 days. */
  expiringSoon: number;
}

export interface OperatorDomainListResult {
  domains: OperatorDomainListItem[];
  total: number;
  limit: number;
  offset: number;
  counts: OperatorDomainCounts;
}

export interface OperatorDomainListParams {
  /** Case-insensitive substring match on `host`. */
  q?: string;
  status?: string;
  type?: 'custom' | 'purchased' | 'subdomain';
  /** Restrict to one tenant's domains (deep-link from the tenant detail). */
  tenantId?: string;
  /** Only rows needing operator attention (not yet live / failed). */
  attention?: boolean;
  limit?: number;
  offset?: number;
}

/** One expected DNS record for a custom/purchased host, with the live-observed
 *  values and whether they satisfy it — the operator's verification diagnostic. */
export interface OperatorDomainDnsRecord {
  kind: 'CNAME' | 'TXT';
  name: string;
  expected: string;
  /** What DNS currently returns for `name` (live lookup), or [] if unresolved. */
  observed: string[];
  matches: boolean;
}

/** Live DNS diagnostic — expected vs. observed. Null for subdomain hosts on our
 *  own zone (managed automatically; nothing an operator can fix). */
export interface OperatorDomainDnsProbe {
  checkedAt: string;
  records: OperatorDomainDnsRecord[];
  /** True when every expected record resolves. */
  allResolved: boolean;
}

/** One GoDaddy purchase-ledger row (registration / renewal / transfer). */
export interface OperatorDomainPurchase {
  id: string;
  domain: string;
  registrar: string;
  registrarOrderId: string | null;
  amountCents: number;
  years: number;
  /** registration | renewal | transfer. */
  type: string;
  /** pending | completed | failed. */
  status: string;
  createdAt: string;
}

/** How a host proves ownership: `txt` (apex custom), `cname` (subdomain custom),
 *  `auto` (subdomain on our zone, or a sparx-purchased host we manage). */
export type OperatorDomainVerificationMethod = 'cname' | 'txt' | 'auto';

export interface OperatorDomainDetail {
  id: string;
  host: string;
  type: string;
  status: string;
  sslStatus: OperatorDomainSslStatus;
  isCanonical: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Registrar block — populated for type='purchased' (nulls/false otherwise).
  registrar: string | null;
  registrarOrderId: string | null;
  registeredAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  whoisPrivacy: boolean;
  renewalPriceCents: number | null;
  expiringSoon: boolean;
  tenant: { id: string; name: string; slug: string; status: string };
  /** The site this host is attached to (resolved under tenant context). */
  property: { id: string; name: string | null; slug: string | null };
  verificationMethod: OperatorDomainVerificationMethod;
  dnsProbe: OperatorDomainDnsProbe | null;
  purchases: OperatorDomainPurchase[];
}

/** Result of a force re-verify.
 *  · `synchronous` — a custom host's DNS was re-checked immediately (`passed` set);
 *  · `queued`      — a purchased host re-triggered the domain-worker (async, `passed` null);
 *  · `noop`        — nothing to verify (auto-managed host, or a verified apex whose
 *                     one-time token was already spent). */
export interface OperatorDomainReverifyResult {
  id: string;
  host: string;
  mode: 'synchronous' | 'queued' | 'noop';
  status: string;
  sslStatus: OperatorDomainSslStatus;
  verifiedAt: string | null;
  /** synchronous: whether verification passed; queued/noop: null. */
  passed: boolean | null;
  message: string;
  dnsProbe: OperatorDomainDnsProbe | null;
}

// ─── Slice 6: support tools ──────────────────────────────────────────────────
// Cross-tenant order/customer lookup (via Typesense, which spans all tenants),
// per-tenant search-index stats + reindex, order-confirmation re-send, and the
// email delivery log. Search hits carry their owning tenant, resolved to a name.

/** One cross-tenant order search hit (a Typesense `orders` doc + resolved tenant). */
export interface OperatorOrderHit {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  paymentStatus: string;
  channel: string;
  totalCents: number;
  currency: string;
  /** ISO-8601, from the `placed_at` epoch. */
  placedAt: string;
}

export interface OperatorOrderSearchResult {
  orders: OperatorOrderHit[];
  found: number;
  page: number;
  perPage: number;
}

/** One cross-tenant customer search hit (a Typesense `customers` doc + tenant). */
export interface OperatorCustomerHit {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  customerId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  /** Relationship type: retail | b2b | partner | vendor (docs/137). */
  type: string;
  totalSpentCents: number;
  orderCount: number;
  lastOrderAt: string | null;
}

export interface OperatorCustomerSearchResult {
  customers: OperatorCustomerHit[];
  found: number;
  page: number;
  perPage: number;
}

export interface OperatorSupportSearchParams {
  q: string;
  page?: number;
}

/** One tenant's per-collection Typesense document count. */
export interface OperatorSearchIndexCollection {
  collection: string;
  documents: number;
}

export interface OperatorSearchIndexStatus {
  tenantId: string;
  collections: OperatorSearchIndexCollection[];
  /** True when Typesense couldn't be reached — the counts are unknown, not zero. */
  unavailable: boolean;
}

export type OperatorReindexCollection = 'products' | 'customers' | 'orders';

export interface OperatorReindexInput {
  /** Omit to rebuild every collection. */
  collections?: OperatorReindexCollection[];
  /** Delete stale docs no longer in Postgres (a full rebuild rather than upsert). */
  dropStale?: boolean;
}

export interface OperatorReindexResult {
  runId: string;
  accepted: boolean;
}

/** One email delivery-log row — a Mailgun webhook event or our own
 *  accepted/failed marker (the `email_events` ledger). */
export interface OperatorEmailEvent {
  id: string;
  messageId: string | null;
  recipient: string;
  /** accepted | delivered | opened | clicked | bounced | complained | unsubscribed | failed. */
  type: string;
  reason: string | null;
  broadcastId: string | null;
  automationKey: string | null;
  occurredAt: string;
}

export interface OperatorEmailLogParams {
  /** Case-insensitive substring match on the recipient address. */
  recipient?: string;
  /** Exact event-type filter. */
  type?: string;
  /** Exact Mailgun message-id filter (trace one message's whole lifecycle). */
  messageId?: string;
  limit?: number;
}

export interface OperatorEmailLogResult {
  events: OperatorEmailEvent[];
}

/** Result of re-sending an order-confirmation email. `sent:false` with a reason
 *  when there's no published template, no recipient email, or a compliance block —
 *  never an error (mirrors `sendTenantEmailByKey`). */
export interface OperatorResendConfirmationResult {
  sent: boolean;
  reason: string | null;
  orderNumber: string;
  to: string | null;
}

// ─── Slice 7: feedback triage ────────────────────────────────────────────────
// The WizeWorks-staff side of in-product feedback (docs/apps/admin/feedback.md):
// the cross-tenant inbox, submission detail + thread, triage, and the reply loop.
// `feedback_*` are tenant-scoped FORCE-RLS with no Typesense mirror, so the inbox
// is a bounded per-tenant scan; detail/triage/reply carry `tenantId` and go direct.
// `assigneeStaffId` is a bare wize_admin operator uuid (FK-free, D3) — api-rest
// returns it raw; the admin app resolves it to a name (api-rest can't reach
// wize_admin). No impersonation (D7): context entities are shown, not deep-linked.

export type OperatorFeedbackStatus =
  'new' | 'triaged' | 'planned' | 'in_progress' | 'shipped' | 'declined' | 'answered';

export type OperatorFeedbackCategory = 'idea' | 'problem' | 'question' | 'praise';

/** One inbox row. Derived from a submission (+ its owning tenant, resolved). */
export interface OperatorFeedbackItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  category: string;
  status: string;
  subject: string | null;
  /** First line of the body, for a title when `subject` is absent. */
  excerpt: string;
  submitterName: string | null;
  submitterEmail: string | null;
  /** `context.module` — where in the app it came from. */
  module: string | null;
  sentiment: number | null;
  /** A bare wize_admin operator id (resolve to a name admin-side), or null. */
  assigneeStaffId: string | null;
  internalTags: string[];
  messageCount: number;
  lastResponseAt: string | null;
  userUnread: boolean;
  createdAt: string;
}

/** Cross-tenant queue/volume counts for the inbox chips + friction view. */
export interface OperatorFeedbackCounts {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  /** Volume by `context.module` — which surfaces generate friction (§8). */
  byModule: Record<string, number>;
  /** `new`/`triaged` submissions with no assignee. */
  unassigned: number;
}

export interface OperatorFeedbackListResult {
  submissions: OperatorFeedbackItem[];
  total: number;
  page: number;
  perPage: number;
  counts: OperatorFeedbackCounts;
  /** True if any tenant hit the per-tenant scan cap — `total`/`counts` are a floor.
   *  The Phase-1 ceiling of the bounded-loop inbox (a reporting mirror lifts it). */
  truncated: boolean;
}

export interface OperatorFeedbackListParams {
  status?: string;
  category?: string;
  tenantId?: string;
  assigneeStaffId?: string;
  tag?: string;
  /** Free-text match on subject/body. */
  q?: string;
  page?: number;
}

export interface OperatorFeedbackMessage {
  id: string;
  /** staff | user. */
  authorKind: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** Full submission detail — the whole picture the triage view renders. */
export interface OperatorFeedbackDetail {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userId: string | null;
  category: string;
  status: string;
  source: string;
  subject: string | null;
  body: string;
  sentiment: number | null;
  /** The captured client context (docs/112 §4), rendered readable by the UI. */
  context: unknown;
  attachmentAssetIds: string[];
  assigneeStaffId: string | null;
  internalTags: string[];
  submitterName: string | null;
  submitterEmail: string | null;
  lastResponseAt: string | null;
  userUnread: boolean;
  createdAt: string;
  updatedAt: string;
  messages: OperatorFeedbackMessage[];
}

export interface OperatorFeedbackTriageInput {
  status?: OperatorFeedbackStatus;
  /** null clears the assignee; omit to leave unchanged. */
  assigneeStaffId?: string | null;
  internalTags?: string[];
  /** Notify the submitter of a status-change-alone (shipped/declined/answered
   *  always notify; planned/in_progress only when this is true; triaged never). */
  notify?: boolean;
}

export interface OperatorFeedbackReplyInput {
  body: string;
  /** Optionally bundle a status change with the reply. */
  status?: OperatorFeedbackStatus;
  /** Staff display-name snapshot for the message (api-rest can't read wize_admin
   *  for it; the admin app fills it from the session). */
  authorName?: string;
}

// ── Tenant write actions (build-plan §5 Slice 8) ─────────────────────────────

/** Body for a manual operator module activate/deactivate. */
export interface OperatorModuleToggleInput {
  enabled: boolean;
}

/** Result of an operator module toggle. Turning a module ON auto-activates (and
 *  bills) its paid requirements; turning one OFF is REJECTED (409 MODULE_BLOCKED)
 *  when another active module still requires it — mirroring the tenant's own
 *  toggle, which throws the same conflict. */
export interface OperatorModuleToggleResult {
  slug: string;
  /** The module's effective enabled state after the toggle. */
  enabled: boolean;
  /** Whether a flag actually changed (a redundant toggle is a no-op). */
  changed: boolean;
  /** The tenant's full module breakdown after the toggle (same shape as detail). */
  modules: OperatorTenantModule[];
}

/** Suspend / unsuspend a tenant. STATUS-ONLY for now: this flips `tenants.status`
 *  and records the change in the tenant's own activity log (owner-visible), but no
 *  request path yet BLOCKS a suspended tenant — enforcement is a scoped follow-up
 *  (docs/apps/admin/slice-8-enforcement-followups.md). */
export interface OperatorSuspendInput {
  suspended: boolean;
  /** Optional operator note on why — recorded in both audit trails. */
  reason?: string;
}

export interface OperatorTenantStatusResult {
  /** The tenant's effective status after the write (`active` | `suspended`). */
  status: string;
}

/** Set (or clear, with null) a tenant's per-tenant storage-cap override, in bytes.
 *  STORED + DISPLAYED for now; not yet enforced at the upload path — see the
 *  follow-up doc above. */
export interface OperatorStorageLimitInput {
  limitBytes: number | null;
}

export interface OperatorStorageLimitResult {
  limitBytes: number | null;
}

// ─── Partner Program (docs/114 §B; build-plan Slice 9) ───────────────────────
// The WizeWorks-side partner administration surface. Applications live on the
// platform tenant (a single scoped read); the active roster comes from
// `withSystem` (partners_visibility exposes active rows); per-partner detail
// (referrals/commissions/payouts) is read under the partner's own tenant context.

export type OperatorPartnerTier = 'informal' | 'registered' | 'certified';

/** A partner application in WizeWorks' review queue. */
export interface OperatorPartnerApplication {
  id: string;
  /** The applicant's Sparx org (tenant) id, or null if they applied before signing up. */
  applicantTenantId: string | null;
  name: string;
  email: string;
  websiteUrl: string | null;
  /** freelance | agency | … */
  kind: string;
  note: string | null;
  requestedTier: string;
  /** pending | approved | rejected */
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** A row in the active partner roster. */
export interface OperatorPartnerListItem {
  /** The partner's org (tenant) id — the handle for tier/status actions + detail. */
  tenantId: string;
  id: string;
  displayName: string;
  kind: string;
  tier: OperatorPartnerTier;
  status: string;
  referralCode: string;
  websiteUrl: string | null;
  directoryVisible: boolean;
  /** Whether a Stripe Connect payout account is connected (a boolean signal). */
  hasPayoutAccount: boolean;
  approvedAt: string | null;
  createdAt: string;
}

export interface OperatorPartnerReferral {
  id: string;
  referredTenantId: string;
  /** The referred org's live name, or null if it can't be resolved. */
  referredOrgName: string | null;
  referralCode: string;
  /** pending | active | … */
  status: string;
  commissionRate: number;
  firstPaymentAt: string | null;
  createdAt: string;
}

export interface OperatorPartnerCommission {
  id: string;
  amountCents: number;
  currency: string;
  /** one_time | recurring */
  kind: string;
  /** pending | approved | paid | forfeited */
  status: string;
  payoutRunId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface OperatorPartnerPayoutRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  currency: string;
  commissionCount: number;
  status: string;
  stripeTransferId: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** KPIs mirroring the partner's own portal overview. */
export interface OperatorPartnerKpis {
  referralCount: number;
  activeReferrals: number;
  lifetimeCents: number;
  pendingCents: number;
}

/** One partner's full picture (profile + ledgers + KPIs). */
export interface OperatorPartnerDetail {
  partner: OperatorPartnerListItem;
  bio: string | null;
  payoutMinCents: number;
  kpis: OperatorPartnerKpis;
  referrals: OperatorPartnerReferral[];
  commissions: OperatorPartnerCommission[];
  payouts: OperatorPartnerPayoutRun[];
}

export interface OperatorPartnerApproveInput {
  /** Override the requested tier at approval; omit to grant the requested tier. */
  tier?: OperatorPartnerTier;
}
export interface OperatorPartnerRejectInput {
  note?: string;
}
export interface OperatorPartnerTierInput {
  tier: OperatorPartnerTier;
}
export interface OperatorPartnerStatusInput {
  status: 'active' | 'suspended';
}

/** Result of the monthly Stripe Connect payout batch. */
export interface OperatorPayoutRunResult {
  partnersPaid: number;
  totalCents: number;
  skipped: number;
}
export interface OperatorCommissionApproveResult {
  approved: number;
}

/** A published bootcamp in the cross-partner overview (mirrors the public
 *  directory card — bootcamps are host-partner-owned, read-only for operators). */
export interface OperatorBootcampCard {
  id: string;
  title: string;
  slug: string;
  format: string;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: number | null;
  seatsFilled: number;
  priceCents: number;
  currency: string;
  host: { displayName: string; tier: string };
}
export interface OperatorBootcampListResult {
  items: OperatorBootcampCard[];
  total: number;
}

// ─── Users & Sites (docs/apps/admin — user & site management) ─────────────────
// Cross-tenant STAFF-user (User/Member) + SITE (Property) administration. The
// fleet-wide lists read under `withSystem` (the operator/system context exposed by
// the additive `*_operator_read` visibility policies); per-membership/site WRITES
// stay tenant-scoped under `withTenant`. NOT shopper accounts (CustomerUser —
// those live in each tenant's CRM).

/** One row in the cross-tenant staff-user roster. Identity from `users`; the home
 *  tenant is `users.tenant_id` resolved to a name via the non-RLS dispatch table. */
export interface OperatorUserListItem {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  /** Which product this login belongs to. An address may hold one account per
   *  product, so two rows can differ only here — it is what tells them apart. */
  platformBrand: string;
  /** The user's HOME tenant (users.tenant_id) — where they were provisioned. */
  homeTenantId: string;
  homeTenantName: string | null;
  homeTenantSlug: string | null;
  /** Legacy single-role column (superseded per-membership, kept for the list). */
  role: string;
  /** Count of org memberships (a consultant belongs to several tenants). */
  membershipCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface OperatorUserListResult {
  users: OperatorUserListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Query parameters for the user list. */
export interface OperatorUserListParams {
  /** Case-insensitive search across email / name. */
  q?: string;
  limit?: number;
  offset?: number;
}

/** One of a user's org memberships, with the org resolved to a name. */
export interface OperatorUserMembership {
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  /** Per-membership role — owner | admin | editor | builder | marketing | support | viewer. */
  role: string;
  /** owner | staff | consultant. */
  memberType: string;
  /** active | invited | suspended. */
  status: string;
  createdAt: string;
}

/** Full staff-user detail for the operator console. */
export interface OperatorUserDetail {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
  role: string;
  /** Which product this login belongs to — and therefore which brand's auth
   *  service can act on it (a password reset has to reach that one). */
  platformBrand: string;
  homeTenantId: string;
  homeTenantName: string | null;
  homeTenantSlug: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Every org this user belongs to (docs/114 Part A). */
  memberships: OperatorUserMembership[];
}

/** Suspend / reactivate a user's membership in a specific tenant (Member.status). */
export interface OperatorMembershipStatusInput {
  tenantId: string;
  suspended: boolean;
}

/** Change a user's role within a specific tenant (Member.role). */
export interface OperatorMembershipRoleInput {
  tenantId: string;
  role: string;
}

/** Remove a user's membership from a specific tenant. */
export interface OperatorMembershipRemoveInput {
  tenantId: string;
}

/** The user's memberships after a write — the detail re-renders from these. */
export interface OperatorUserMembershipsResult {
  memberships: OperatorUserMembership[];
}

/** Result of triggering a password reset for a user (Better Auth
 *  requestPasswordReset via the dashboard reverse seam). */
export interface OperatorPasswordResetResult {
  /** Whether the reset email was dispatched. */
  sent: boolean;
}

/** One hostname pointing at a site (subset of the tenant-domain shape). */
export interface OperatorSiteDomain {
  host: string;
  /** subdomain | custom | purchased. */
  type: string;
  /** pending | verifying | verified | active | failed. */
  status: string;
  isCanonical: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

/** One row in the cross-tenant site roster. `properties` read under `withSystem`;
 *  the owning tenant resolved to a name via the non-RLS dispatch table. */
export interface OperatorSiteListItem {
  id: string;
  /** The CUSTOMER-FACING site name (Property.name). */
  name: string;
  slug: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  isPrimary: boolean;
  /** active | paused | archived (properties.status). */
  status: string;
  /** Count of hostnames pointing at this site. */
  domainCount: number;
  createdAt: string;
}

export interface OperatorSiteListResult {
  sites: OperatorSiteListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Query parameters for the site list. */
export interface OperatorSiteListParams {
  /** Case-insensitive search across site name / slug. */
  q?: string;
  /** Exact-match filter on properties.status. */
  status?: string;
  limit?: number;
  offset?: number;
}

/** Full site detail for the operator console. */
export interface OperatorSiteDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  isPrimary: boolean;
  /** Whether the platform attribution badge shows on this site. Which
   *  product it credits is resolved per tenant from `platform_brand`. */
  showPlatformCredit: boolean;
  /** Module slugs DISABLED for this site only (can only narrow the tenant set). */
  moduleScope: string[];
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  domains: OperatorSiteDomain[];
  createdAt: string;
  updatedAt: string;
}

/** Pause / archive / reactivate a site (properties.status). */
export interface OperatorSiteStatusInput {
  /** active | paused | archived. */
  status: string;
}

export interface OperatorSiteStatusResult {
  status: string;
}

// ── Announcements (the header notice bar) ──────────────────────────────────
//
// One staff-authored sentence above a brand's surfaces, stored in
// `platform_announcements` and edited in the admin console. Platform-owned, not
// tenant-owned: this is WizeWorks talking to its own customers, so no tenant id
// appears anywhere in these shapes.

/** Where a notice shows. The three surfaces answer different questions, so a
 *  notice states which of them it is for rather than appearing on all three. */
export type OperatorAnnouncementSurface = 'marketing' | 'account' | 'console';

/** The silica color the bar wears. Named rather than free-form so the bar is
 *  themed by the design system and an operator cannot type a hex. */
export type OperatorAnnouncementTone = 'primary' | 'info' | 'success' | 'warning' | 'danger';

export interface OperatorAnnouncement {
  id: string;
  /** `sparx` | `piggles` — which product this speaks for. */
  platformBrand: string;
  surfaces: OperatorAnnouncementSurface[];
  message: string;
  linkLabel: string | null;
  linkHref: string | null;
  tone: OperatorAnnouncementTone;
  dismissible: boolean;
  /** ISO timestamps, or null for open-ended. */
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
  /** The wize_admin operator id that last wrote it, resolved to a name in the
   *  console (this package holds no operator directory). */
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** DERIVED, never stored: is this on screen right now? `isActive` is the
   *  switch and the dates are the window, and a list that showed only the switch
   *  would report a scheduled notice as running. */
  live: boolean;
}

/** Create / replace payload. `surfaces` must be non-empty and `linkLabel` +
 *  `linkHref` must be supplied together or not at all — api-rest rejects the
 *  half-filled pair rather than rendering a button that does nothing. */
export interface OperatorAnnouncementInput {
  platformBrand: string;
  surfaces: OperatorAnnouncementSurface[];
  message: string;
  linkLabel?: string | null;
  linkHref?: string | null;
  tone?: OperatorAnnouncementTone;
  dismissible?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  priority?: number;
}

/** Every field optional — the list's on/off switch patches `isActive` alone. */
export type OperatorAnnouncementPatch = Partial<OperatorAnnouncementInput>;

export interface OperatorAnnouncementListParams {
  /** Filter to one brand. Omitted = every brand, which is the console default:
   *  an operator managing both products wants to see both. */
  brand?: string;
  surface?: OperatorAnnouncementSurface;
}

export interface OperatorAnnouncementListResult {
  announcements: OperatorAnnouncement[];
}
