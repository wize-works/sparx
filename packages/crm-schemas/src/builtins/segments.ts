// Built-in CRM segment templates (docs/11 §3, locked decision #4).
//
// Seeded per-tenant on CRM module activation by the bootstrap consumer in
// @sparx/crm. Each tenant gets their own editable copy (same pattern as
// the default pipeline template) — so a merchant can rename "High Value"
// to "VIP" or tweak the threshold without touching the platform-wide
// definition.
//
// isSystem=true marks the seeded rows. The dashboard renders system
// segments as cloneable but not deletable; the merchant can clone+edit
// to make their own version. Adding a new built-in here flows through to
// every new tenant; existing tenants pick it up on next activation
// (which is a no-op unless the segment slug doesn't exist yet).

import type { SegmentRule } from '../segment-rule';

export interface SegmentTemplate {
  name: string;
  slug: string;
  description: string;
  color: string;
  rules: SegmentRule;
}

const HIGH_VALUE: SegmentTemplate = {
  name: 'High Value',
  slug: 'high-value',
  description: 'Customers with lifetime spend over $5,000.',
  color: '#6366F1',
  rules: {
    kind: 'predicate',
    field: 'customer.totalSpent',
    op: 'gte',
    value: 5000,
  },
};

const AT_RISK: SegmentTemplate = {
  name: 'At Risk',
  slug: 'at-risk',
  description: 'Customers who ordered before but have gone quiet for 90+ days.',
  color: '#EF4444',
  rules: {
    kind: 'and',
    children: [
      { kind: 'predicate', field: 'customer.orderCount', op: 'gte', value: 1 },
      { kind: 'predicate', field: 'customer.daysSinceLastOrder', op: 'gte', value: 90 },
      { kind: 'predicate', field: 'customer.doNotContact', op: 'eq', value: false },
    ],
  },
};

const B2B_FLEET: SegmentTemplate = {
  name: 'B2B Fleet',
  slug: 'b2b-fleet',
  description: 'B2B accounts with a fleet — primary target for parts cross-sell.',
  color: '#0EA5E9',
  rules: {
    kind: 'and',
    children: [
      { kind: 'predicate', field: 'customer.type', op: 'eq', value: 'b2b' },
      { kind: 'predicate', field: 'b2bAccount.fleetSize', op: 'gte', value: 1 },
      { kind: 'predicate', field: 'b2bAccount.status', op: 'eq', value: 'active' },
    ],
  },
};

const NEW_CUSTOMERS: SegmentTemplate = {
  name: 'New Customers',
  slug: 'new-customers',
  description: 'Created in the last 30 days, regardless of order activity.',
  color: '#10B981',
  rules: {
    kind: 'predicate',
    field: 'customer.daysSinceLastOrder',
    op: 'lte',
    value: 30,
  },
};

export const BUILT_IN_SEGMENT_TEMPLATES: readonly SegmentTemplate[] = [
  HIGH_VALUE,
  AT_RISK,
  B2B_FLEET,
  NEW_CUSTOMERS,
];
