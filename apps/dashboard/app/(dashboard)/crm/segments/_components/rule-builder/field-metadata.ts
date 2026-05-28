// Visual rule-builder metadata.
//
// Mirrors @sparx/crm-schemas/segment-rule.ts — adding a new field here
// without updating the schema (or vice versa) is a bug. The grouping +
// per-field type drives which operators we offer in the leaf-row UI.

import type { SegmentField, SegmentOperator } from '@sparx/crm-schemas';

export type FieldKind = 'enum' | 'string' | 'number' | 'boolean' | 'datetime' | 'array' | 'uuid';

export interface FieldDef {
  field: SegmentField;
  label: string;
  group: 'Customer' | 'B2B account' | 'Email engagement';
  kind: FieldKind;
  /** For 'enum' fields, the allowed literal values surfaced as a select. */
  enumValues?: readonly string[];
}

export const FIELDS: readonly FieldDef[] = [
  { field: 'customer.type', label: 'Type', group: 'Customer', kind: 'enum', enumValues: ['prospect', 'retail', 'b2b'] },
  { field: 'customer.email', label: 'Email', group: 'Customer', kind: 'string' },
  { field: 'customer.tags', label: 'Tags', group: 'Customer', kind: 'array' },
  { field: 'customer.company', label: 'Company', group: 'Customer', kind: 'string' },
  { field: 'customer.createdAt', label: 'Created at', group: 'Customer', kind: 'datetime' },
  { field: 'customer.totalSpent', label: 'Lifetime spend', group: 'Customer', kind: 'number' },
  { field: 'customer.orderCount', label: 'Order count', group: 'Customer', kind: 'number' },
  { field: 'customer.firstOrderAt', label: 'First order at', group: 'Customer', kind: 'datetime' },
  { field: 'customer.lastOrderAt', label: 'Last order at', group: 'Customer', kind: 'datetime' },
  { field: 'customer.daysSinceLastOrder', label: 'Days since last order', group: 'Customer', kind: 'number' },
  { field: 'customer.assignedRepId', label: 'Assigned rep', group: 'Customer', kind: 'uuid' },
  { field: 'customer.doNotContact', label: 'Do-not-contact', group: 'Customer', kind: 'boolean' },
  { field: 'customer.b2bAccountId', label: 'B2B account', group: 'Customer', kind: 'uuid' },
  { field: 'b2bAccount.pricingTier', label: 'Pricing tier', group: 'B2B account', kind: 'string' },
  { field: 'b2bAccount.creditUtilization', label: 'Credit utilization', group: 'B2B account', kind: 'number' },
  { field: 'b2bAccount.fleetSize', label: 'Fleet size', group: 'B2B account', kind: 'number' },
  { field: 'b2bAccount.status', label: 'Status', group: 'B2B account', kind: 'enum', enumValues: ['active', 'credit_hold', 'suspended', 'inactive'] },
  { field: 'b2bAccount.paymentTerms', label: 'Payment terms', group: 'B2B account', kind: 'string' },
  { field: 'email.openedLast30d', label: 'Opens (last 30d)', group: 'Email engagement', kind: 'number' },
  { field: 'email.clickedLast30d', label: 'Clicks (last 30d)', group: 'Email engagement', kind: 'number' },
  { field: 'email.unsubscribed', label: 'Unsubscribed', group: 'Email engagement', kind: 'boolean' },
] as const;

export const FIELD_INDEX: Record<SegmentField, FieldDef> = FIELDS.reduce(
  (acc, def) => {
    acc[def.field] = def;
    return acc;
  },
  {} as Record<SegmentField, FieldDef>
);

/** Operators we surface for each field kind. The schema accepts the full
 *  union; the UI hides the ones that make no sense (e.g. `between` on a
 *  boolean) to reduce footguns. */
export function operatorsFor(kind: FieldKind): SegmentOperator[] {
  switch (kind) {
    case 'boolean':
      return ['eq', 'neq', 'is_null', 'is_not_null'];
    case 'number':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'is_null', 'is_not_null'];
    case 'datetime':
      return ['gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'];
    case 'array':
      return ['contains', 'not_contains', 'is_null', 'is_not_null'];
    case 'enum':
      return ['eq', 'neq', 'in', 'not_in'];
    case 'uuid':
      return ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null'];
    case 'string':
    default:
      return ['eq', 'neq', 'contains', 'not_contains', 'in', 'not_in', 'is_null', 'is_not_null'];
  }
}

export const OPERATOR_LABELS: Record<SegmentOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is one of',
  not_in: 'is none of',
  contains: 'contains',
  not_contains: 'does not contain',
  is_null: 'is empty',
  is_not_null: 'is set',
  between: 'is between',
};
