// System-automation seed catalog (docs/81 §3.1, docs/84 Slice F2).
//
// The Locked / Managed behaviors that ship turned on for every tenant. Each is a
// real row in `automations` (origin='system'), installed through the service's
// idempotent `upsertSystemAutomation` (matched on origin + name). They are NOT a
// parallel runtime — the engine runs them like any tenant automation; this module
// just declares the defaults.
//
// Wiring: `seedSystemAutomations(ctx)` runs on tenant provisioning and on module
// activation, so a tenant that enables a module later still gets its defaults. It
// is safe to re-run.

import type { Automation } from '@prisma/client';
import {
  upsertSystemAutomation,
  type ServiceCtx,
  type SystemAutomationSpec,
} from '@wizeworks/automation';

import {
  B2B_ACCOUNT_APPROVED,
  B2B_INVOICE_DUE_NUDGE,
  B2B_NEW_ACCOUNT_TASK,
  B2B_ORDER_APPROVED_EMAIL,
  B2B_ORDER_REJECTED_EMAIL,
  B2B_OVERDUE_ESCALATION,
  B2B_QUOTE_EXPIRING,
  B2B_QUOTE_RECEIVED,
} from './b2b.js';
import {
  CRM_AUTO_TAG_VIP,
  CRM_CHAT_OPENS_REQUEST,
  CRM_EMAIL_OPENS_REQUEST,
  CRM_DEAL_WON_INVOICE_TASK,
  CRM_NEW_LEAD_FOLLOW_UP_TASK,
  CRM_WELCOME_NEW_CUSTOMER,
  CRM_WIN_BACK_INACTIVE,
} from './crm.js';
import {
  COMMERCE_ABANDONED_CART_NUDGE,
  COMMERCE_HIGH_VALUE_ORDER_ALERT,
  COMMERCE_LOW_INVENTORY_ALERT,
  COMMERCE_ORDER_CANCELLED_EMAIL,
  COMMERCE_ORDER_CONFIRMATION_EMAIL,
  COMMERCE_SHIPPING_CONFIRMATION_EMAIL,
  COMMERCE_ORDER_DELIVERED_EMAIL,
  COMMERCE_ORDER_REFUNDED_EMAIL,
  COMMERCE_PAYMENT_FAILED_EMAIL,
  COMMERCE_POST_PURCHASE_REVIEW,
  COMMERCE_REFUND_CRM_NOTE,
  COMMERCE_RETURN_REQUESTED_ALERT,
} from './commerce.js';
import {
  INVOICING_ESTIMATE_APPROVED_TASK,
  INVOICING_OVERDUE_7,
  INVOICING_OVERDUE_14,
  INVOICING_OVERDUE_30,
  INVOICING_RECEIPT_ON_PAID,
  INVOICING_REMINDER_3D,
} from './invoicing.js';
import {
  SUBSCRIPTION_AUTHENTICATION_REQUIRED_EMAIL,
  SUBSCRIPTION_CANCELLED_EMAIL,
  SUBSCRIPTION_CONFIRMED_EMAIL,
  SUBSCRIPTION_INVOICE_EMAIL,
  SUBSCRIPTION_PAUSED_EMAIL,
  SUBSCRIPTION_PAYMENT_FAILED_EMAIL,
  SUBSCRIPTION_RENEWED_EMAIL,
  SUBSCRIPTION_RESUMED_EMAIL,
} from './subscriptions.js';
import { RETURN_APPROVED_EMAIL, RETURN_RECEIVED_EMAIL, RETURN_REFUNDED_EMAIL } from './returns.js';
import { CHAT_NO_RESPONSE_ALERT, CHAT_SATISFACTION_SURVEY } from './chat.js';
import { INVENTORY_AUTO_REORDER } from './inventory.js';
import { FORM_HANDLE_SUBMISSIONS } from './forms.js';
import { SOCIAL_ANNOUNCE_BLOG, SOCIAL_ANNOUNCE_PRODUCT } from './social.js';
import {
  NOTIFY_PAYMENT_FAILED,
  NOTIFY_STOCK_DEPLETED,
  NOTIFY_SUBSCRIPTION_PAYMENT_FAILED,
} from './notifications.js';

/** A seed plus the module whose activation installs it. `module: null` ⇒ always
 *  seeded (platform-level, no owning module). */
export interface SystemAutomationSeed {
  module: string | null;
  spec: SystemAutomationSpec;
}

/**
 * Every platform-seeded system automation, grouped by owning module — the full
 * catalog (docs/90 §3b). 45 seeds: the no-email defaults (tags, tasks, notes,
 * internal staff alerts, the paused inventory auto-reorder) + the locked B2B
 * dunning + the 31 email-sending defaults that reference a provisioned
 * Builder-email template by `key` (incl. the four order-lifecycle emails, the six
 * subscription lifecycle emails, the three returns/RMA emails, and the two B2B
 * order-approval outcomes). An email seed
 * installs on its OWNING module's activation (a commerce tenant gets abandoned-cart
 * the moment commerce is on); its send is then gated by the `email.send_campaign`
 * action's `module: 'email'` gate until the email module is active (docs/90 §4 —
 * the gated step in run history is the conversion nudge). Append here as behaviors
 * land; keep this list and the per-module seed files the single source of truth.
 */
export const SYSTEM_AUTOMATIONS: readonly SystemAutomationSeed[] = [
  // CRM
  { module: 'crm', spec: CRM_AUTO_TAG_VIP },
  { module: 'crm', spec: CRM_EMAIL_OPENS_REQUEST },
  { module: 'crm', spec: CRM_CHAT_OPENS_REQUEST },
  { module: 'crm', spec: CRM_NEW_LEAD_FOLLOW_UP_TASK },
  { module: 'crm', spec: CRM_DEAL_WON_INVOICE_TASK },
  { module: 'crm', spec: CRM_WELCOME_NEW_CUSTOMER },
  { module: 'crm', spec: CRM_WIN_BACK_INACTIVE },
  // Commerce
  { module: 'commerce', spec: COMMERCE_HIGH_VALUE_ORDER_ALERT },
  { module: 'commerce', spec: COMMERCE_LOW_INVENTORY_ALERT },
  { module: 'commerce', spec: COMMERCE_REFUND_CRM_NOTE },
  { module: 'commerce', spec: COMMERCE_RETURN_REQUESTED_ALERT },
  { module: 'commerce', spec: COMMERCE_ABANDONED_CART_NUDGE },
  { module: 'commerce', spec: COMMERCE_POST_PURCHASE_REVIEW },
  // First in the order's life, so first in the list.
  { module: 'commerce', spec: COMMERCE_ORDER_CONFIRMATION_EMAIL },
  { module: 'commerce', spec: COMMERCE_SHIPPING_CONFIRMATION_EMAIL },
  { module: 'commerce', spec: COMMERCE_ORDER_DELIVERED_EMAIL },
  { module: 'commerce', spec: COMMERCE_ORDER_CANCELLED_EMAIL },
  { module: 'commerce', spec: COMMERCE_ORDER_REFUNDED_EMAIL },
  { module: 'commerce', spec: COMMERCE_PAYMENT_FAILED_EMAIL },
  // Commerce subscription lifecycle (docs/impl transactional-email §4 P2)
  { module: 'commerce', spec: SUBSCRIPTION_CONFIRMED_EMAIL },
  { module: 'commerce', spec: SUBSCRIPTION_RENEWED_EMAIL },
  { module: 'commerce', spec: SUBSCRIPTION_PAYMENT_FAILED_EMAIL },
  // The two collection outcomes that are NOT failures (docs/142)
  { module: 'commerce', spec: SUBSCRIPTION_AUTHENTICATION_REQUIRED_EMAIL },
  { module: 'commerce', spec: SUBSCRIPTION_INVOICE_EMAIL },
  { module: 'commerce', spec: SUBSCRIPTION_PAUSED_EMAIL },
  { module: 'commerce', spec: SUBSCRIPTION_RESUMED_EMAIL },
  { module: 'commerce', spec: SUBSCRIPTION_CANCELLED_EMAIL },
  // Returns / RMA (docs/impl transactional-email §4 P3)
  { module: 'commerce', spec: RETURN_APPROVED_EMAIL },
  { module: 'commerce', spec: RETURN_RECEIVED_EMAIL },
  { module: 'commerce', spec: RETURN_REFUNDED_EMAIL },
  // B2B
  { module: 'b2b', spec: B2B_OVERDUE_ESCALATION },
  { module: 'b2b', spec: B2B_NEW_ACCOUNT_TASK },
  { module: 'b2b', spec: B2B_ACCOUNT_APPROVED },
  { module: 'b2b', spec: B2B_QUOTE_RECEIVED },
  { module: 'b2b', spec: B2B_INVOICE_DUE_NUDGE },
  { module: 'b2b', spec: B2B_QUOTE_EXPIRING },
  // B2B order approval outcomes (docs/impl transactional-email §4 P3)
  { module: 'b2b', spec: B2B_ORDER_APPROVED_EMAIL },
  { module: 'b2b', spec: B2B_ORDER_REJECTED_EMAIL },
  // Invoicing
  { module: 'invoicing', spec: INVOICING_ESTIMATE_APPROVED_TASK },
  { module: 'invoicing', spec: INVOICING_REMINDER_3D },
  { module: 'invoicing', spec: INVOICING_OVERDUE_7 },
  { module: 'invoicing', spec: INVOICING_OVERDUE_14 },
  { module: 'invoicing', spec: INVOICING_OVERDUE_30 },
  { module: 'invoicing', spec: INVOICING_RECEIPT_ON_PAID },
  // Chat
  { module: 'chat', spec: CHAT_NO_RESPONSE_ALERT },
  { module: 'chat', spec: CHAT_SATISFACTION_SURVEY },
  // Inventory — auto-reorder ships paused (opt-in).
  { module: 'inventory', spec: INVENTORY_AUTO_REORDER },
  // In-app notifications (docs/124 Phase 3) — the "what needs me?" defaults.
  // Grouped under the module whose EVENT triggers them, so a content-only
  // tenant never gets a commerce notification rule it can't trigger.
  { module: 'commerce', spec: NOTIFY_PAYMENT_FAILED },
  { module: 'commerce', spec: NOTIFY_SUBSCRIPTION_PAYMENT_FAILED },
  { module: 'inventory', spec: NOTIFY_STOCK_DEPLETED },
  // Site forms (docs/115) — always-on (module: null): any tenant with a site can
  // have a form. Its actions self-gate per the form's own toggles; the CRM step
  // rides the crm gate so it no-ops until CRM is on.
  { module: null, spec: FORM_HANDLE_SUBMISSIONS },
  // Social (docs/133 §11) — starter posts, seeded PAUSED. Install on Social
  // activation; each drafts into the Approvals inbox once the tenant connects an
  // account, picks targets, and turns the rule on.
  { module: 'social', spec: SOCIAL_ANNOUNCE_PRODUCT },
  { module: 'social', spec: SOCIAL_ANNOUNCE_BLOG },
];

/**
 * Idempotently install system automations for one tenant. Each spec upserts by
 * (origin='system', name), so re-running updates in place — safe on every
 * provisioning + `module.activated` event.
 *
 * Pass `opts.module` (the just-activated slug) to install ONLY that module's
 * seeds — a tenant that enables B2B shouldn't get a clutter of other modules'
 * automations. Omit it (the backfill path) to install the whole catalog.
 */
export async function seedSystemAutomations(
  ctx: ServiceCtx,
  opts: { module?: string } = {}
): Promise<Automation[]> {
  const installed: Automation[] = [];
  for (const seed of SYSTEM_AUTOMATIONS) {
    if (opts.module && seed.module !== null && seed.module !== opts.module) continue;
    installed.push(await upsertSystemAutomation(ctx, seed.spec));
  }
  return installed;
}
