// Re-export the rule shape from the schema package so consumers don't reach
// past the rule-builder barrel for the same type. Also a few helpers for
// constructing fresh nodes.

import type { SegmentField, SegmentOperator, SegmentRule } from '@sparx/crm-schemas';
import { FIELD_INDEX, operatorsFor } from './field-metadata';

export type Rule = SegmentRule;
export type GroupKind = 'and' | 'or';

const DEFAULT_FIELD: SegmentField = 'customer.totalSpent';

export function emptyPredicate(): Rule {
  return { kind: 'predicate', field: DEFAULT_FIELD, op: 'gte', value: 0 };
}

export function emptyGroup(kind: GroupKind): Rule {
  return { kind, children: [emptyPredicate()] };
}

export function emptyNot(): Rule {
  return { kind: 'not', child: emptyPredicate() };
}

/** Default operator for a freshly-selected field — pick the first one we'd
 *  surface in the UI so the row is in a usable state immediately. */
export function defaultOperatorFor(field: SegmentField): SegmentOperator {
  const def = FIELD_INDEX[field];
  const ops = operatorsFor(def.kind);
  return ops[0] ?? 'eq';
}

/** Operators that don't take a value (is_null / is_not_null). The UI hides
 *  the value input for these. */
export function opTakesValue(op: SegmentOperator): boolean {
  return op !== 'is_null' && op !== 'is_not_null';
}

/** `between` and the `in` / `not_in` operators take an array on the wire. */
export function opTakesArray(op: SegmentOperator): boolean {
  return op === 'in' || op === 'not_in' || op === 'between';
}
