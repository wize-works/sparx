// The authoring vocabulary for the automations builder — the human-facing set of
// triggers, condition operators, and actions the editor offers, written for a
// business owner rather than a developer.
//
// Two honesty rules bake in, straight from the engine's own contract:
//   1. Event types and condition fields are FREE TEXT in the schema (typed as
//      `string`), so this file supplies curated SUGGESTIONS, never a hard enum —
//      a rule can always reference a custom event or field, and an existing one
//      that does still round-trips.
//   2. Only actions with a registered executor are OFFERED for a new step
//      (`available: true`). Deferred actions are still defined so an existing
//      rule that uses one renders and saves unchanged, but they are never a
//      choice when building something new.
//
// Pure and client-safe: no server imports, no hooks. Built from scratch for the
// workbench; it does not depend on the dashboard's copy.

import type { ActionType, ConditionOperator } from '@wizeworks/automation-schemas';
import { productCopy } from '../../lib/product';

/** The feature modules an automation can touch — the keys used for the module
 *  tags on a rule row. Matches the workbench module hues.
 *
 *  HAND-KEPT, and deliberately NOT the platform-wide `ModuleSlug` from
 *  `@wizeworks/modules`: this lists only the modules that actually contribute a
 *  trigger or an action, so the filter row above the catalog is not padded with
 *  headings that match nothing. The cost is that a module which GAINS a trigger
 *  has to be added here too — `staff` and `finance` both shipped events with no
 *  entry, which made them unlistable in `TRIGGER_EVENTS` below. If you are
 *  adding an event to this catalog and TypeScript rejects the module name, this
 *  union is what you are missing, not the event. */
export type ModuleSlug =
  | 'crm'
  | 'email'
  | 'commerce'
  | 'b2b'
  | 'cms'
  | 'invoicing'
  | 'social'
  | 'staff'
  | 'finance'
  | 'dropship'
  | 'funnels'
  | 'platform';

// Exhaustive by construction — `Record<ModuleSlug, string>` means adding to the
// union above without a label here is a compile error rather than a slug
// leaking onto the screen through `moduleLabel`'s fallback.
const MODULE_LABEL: Record<ModuleSlug, string> = {
  crm: 'Customers',
  funnels: 'Campaigns',
  email: 'Email',
  commerce: 'Selling',
  b2b: 'Wholesale',
  cms: 'Content',
  invoicing: 'Invoicing',
  social: 'Social posts',
  // The sidebar's words, not the slug's: a person looks for "Your team", never
  // for "staff".
  staff: 'Your team',
  finance: 'Finance',
  dropship: 'Dropshipping',
  platform: 'Platform',
};

export function moduleLabel(slug: ModuleSlug): string {
  return MODULE_LABEL[slug] ?? slug;
}

/** Render an unknown config/condition value as display text without tripping
 *  `no-base-to-string`: primitives stringify, objects/arrays serialize as JSON. */
export function primitiveText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

// ─── triggers ────────────────────────────────────────────────────────────────

export interface TriggerEventDef {
  eventType: string;
  label: string;
  module: ModuleSlug;
}

/** Curated event suggestions, grouped by the part of the business they come
 *  from. Free text is still allowed — these are offered, not enforced.
 *
 *  Every entry here corresponds to an event the automation ENGINE actually
 *  publishes and (where fields matter) has a registered resolver for, so the
 *  suggestions never dangle a trigger that can't fire or resolves nothing. */
export const TRIGGER_EVENTS: readonly TriggerEventDef[] = [
  // ── Selling — orders ──
  { eventType: 'order.placed', label: 'An order is placed', module: 'commerce' },
  { eventType: 'order.paid', label: 'An order is paid', module: 'commerce' },
  { eventType: 'order.fulfilled', label: 'An order is fulfilled', module: 'commerce' },
  { eventType: 'order.delivered', label: 'An order is delivered', module: 'commerce' },
  { eventType: 'order.cancelled', label: 'An order is cancelled', module: 'commerce' },
  { eventType: 'order.refunded', label: 'An order is refunded', module: 'commerce' },
  { eventType: 'order.payment_failed', label: 'An order payment fails', module: 'commerce' },
  // ── Selling — subscriptions ──
  { eventType: 'subscription.created', label: 'A subscription starts', module: 'commerce' },
  { eventType: 'subscription.renewed', label: 'A subscription renews', module: 'commerce' },
  {
    eventType: 'subscription.payment_failed',
    label: 'A subscription payment fails',
    module: 'commerce',
  },
  { eventType: 'subscription.paused', label: 'A subscription is paused', module: 'commerce' },
  { eventType: 'subscription.resumed', label: 'A subscription resumes', module: 'commerce' },
  { eventType: 'subscription.cancelled', label: 'A subscription is cancelled', module: 'commerce' },
  // ── Selling — returns ──
  { eventType: 'return.approved', label: 'A return is approved', module: 'commerce' },
  { eventType: 'return.received', label: 'A return is received', module: 'commerce' },
  { eventType: 'return.refunded', label: 'A return is refunded', module: 'commerce' },
  // ── Selling — inventory ──
  { eventType: 'inventory.low', label: 'A product runs low on stock', module: 'commerce' },
  { eventType: 'inventory.depleted', label: 'A product sells out', module: 'commerce' },
  // ── Content ──
  { eventType: 'product.published', label: 'A product goes live', module: 'cms' },
  {
    eventType: 'content.entry.published',
    label: 'An article or page is published',
    module: 'cms',
  },
  { eventType: 'form.submitted', label: 'A form on your site is submitted', module: 'cms' },
  // ── Customers (CRM) ──
  { eventType: 'crm.customer.created', label: 'A new customer is added', module: 'crm' },
  { eventType: 'crm.customer.updated', label: 'A customer’s details change', module: 'crm' },
  { eventType: 'crm.customer.subscribed', label: 'A customer opts in to marketing', module: 'crm' },
  { eventType: 'crm.deal.created', label: 'A sales deal is created', module: 'crm' },
  {
    eventType: 'crm.deal.stage_changed',
    label: 'A sales deal changes stage (e.g. won or lost)',
    module: 'crm',
  },
  { eventType: 'crm.task.created', label: 'A task is created', module: 'crm' },
  // ── Workflow depth (docs/144 §9) ──
  //
  // "A detail you track changes" is the generic one, and it is the reason custom
  // properties are worth having at all: a business that invented "renewal date"
  // can now act on it without anyone at sparx knowing the field exists.
  {
    eventType: 'crm.property.changed',
    label: 'A detail you track changes on a record',
    module: 'crm',
  },
  {
    eventType: 'crm.association.added',
    label: 'Two records are linked to each other',
    module: 'crm',
  },
  { eventType: 'booking.created', label: 'Somebody books an appointment', module: 'crm' },
  { eventType: 'booking.cancelled', label: 'An appointment is cancelled', module: 'crm' },
  { eventType: 'booking.completed', label: 'An appointment is completed', module: 'crm' },
  { eventType: 'booking.no_show', label: 'Somebody misses their appointment', module: 'crm' },
  // ── Support requests (docs/144 §7) ──
  //
  // The inbound one is listed FIRST because it is the trigger most rules start
  // from — "somebody wrote to us" is the moment a support process begins.
  {
    eventType: 'crm.engagement.received',
    label: 'A customer replies or writes in',
    module: 'crm',
  },
  { eventType: 'crm.ticket.created', label: 'A support request is opened', module: 'crm' },
  {
    eventType: 'crm.ticket.stage_changed',
    label: 'A support request moves along (e.g. resolved)',
    module: 'crm',
  },
  {
    eventType: 'crm.ticket.sla.warning',
    label: 'A support request is running out of time',
    module: 'crm',
  },
  {
    eventType: 'crm.ticket.sla.breached',
    label: 'A support request missed its response time',
    module: 'crm',
  },
  // ── Invoicing ──
  {
    eventType: 'crm.billing_document.created',
    label: 'A quote, estimate or invoice is created',
    module: 'invoicing',
  },
  {
    eventType: 'crm.billing_document.finalized',
    label: 'An invoice is finalised',
    module: 'invoicing',
  },
  {
    eventType: 'crm.billing_document.paid',
    label: 'An invoice is paid in full',
    module: 'invoicing',
  },
  {
    eventType: 'crm.billing_document.converted',
    label: 'A quote is converted to an order',
    module: 'invoicing',
  },
  {
    eventType: 'crm.billing_document.stage_changed',
    label: 'A quote or invoice changes stage',
    module: 'invoicing',
  },
  // ── Wholesale (B2B) ──
  { eventType: 'crm.b2b_account.created', label: 'A wholesale account is created', module: 'b2b' },
  { eventType: 'b2b.order.approved', label: 'A wholesale order is approved', module: 'b2b' },
  { eventType: 'b2b.order.rejected', label: 'A wholesale order is rejected', module: 'b2b' },
  { eventType: 'b2b.invoice.overdue', label: 'A wholesale invoice is overdue', module: 'b2b' },
  {
    eventType: 'b2b.account.credit_hold',
    label: 'A wholesale account goes on credit hold',
    module: 'b2b',
  },
  // ── Email ──
  { eventType: 'email.opened', label: 'A marketing email is opened', module: 'email' },
  { eventType: 'email.clicked', label: 'A link in an email is clicked', module: 'email' },
  { eventType: 'email.bounced', label: 'A marketing email bounces', module: 'email' },
  // Distinct from "a customer replies or writes in" above: THIS one is a reply
  // to something you sent, which is what a follow-up sequence exits on. The
  // other includes cold inbound mail, which a nurture rule must not treat as
  // engagement.
  { eventType: 'email.replied', label: 'Somebody replies to an email you sent', module: 'email' },
  // ── Your team (docs/149) ──
  //
  // The certification one is the reason this group exists. An expiring licence
  // is the module's whole promise — you are told BEFORE it lapses — and the
  // nightly sweep that publishes it (`/internal/staff/certification-reminders`)
  // deliberately does not send mail itself, because who should hear about a
  // forklift ticket differs per business: the person, their supervisor, or a
  // compliance mailbox. That decision belongs to a rule the owner writes, which
  // means the trigger has to be OFFERED here — an event nobody can pick from a
  // list is an event that may as well not be published.
  {
    eventType: 'staff.certification.expiring',
    label: 'Someone’s license or certificate is running out',
    module: 'staff',
  },
  { eventType: 'staff.member.created', label: 'Somebody joins the team', module: 'staff' },
  { eventType: 'staff.timeoff.requested', label: 'Somebody asks for time off', module: 'staff' },
  {
    eventType: 'staff.timeoff.decided',
    label: 'A time-off request is approved or declined',
    module: 'staff',
  },
  { eventType: 'staff.time.approved', label: 'A timesheet is approved', module: 'staff' },
  // ── Money going out (docs/148) ──
  {
    eventType: 'finance.expense.recorded',
    label: 'A cost is recorded',
    module: 'finance',
  },
  {
    eventType: 'finance.accounting.sync.completed',
    label: 'A hand-off to your accounting system finishes',
    module: 'finance',
  },
  // ── Dropshipping ──
  //
  // On a dropship order the supplier's tracking is the ONLY signal that exists —
  // nobody at the business ever touches the goods — so these two are the whole
  // of "where is my order". Both were declared with no publisher until the
  // tracking poll shipped; `getTrackingUpdate()` was implemented by four
  // adapters and called by nothing.
  {
    eventType: 'dropship.order.shipped',
    label: 'A supplier ships a dropship order',
    module: 'dropship',
  },
  {
    eventType: 'dropship.order.delivered',
    label: 'A dropship order is delivered',
    module: 'dropship',
  },
  // ── Social ──
  //
  // `revoked` is somebody UNLINKING an account; `expired` (published by the
  // health sweep) is a grant that broke. A rule that emails "reconnect your
  // account" must fire on the second and not the first.
  {
    eventType: 'social.connection.added',
    label: 'A social account is connected',
    module: 'social',
  },
  {
    eventType: 'social.connection.revoked',
    label: 'A social account is disconnected',
    module: 'social',
  },
  {
    eventType: 'social.connection.expired',
    label: 'A social account needs reconnecting',
    module: 'social',
  },
  // ── Campaigns (docs/151) ──
  //
  // These are what let an automation REACT to a campaign rather than only drive
  // one, and they are the reason the events exist at all. `entered` fires when
  // somebody first tells you who they are, never on a page view — everything
  // above that line is anonymous by design, so there is no person to act on.
  //
  // `abandoned` is the one that earns its keep: it fires because somebody
  // STOPPED, from a nightly sweep with no request behind it, and it is what a
  // recovery follow-up hangs off.
  {
    eventType: 'funnel.entered',
    label: 'Somebody enters a campaign',
    module: 'funnels',
  },
  {
    eventType: 'funnel.converted',
    label: 'Somebody finishes a campaign',
    module: 'funnels',
  },
  {
    eventType: 'funnel.abandoned',
    label: 'Somebody goes quiet in a campaign',
    module: 'funnels',
  },
];

/** A scheduled trigger scans a kind of record on a timer; these are the kinds it
 *  can scan (the registered schedule scanners). */
export interface ScanEntityDef {
  entity: string;
  label: string;
  module: ModuleSlug;
}

export const SCAN_ENTITIES: readonly ScanEntityDef[] = [
  { entity: 'customer', label: 'Customers', module: 'crm' },
  { entity: 'b2b_account', label: 'Wholesale accounts', module: 'b2b' },
  { entity: 'billing_document', label: 'Quotes & invoices', module: 'invoicing' },
  { entity: 'cart', label: 'Abandoned carts', module: 'commerce' },
  // A quote IS a billing document (the b2b-quotes workflow), so it shares the
  // invoicing hue with billing_document above.
  { entity: 'quote', label: 'Quotes awaiting a decision', module: 'invoicing' },
  // No 'chat' module hue exists (the ModuleSlug union has no 'chat'), and chat
  // lives under Customers — so conversations wear the CRM hue.
  { entity: 'conversation', label: 'Chat conversations', module: 'crm' },
];

export function scanEntityLabel(entity: string): string {
  return SCAN_ENTITIES.find((e) => e.entity === entity)?.label ?? entity;
}

export function moduleForScanEntity(entity: string): ModuleSlug {
  return SCAN_ENTITIES.find((e) => e.entity === entity)?.module ?? 'platform';
}

export const SCHEDULE_CADENCES = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'interval', label: 'Every so many minutes' },
  { value: 'once', label: 'Once, at a set time' },
] as const;

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const;

/** Map an event type to the part of the business it belongs to (best-effort, for
 *  the module tags on a row). */
export function moduleForEventType(eventType: string): ModuleSlug {
  if (eventType.startsWith('crm.billing_document.')) return 'invoicing';
  const head = eventType.split('.')[0] ?? '';
  if (
    head === 'order' ||
    head === 'product' ||
    head === 'variant' ||
    head === 'inventory' ||
    head === 'return' ||
    head === 'subscription' ||
    head === 'payment'
  ) {
    return 'commerce';
  }
  if (head === 'crm' || head === 'customer' || head === 'deal') return 'crm';
  if (head === 'commerce') return 'commerce';
  if (head === 'b2b') return 'b2b';
  if (head === 'email') return 'email';
  if (head === 'cms' || head === 'content' || head === 'site' || head === 'form') return 'cms';
  if (head === 'social') return 'social';
  if (head === 'funnel') return 'funnels';
  return 'platform';
}

// ─── conditions ──────────────────────────────────────────────────────────────

export interface ConditionOperatorDef {
  value: ConditionOperator;
  label: string;
  /** Takes no right-hand value (a presence check). */
  valueless?: boolean;
  /** The value is a comma-separated list. */
  list?: boolean;
}

export const CONDITION_OPERATORS: readonly ConditionOperatorDef[] = [
  { value: 'eq', label: 'is exactly' },
  { value: 'neq', label: 'is not' },
  { value: 'gt', label: 'is more than' },
  { value: 'lt', label: 'is less than' },
  { value: 'gte', label: 'is at least' },
  { value: 'lte', label: 'is at most' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'in', label: 'is one of', list: true },
  { value: 'not_in', label: 'is none of', list: true },
  { value: 'is_set', label: 'has any value', valueless: true },
  { value: 'is_not_set', label: 'is empty', valueless: true },
];

export function operatorDef(op: string): ConditionOperatorDef | undefined {
  return CONDITION_OPERATORS.find((o) => o.value === op);
}

/** Curated condition-field suggestions (resolver-exposed paths). Free text. */
export const COMMON_CONDITION_FIELDS: readonly string[] = [
  'customer.type',
  'customer.lifecycleStage',
  'customer.leadStatus',
  'customer.email',
  'customer.totalSpent',
  'customer.lifetimeOrders',
  'customer.tags',
  'deal.stage',
  'deal.value',
  'order.total',
  'order.status',
  'order.itemCount',
  'b2bAccount.status',
  'b2bAccount.hasOverdueInvoices',
  'form.formName',
  'form.pageSlug',
];

// ─── actions ─────────────────────────────────────────────────────────────────

export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'tags'
  | 'email'
  | 'select'
  | 'json'
  /**
   * Pick several from a list the SERVER knows and this file cannot — a tenant's own
   * connected social accounts, for instance. `options` is static config; this is the
   * escape hatch for a choice whose values only exist at runtime, named by
   * {@link ActionConfigField.optionSource}.
   */
  | 'multiselect';

/** Where a `select`/`multiselect` gets its choices. One name per live-data list, so
 *  the form stays declarative and the fetching stays in one place. */
export type ConfigOptionSource = 'social-targets' | 'email-sequences';

export interface ActionConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly { value: string; label: string }[];
  /** For a `multiselect` (pick several) or a `select` (pick one) — which live
   *  list to offer, when the choices only exist at runtime. */
  optionSource?: ConfigOptionSource;
  /** Shown in place of the list when the source has nothing to offer yet. */
  emptyHint?: string;
}

export interface ActionDef {
  type: ActionType;
  label: string;
  module: ModuleSlug;
  description: string;
  /** 'fields' → typed config form; 'json' → raw JSON (union/ID configs the UI
   *  can't safely pick); 'none' → no config; 'branch' → a question plus two
   *  nested step lists, which no key/value form can express (docs/144 §9). */
  mode: 'fields' | 'json' | 'none' | 'branch';
  /** Whether a runtime executor is registered — only available actions are
   *  offered for a NEW step. */
  available: boolean;
  configFields?: readonly ActionConfigField[];
  /** Seed shown in the JSON editor for a fresh 'json'-mode action. */
  jsonTemplate?: Record<string, unknown>;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

const HTTP_METHODS = [
  { value: 'POST', label: 'POST' },
  { value: 'GET', label: 'GET' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
] as const;

export const ACTION_DEFS: readonly ActionDef[] = [
  // ── Control flow ──
  {
    type: 'platform.wait',
    label: 'Wait a while',
    module: 'platform',
    description: 'Pause before the next step — for example, wait a day before following up.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'delaySeconds',
        label: 'Wait for (seconds)',
        type: 'number',
        required: true,
        placeholder: '86400',
        help: 'How long to pause. 3600 is an hour, 86400 is a day.',
      },
    ],
  },
  {
    type: 'platform.stop',
    label: 'Stop here',
    module: 'platform',
    description: 'End the automation early and note why.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'reason', label: 'Reason', type: 'text', placeholder: 'No longer needed' },
    ],
  },
  {
    type: 'platform.if_else',
    label: 'Go one way or the other',
    module: 'platform',
    description:
      'Ask a question about the record, then do one set of things if the answer is yes and another if it is no. Either side can be left empty.',
    // `branch` rather than `fields`: its config holds two whole lists of steps,
    // which is not something a key/value form can express. The editor renders a
    // nested canvas for it (see flow-canvas).
    mode: 'branch',
    available: true,
  },
  {
    type: 'platform.webhook',
    label: 'Send data to another system',
    module: 'platform',
    description: 'POST the details to an outside web address (a webhook).',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'url',
        label: 'Web address',
        type: 'text',
        required: true,
        placeholder: 'https://example.com/hook',
      },
      { key: 'method', label: 'Method', type: 'select', options: HTTP_METHODS },
      {
        key: 'headers',
        label: 'Extra headers',
        type: 'json',
        help: 'Advanced — a set of header name → value pairs, as JSON.',
      },
      {
        key: 'payload',
        label: 'Extra data',
        type: 'json',
        help: 'Advanced — any extra data to include, as JSON.',
      },
    ],
  },
  {
    type: 'platform.notify',
    label: 'Notify the team in-app',
    module: 'platform',
    description: 'Post a notification your team sees inside the workbench.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'title', label: 'Heading', type: 'text', required: true },
      { key: 'body', label: 'Message', type: 'textarea' },
    ],
  },
  // ── Customers (CRM) ──
  {
    type: 'crm.add_tag',
    label: 'Add a label to the customer',
    module: 'crm',
    description: 'Tag the customer this rule is about with one or more labels.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'tags', label: 'Labels', type: 'tags', required: true, placeholder: 'vip, repeat' },
    ],
  },
  {
    type: 'crm.remove_tag',
    label: 'Remove a label from the customer',
    module: 'crm',
    description: 'Take one or more labels off the customer this rule is about.',
    mode: 'fields',
    available: true,
    configFields: [{ key: 'tags', label: 'Labels', type: 'tags', required: true }],
  },
  {
    type: 'crm.add_note',
    label: 'Add a note to the customer',
    module: 'crm',
    description: 'Record a note on the customer this rule is about.',
    mode: 'fields',
    available: true,
    configFields: [{ key: 'note', label: 'Note', type: 'textarea', required: true }],
  },
  {
    type: 'crm.update_field',
    label: 'Change a detail on the customer',
    module: 'crm',
    description: 'Set a single field on the customer this rule is about.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'field', label: 'Which detail', type: 'text', required: true, placeholder: 'type' },
      {
        key: 'value',
        label: 'New value',
        type: 'json',
        required: true,
        help: 'The value to set, as JSON (e.g. "wholesale" or 5).',
      },
    ],
  },
  {
    type: 'crm.create_task',
    label: 'Create a task',
    module: 'crm',
    description: 'Open a follow-up task, linked to the customer or deal this rule is about.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'description', label: 'Details', type: 'textarea' },
      { key: 'dueInDays', label: 'Due in (days)', type: 'number', placeholder: '3' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
      {
        key: 'assignedToUserId',
        label: 'Assign to (team member ID)',
        type: 'text',
        required: true,
        help: 'The ID of the team member who owns this task.',
      },
    ],
  },
  {
    type: 'crm.update_deal_stage',
    label: 'Move the sales deal',
    module: 'crm',
    description: 'Move the deal this rule is about to a pipeline stage.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'toStageId',
        label: 'To stage (stage ID)',
        type: 'text',
        required: true,
        help: 'The ID of the pipeline stage to move the deal into.',
      },
    ],
  },
  {
    type: 'crm.create_ticket',
    label: 'Open a support request',
    module: 'crm',
    description:
      'Turn whatever started this rule — a live chat, a form, an email someone sent you — into a support request in your queue, with a response time attached. Runs once per conversation, so a rule that fires twice will not open two requests.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'subject',
        label: 'Subject',
        type: 'text',
        help: 'Leave blank and we will name it from where it came in — the form name, the email subject, or the customer’s name.',
      },
      {
        key: 'description',
        label: 'Details',
        type: 'textarea',
        help: 'Leave blank to use what they actually wrote.',
      },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
      {
        key: 'assignedToUserId',
        label: 'Assign to (team member ID)',
        type: 'text',
        help: 'Leave blank to put it in the unassigned queue for whoever picks it up first.',
      },
    ],
  },
  // ── Workflow depth (docs/144 §9) ──
  {
    type: 'crm.create_record',
    label: 'Create a record',
    module: 'crm',
    description:
      'Add a new customer, a new sales deal, or a row of anything else you track. Whatever it creates gets linked to the record that started this rule, so you can find it later.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'objectKey',
        label: 'What kind of record',
        type: 'text',
        required: true,
        placeholder: 'deal',
        help: 'Use “contact” for a person, “deal” for a sales opportunity, or the name of something you set up yourself.',
      },
      {
        key: 'title',
        label: 'Name it',
        type: 'text',
        placeholder: 'Renewal — {{customer.company}}',
        help: 'You can pull details in with {{ }} — they get filled in when the rule runs.',
      },
      {
        key: 'values',
        label: 'Fill in these details',
        type: 'json',
        help: 'Advanced — the fields to set, as JSON. For example {"value": 500}.',
      },
    ],
  },
  {
    type: 'crm.set_property',
    label: 'Set a detail on the record',
    module: 'crm',
    description:
      'Change one thing about whoever (or whatever) started this rule — including the details you set up yourself, like a renewal date or a warranty expiry.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'target',
        label: 'On which record',
        type: 'select',
        options: [
          { value: 'contact', label: 'The customer' },
          { value: 'deal', label: 'The sales deal' },
          { value: 'record', label: 'The record' },
        ],
      },
      { key: 'property', label: 'Which detail', type: 'text', required: true },
      { key: 'value', label: 'Set it to', type: 'text', required: true },
      {
        key: 'custom',
        label: 'This is a detail I set up myself',
        type: 'select',
        options: [
          { value: 'true', label: 'Yes — one of my own' },
          { value: 'false', label: 'No — a built-in field' },
        ],
        help: productCopy(
          'automations.field.ownHint',
          'Leave as “one of my own” unless you are changing something Piggles ships with, like the lifecycle stage.'
        ),
      },
    ],
  },
  {
    type: 'crm.rotate_owner',
    label: 'Share it out among the team',
    module: 'crm',
    description:
      'Hand the record to whoever on your team currently has the least on. Leave the list blank to include everybody.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'target',
        label: 'What to hand out',
        type: 'select',
        options: [
          { value: 'deal', label: 'The sales deal' },
          { value: 'contact', label: 'The customer' },
        ],
      },
      {
        key: 'userIds',
        label: 'Share between (team member IDs)',
        type: 'tags',
        help: 'Leave blank to share between everyone on your team.',
      },
    ],
  },
  {
    type: 'crm.add_to_list',
    label: 'Put them on a list',
    module: 'crm',
    description:
      'Add the customer to one of your hand-picked lists — or take them off it. Only works on hand-picked lists; a list that decides its own members from rules will not accept it.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'segmentId', label: 'Which list', type: 'text', required: true },
      {
        key: 'remove',
        label: 'Add or remove',
        type: 'select',
        options: [
          { value: 'false', label: 'Put them on it' },
          { value: 'true', label: 'Take them off it' },
        ],
      },
    ],
  },
  {
    type: 'engagement.send_email',
    label: 'Write to them personally',
    module: 'crm',
    description:
      'Send one email to one person, threaded onto their conversation so it shows up on their timeline. Respects anyone who has asked not to be contacted. For emailing a whole audience, use a campaign instead.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      {
        key: 'bodyHtml',
        label: 'Message',
        type: 'textarea',
        required: true,
        help: 'You can pull in details with {{ }} — for example Hi {{customer.firstName}}.',
      },
    ],
  },
  {
    type: 'voice.log_call_task',
    label: 'Add a call-back to somebody’s list',
    module: 'crm',
    description:
      'Create a task to call the customer back, and note on their record why it came up. Does not place the call.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'title', label: 'What to say it is', type: 'text', placeholder: 'Call them back' },
      { key: 'description', label: 'Notes', type: 'textarea' },
      {
        key: 'dueInDays',
        label: 'Due in (days)',
        type: 'number',
        placeholder: '0',
        help: '0 means today.',
      },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
    ],
  },
  {
    type: 'crm.capture_lead',
    label: 'Save the form contact as a customer',
    module: 'crm',
    description:
      'Save whoever submitted a form as a customer and log their message — and, if the form is set to, open a sales deal. Follows the form’s own settings.',
    mode: 'none',
    available: true,
  },
  // ── Site forms ──
  {
    type: 'form.notify',
    label: 'Email me the form submission',
    module: 'cms',
    description:
      'Email you (and any recipients set on the form) when it is submitted. Follows the form’s “email me” setting.',
    mode: 'none',
    available: true,
  },
  {
    type: 'form.autoreply',
    label: 'Send the visitor a confirmation',
    module: 'cms',
    description:
      'Send the person who submitted the form a confirmation reply. Follows the form’s “send a confirmation” setting.',
    mode: 'none',
    available: true,
  },
  // ── Email ──
  {
    type: 'email.send_campaign',
    label: 'Send a marketing email',
    module: 'email',
    description: 'Send the customer a designed email or coded template.',
    mode: 'json',
    available: true,
    jsonTemplate: { builderEmailId: '', subject: '' },
  },
  {
    type: 'email.send_internal',
    label: 'Email a note to staff',
    module: 'email',
    description: 'Email one of your own team members.',
    mode: 'fields',
    available: true,
    configFields: [
      { key: 'to', label: 'To', type: 'email', required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'text', label: 'Message', type: 'textarea', help: 'A plain-text and/or HTML body.' },
      { key: 'html', label: 'HTML body (optional)', type: 'textarea' },
    ],
  },
  {
    type: 'email.sequence_add',
    label: 'Add to an email sequence',
    module: 'email',
    description:
      'Start the customer on a multi-touch email sequence — a welcome series, a follow-up, a nurture. The sequence sends each email on its own schedule.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'sequenceId',
        label: 'Which sequence',
        type: 'select',
        required: true,
        optionSource: 'email-sequences',
        help: 'Which sequence to start them on.',
        emptyHint: 'No sequences yet — create one under Email → Sequences.',
      },
    ],
  },
  {
    type: 'email.sequence_remove',
    label: 'Remove from an email sequence',
    module: 'email',
    description:
      'Take the customer out of an email sequence, so they stop getting the rest of its emails.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'sequenceId',
        label: 'Which sequence',
        type: 'select',
        required: true,
        optionSource: 'email-sequences',
        help: 'Which sequence to take them out of.',
        emptyHint: 'No sequences yet — create one under Email → Sequences.',
      },
    ],
  },
  // ── Wholesale (B2B) ──
  {
    type: 'b2b.escalate_overdue',
    label: 'Chase an overdue wholesale account',
    module: 'b2b',
    description: 'Run the overdue-account ladder (credit hold, then suspend) on the account.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'creditHoldDays',
        label: 'Credit hold after (days)',
        type: 'number',
        placeholder: '14',
      },
      { key: 'suspendDays', label: 'Suspend after (days)', type: 'number', placeholder: '30' },
    ],
  },
  {
    type: 'b2b.create_quote',
    label: 'Create a wholesale quote',
    module: 'b2b',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  {
    type: 'b2b.convert_quote',
    label: 'Convert a wholesale quote',
    module: 'b2b',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  {
    type: 'b2b.update_terms',
    label: 'Update wholesale terms',
    module: 'b2b',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  // ── Social posts ──
  {
    type: 'social.post',
    label: 'Post to social media',
    module: 'social',
    description:
      'Drafts a post to your connected social accounts. By default it lands in your Approvals inbox to review first; you can also set it to post automatically.',
    mode: 'fields',
    available: true,
    configFields: [
      {
        key: 'template',
        label: 'Message',
        type: 'textarea',
        required: true,
        placeholder: 'New arrival — {{announce.title}}',
        help: 'The post text. Use {{announce.title}} for the product or article name; the link and image are attached for you.',
      },
      {
        key: 'targetIds',
        label: 'Which accounts',
        type: 'multiselect',
        optionSource: 'social-targets',
        help: 'Leave everything unticked to post to all your connected accounts. Tick some to narrow this automation to just those.',
        emptyHint:
          'No connected accounts yet — connect one under Social → Connections and they will appear here.',
      },
      {
        key: 'autoApprove',
        label: 'Before it goes out',
        type: 'select',
        options: [
          { value: '', label: 'Send to my Approvals inbox to review first' },
          { value: 'auto', label: 'Post automatically, no review' },
        ],
        help: 'Reviewing first is recommended until you trust the drafts.',
      },
    ],
  },
  // ── Selling (Commerce — deferred) ──
  {
    type: 'commerce.create_invoice',
    label: 'Create an invoice',
    module: 'commerce',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  {
    type: 'commerce.apply_discount',
    label: 'Apply a discount',
    module: 'commerce',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  {
    type: 'commerce.update_inventory',
    label: 'Adjust stock',
    module: 'commerce',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  {
    type: 'commerce.create_order',
    label: 'Create an order',
    module: 'commerce',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
  {
    type: 'inventory.draft_reorder_po',
    label: 'Draft a restock order',
    module: 'commerce',
    description: 'Not available yet.',
    mode: 'json',
    available: false,
  },
];

export function actionDef(type: string): ActionDef | undefined {
  return ACTION_DEFS.find((a) => a.type === type);
}

export function actionLabel(type: string): string {
  return actionDef(type)?.label ?? type;
}

export function moduleForActionType(type: string): ModuleSlug {
  const head = type.split('.')[0] ?? '';
  if (head === 'form') return 'cms';
  if (head === 'inventory') return 'commerce';
  const def = actionDef(type);
  if (def) return def.module;
  return (head as ModuleSlug) || 'platform';
}

/** Actions offerable for a NEW step: has an executor, and its module is active
 *  (platform actions are always offered). */
export function availableActions(enabledModules: readonly string[]): ActionDef[] {
  const active = new Set(enabledModules);
  return ACTION_DEFS.filter(
    (a) => a.available && (a.module === 'platform' || active.has(a.module))
  );
}

// ─── module derivation for a rule row ────────────────────────────────────────

interface ParsedTriggerLite {
  triggerType: string;
  triggerConfig: unknown;
}

/** The distinct parts of the business a rule touches (drops 'platform' — a wait
 *  or a webhook doesn't tag a module). Feeds the row's "Customers + Email" tags. */
export function deriveModules(
  trigger: ParsedTriggerLite,
  actions: readonly { type: string }[]
): ModuleSlug[] {
  const set = new Set<ModuleSlug>();
  if (trigger.triggerType.startsWith('schedule.')) {
    const cfg = (trigger.triggerConfig ?? {}) as { predicate?: { entity?: string } };
    if (cfg.predicate?.entity) set.add(moduleForScanEntity(cfg.predicate.entity));
  } else {
    set.add(moduleForEventType(trigger.triggerType));
  }
  for (const a of actions) set.add(moduleForActionType(a.type));
  set.delete('platform');
  return [...set];
}
