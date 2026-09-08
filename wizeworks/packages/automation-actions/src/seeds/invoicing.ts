// Invoicing system-automation seeds (docs/90 §3b). The Managed defaults that ship
// on Invoicing activation: a task when a user-authored document is approved, the
// dunning ladder for user invoices — a friendly 3-day reminder and three
// overdue notices (7 / 14 / 30 days) — and a payment receipt. The dunning ladder
// + approval task are partitioned to USER workflows (`workflowSlug !=
// 'net-terms-ar'`, the B2B AR substrate) so they never double up with the B2B
// credit-hold escalation, which owns net-terms AR dunning; the receipt fires for
// every workflow, B2B AR included.
//
// Each dunning seed is a daily scan over the `billing_document` scanner; the
// exact-day predicate (`daysUntilDue == 3`, `overdueDays == 7/14/30`) fires it once
// per document as it crosses that day. The send is transactional — a dunning notice
// is operational, not marketing, so a marketing opt-out never withholds it.
//
// EVERY dunning step also requires that the invoice was actually sent (`WAS_SENT`).
// It did not, and the ladder chased bills the customer had never been given —
// see the comment on that constant, which is the one to read before editing any
// predicate in this file.

import type { SystemAutomationSpec } from '@wizeworks/automation';

import type { ConditionGroup } from '@wizeworks/automation-schemas';

// USER-workflow guard shared by every dunning seed — excludes the B2B AR ledger.
const USER_INVOICE = {
  field: 'invoice.workflowSlug',
  operator: 'neq',
  value: 'net-terms-ar',
} as const;
const HAS_EMAIL = { field: 'customer.email', operator: 'is_set' } as const;

/**
 * NEVER CHASE A BILL THE CUSTOMER WAS NEVER GIVEN.
 *
 * Making an invoice and sending it are two acts, and this ladder was written as
 * though they were one: every step below keyed on the due date alone. An owner
 * who raised an invoice and had not yet emailed it — which is the normal state
 * of an invoice for as long as it takes to set a deadline and check a line —
 * had her customer sent a friendly reminder about a bill they had never seen,
 * then an overdue notice, then a second, then a final one. Four escalating
 * letters about a document that never left the building.
 *
 * `sentAt` is written by the send route (`POST /v1/invoicing/documents/:id/send`)
 * and by nothing else, so requiring it here means the ladder starts only once
 * the customer genuinely has the document.
 *
 * The consequence to hold on to: an invoice she never sends is now never
 * chased AND never sent, silently. That is only safe because the receivables
 * list marks an unsent invoice as unsent — see the "Not sent" state on
 * Invoices. Take that marker away and this guard becomes a way to lose money.
 */
const WAS_SENT = { field: 'invoice.sentAt', operator: 'is_set' } as const;

/** Build the predicate for a dunning step keyed on an exact overdue-day window. */
function overduePredicate(overdueDays: number): { entity: string; where: ConditionGroup } {
  return {
    entity: 'billing_document',
    where: {
      logic: 'AND',
      conditions: [
        { field: 'invoice.overdueDays', operator: 'eq', value: overdueDays },
        { field: 'invoice.status', operator: 'in', value: ['unpaid', 'partial'] },
        USER_INVOICE,
        HAS_EMAIL,
        WAS_SENT,
      ],
    },
  };
}

/** A friendly reminder three days before a user invoice is due. */
export const INVOICING_REMINDER_3D: SystemAutomationSpec = {
  name: 'Invoice reminder (3 days before due)',
  description: 'Emails the customer a friendly reminder three days before an invoice is due.',
  trigger: {
    kind: 'schedule',
    schedule: { cadence: 'daily', atMinuteUtc: 0 },
    predicate: {
      entity: 'billing_document',
      where: {
        logic: 'AND',
        conditions: [
          { field: 'invoice.daysUntilDue', operator: 'eq', value: 3 },
          { field: 'invoice.status', operator: 'eq', value: 'unpaid' },
          USER_INVOICE,
          HAS_EMAIL,
          WAS_SENT,
        ],
      },
    },
  },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'invoicing-reminder', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** First overdue notice — 7 days past due. */
export const INVOICING_OVERDUE_7: SystemAutomationSpec = {
  name: 'Invoice overdue (7 days)',
  description: 'Emails the customer when an invoice is 7 days overdue.',
  trigger: {
    kind: 'schedule',
    schedule: { cadence: 'daily', atMinuteUtc: 0 },
    predicate: overduePredicate(7),
  },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'invoicing-overdue', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Second overdue notice — 14 days past due. */
export const INVOICING_OVERDUE_14: SystemAutomationSpec = {
  name: 'Invoice overdue (14 days — second notice)',
  description: 'Emails the customer a second notice when an invoice is 14 days overdue.',
  trigger: {
    kind: 'schedule',
    schedule: { cadence: 'daily', atMinuteUtc: 0 },
    predicate: overduePredicate(14),
  },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'invoicing-overdue-2', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Final overdue notice — 30 days past due. */
export const INVOICING_OVERDUE_30: SystemAutomationSpec = {
  name: 'Invoice overdue (30 days — final notice)',
  description: 'Emails the customer a final notice when an invoice is 30 days overdue.',
  trigger: {
    kind: 'schedule',
    schedule: { cadence: 'daily', atMinuteUtc: 0 },
    predicate: overduePredicate(30),
  },
  conditions: { logic: 'AND', conditions: [] },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'invoicing-overdue-final', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** Sends the customer a receipt when a document's balance clears in full — any
 *  workflow, including the B2B AR ledger (a paid net-terms invoice deserves a
 *  receipt too), which is why this doesn't share the `USER_INVOICE` guard the
 *  dunning seeds above use. */
export const INVOICING_RECEIPT_ON_PAID: SystemAutomationSpec = {
  name: 'Payment received — send receipt',
  description: 'Emails the customer a receipt when a billing document is paid in full.',
  trigger: { kind: 'event', eventType: 'crm.billing_document.paid' },
  conditions: { logic: 'AND', conditions: [HAS_EMAIL] },
  actions: [
    {
      type: 'email.send_campaign',
      config: { builderEmailKey: 'invoicing-receipt', emailType: 'transactional' },
    },
  ],
  locked: false,
  status: 'active',
};

/** When a billing document reaches a committed (customer-approved) stage, open a
 *  task to advance it. Scoped to user-authored workflows, not the B2B AR ledger. */
export const INVOICING_ESTIMATE_APPROVED_TASK: SystemAutomationSpec = {
  name: 'Estimate approved — advance task',
  description:
    'Opens a task to advance the document when a user-authored billing document is approved (reaches a committed stage).',
  trigger: { kind: 'event', eventType: 'crm.billing_document.stage_changed' },
  conditions: {
    logic: 'AND',
    conditions: [
      { field: 'invoice.stageType', operator: 'eq', value: 'committed' },
      { field: 'invoice.workflowSlug', operator: 'neq', value: 'net-terms-ar' },
    ],
  },
  actions: [
    {
      type: 'crm.create_task',
      config: {
        title: 'Advance to next stage — {{invoice.number}}',
        assigneeField: 'invoice.assignedUserId',
        dueInDays: 0,
      },
    },
  ],
  locked: false,
  status: 'active',
};
