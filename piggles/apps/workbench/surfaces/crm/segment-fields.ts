'use client';

// THE FIELD VOCABULARY — what a segment rule can ask about, and in whose words.
//
// Each field carries the label a shop owner reads, the card it is grouped under,
// and the KIND of value it takes. The kind is the hinge: it picks the operator
// set (./segment-operators) and the value control the builder renders.
//
// The field names come from `SegmentField` in `@wizeworks/crm-schemas` — the same
// Zod the server evaluates against, so the builder cannot offer one it rejects.

import type {
  PredicateLeaf,
  SegmentField,
  SegmentFieldPath,
  SegmentOperator,
  SegmentRule,
} from '@wizeworks/crm-schemas';
import { FIELD_META } from './segment-field-meta';

// The REAL shared types, re-exported so the rest of the surface has one place to
// reach for them — never a local copy.
export type { PredicateLeaf, SegmentField, SegmentFieldPath, SegmentOperator, SegmentRule };

/** How a field's value is entered, which drives the operator set and the value
 *  control. `rep`/`account` are uuid fields backed by a live picker. */
export type ValueKind =
  'enum' | 'text' | 'number' | 'date' | 'boolean' | 'tags' | 'rep' | 'account';

export interface FieldMeta {
  label: string;
  /** Which card the field is grouped under in the picker. Open, not a union:
   *  a tenant-declared property group is named after the business's own record
   *  type, which cannot be known here (docs/144 §3.4). */
  group: string;
  kind: ValueKind;
  /** For `enum` fields — the allowed values and their plain labels. */
  options?: { value: string; label: string }[];
  /** One line under the value control. */
  hint?: string;
}

/** Total accessor for {@link FIELD_META}. The map has an entry for every
 *  `SegmentField`, so this always resolves — wrapping the lookup here keeps that
 *  guarantee in one place and hands callers a `FieldMeta`, not the
 *  `FieldMeta | undefined` a bare `FIELD_META[field]` widens to across a module
 *  boundary under `noUncheckedIndexedAccess`. */
export function fieldMeta(field: SegmentFieldPath, custom: CustomFieldIndex = {}): FieldMeta {
  // A tenant-declared property (docs/144 §3.4). It cannot be in the map above —
  // it did not exist when this file was written — so its metadata is derived
  // from the object's own schema, and falls back to a readable label if the
  // property has since been removed (an old rule must still RENDER).
  if (field.startsWith('custom.')) {
    const [, objectKey = '', propertyKey = ''] = field.split('.');
    const declared = custom[objectKey]?.find((f) => f.key === propertyKey);
    return {
      label: declared?.label ?? propertyKey,
      group: CUSTOM_GROUP_LABELS[objectKey] ?? 'Extra details',
      kind: declared ? valueKindFor(declared.type) : 'text',
      hint: declared?.helpText,
    };
  }
  return FIELD_META[field as SegmentField];
}

/** Tenant-declared property fields, by object key, as the builder knows them. */
export type CustomFieldIndex = Record<
  string,
  { key: string; label: string; type: string; helpText?: string }[]
>;

const CUSTOM_GROUP_LABELS: Record<string, string> = {
  contact: 'Your customer details',
  company: 'Your company details',
  deal: 'Your deal details',
};

/** Map a field-engine type onto the builder's value kinds. */
function valueKindFor(type: string): ValueKind {
  switch (type) {
    case 'number':
    case 'currency':
    case 'calculated':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'date';
    case 'enum':
      return 'text';
    case 'user':
      return 'rep';
    default:
      return 'text';
  }
}

/**
 * The fields the builder OFFERS, grouped for the picker. Date fields ("date
 * added", "first / last order date") compare by timestamp now that the server
 * evaluator's `toComparable` handles ISO strings, so a "last order before X"
 * rule matches correctly — recency can be expressed either as a date or as the
 * numeric "days since last order".
 */
export const OFFERED_FIELDS: SegmentField[] = [
  'customer.type',
  'customer.tags',
  'customer.email',
  'customer.company',
  'customer.totalSpent',
  'customer.orderCount',
  'customer.daysSinceLastOrder',
  'customer.lastOrderAt',
  'customer.firstOrderAt',
  'customer.daysSinceCreated',
  'customer.createdAt',
  'customer.assignedRepId',
  'customer.doNotContact',
  'customer.b2bAccountId',
  'b2bAccount.status',
  'b2bAccount.pricingTier',
  'b2bAccount.paymentTerms',
  'b2bAccount.fleetSize',
  'b2bAccount.creditUtilization',
  'email.subscribed',
  'email.unsubscribed',
  'email.openedLast30d',
  'email.clickedLast30d',
];

/** The field picker's items, always including `current` even when it is a field
 *  the builder does not otherwise offer (a stored date rule, say), so loading
 *  never drops a condition. Grouped by area, offered fields first. */
export function fieldOptionsIncluding(
  current: SegmentFieldPath,
  custom: CustomFieldIndex = {}
): { value: string; label: string }[] {
  // Every tenant-declared property, offered alongside the built-in ones — a
  // property you cannot filter on is a text box, not a property (docs/144 §3.4).
  const customPaths: SegmentFieldPath[] = Object.entries(custom).flatMap(([objectKey, fields]) =>
    fields
      // A calculated property is a real number and filters fine; an asset or a
      // repeater has no sensible comparison, so it is not offered.
      .filter((f) => !['asset', 'object', 'repeater', 'rich_text'].includes(f.type))
      .map((f) => `custom.${objectKey}.${f.key}`)
  );

  const all: SegmentFieldPath[] = [...OFFERED_FIELDS, ...customPaths];
  const fields = all.includes(current) ? all : [...all, current];
  return fields.map((f) => {
    const meta = fieldMeta(f, custom);
    return { value: f, label: `${meta.group} · ${meta.label}` };
  });
}
