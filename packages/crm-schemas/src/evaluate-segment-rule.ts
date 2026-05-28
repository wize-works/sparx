// evaluateSegmentRule — pure boolean evaluation of a SegmentRule tree
// against a CustomerProjection. Used by:
//   • the segment-evaluator consumer (incremental segment_members updates)
//   • segmentService.previewCount (rule-editor preview count)
//   • segmentService.recomputeFull (nightly safety-net batch)
//
// Same function, three callers — no rule-evaluation drift between dashboard
// preview and production materialization.

import type { PredicateLeaf, SegmentField, SegmentOperator, SegmentRule } from './segment-rule';

// Projection is typed loosely here so the evaluator stays a pure JS function
// — the Zod schema lives next to the field whitelist in segment-rule.ts.
// In practice the consumer passes the typed projection from the schema; the
// `unknown` boundary is just so we don't have a circular dep at import time.
export interface RuleProjection {
  customer: Record<string, unknown>;
  b2bAccount: Record<string, unknown> | null;
  email: Record<string, unknown>;
}

export function evaluateSegmentRule(rule: SegmentRule, projection: RuleProjection): boolean {
  switch (rule.kind) {
    case 'predicate':
      return evaluatePredicate(rule, projection);
    case 'and':
      return rule.children.every((c) => evaluateSegmentRule(c, projection));
    case 'or':
      return rule.children.some((c) => evaluateSegmentRule(c, projection));
    case 'not':
      return !evaluateSegmentRule(rule.child, projection);
    default: {
      // Exhaustiveness check — any new rule kind landing without an
      // evaluator branch fails at type-check time, not at runtime.
      const _exhaustive: never = rule;
      void _exhaustive;
      return false;
    }
  }
}

function evaluatePredicate(leaf: PredicateLeaf, projection: RuleProjection): boolean {
  const fieldValue = readField(leaf.field, projection);
  return applyOperator(leaf.op, fieldValue, leaf.value);
}

/** Walk the dotted path (e.g. `customer.totalSpent`) into the projection. */
function readField(field: SegmentField, projection: RuleProjection): unknown {
  const [root, key] = field.split('.') as [keyof RuleProjection, string];
  const obj = projection[root];
  if (obj == null) return null;
  return (obj as Record<string, unknown>)[key];
}

function applyOperator(op: SegmentOperator, fieldValue: unknown, ruleValue: unknown): boolean {
  switch (op) {
    case 'eq':
      return looseEqual(fieldValue, ruleValue);
    case 'neq':
      return !looseEqual(fieldValue, ruleValue);
    case 'gt':
      return cmpNumber(fieldValue, ruleValue, (a, b) => a > b);
    case 'gte':
      return cmpNumber(fieldValue, ruleValue, (a, b) => a >= b);
    case 'lt':
      return cmpNumber(fieldValue, ruleValue, (a, b) => a < b);
    case 'lte':
      return cmpNumber(fieldValue, ruleValue, (a, b) => a <= b);
    case 'in':
      return Array.isArray(ruleValue) && ruleValue.some((v) => looseEqual(fieldValue, v));
    case 'not_in':
      return Array.isArray(ruleValue) && !ruleValue.some((v) => looseEqual(fieldValue, v));
    case 'contains': {
      // Two interpretations: text substring vs array-contains-element.
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) => looseEqual(v, ruleValue));
      }
      if (typeof fieldValue === 'string' && typeof ruleValue === 'string') {
        return fieldValue.toLowerCase().includes(ruleValue.toLowerCase());
      }
      return false;
    }
    case 'not_contains': {
      if (Array.isArray(fieldValue)) {
        return !fieldValue.some((v) => looseEqual(v, ruleValue));
      }
      if (typeof fieldValue === 'string' && typeof ruleValue === 'string') {
        return !fieldValue.toLowerCase().includes(ruleValue.toLowerCase());
      }
      return true; // Field isn't a string/array — treat as not-contains.
    }
    case 'is_null':
      return fieldValue == null;
    case 'is_not_null':
      return fieldValue != null;
    case 'between': {
      if (!Array.isArray(ruleValue) || ruleValue.length !== 2) return false;
      const [min, max] = ruleValue;
      return (
        cmpNumber(fieldValue, min, (a, b) => a >= b) && cmpNumber(fieldValue, max, (a, b) => a <= b)
      );
    }
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return false;
    }
  }
}

/** Loose equality across the JSON types: strings, numbers, booleans, null.
 *  Dates are compared as their ISO string forms. */
function looseEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date) return a.toISOString() === b;
  if (b instanceof Date) return b.toISOString() === a;
  return a === b;
}

/** Compare two values as numbers under the given comparator. Returns false
 *  if either side can't be coerced to a finite number. */
function cmpNumber(a: unknown, b: unknown, op: (a: number, b: number) => boolean): boolean {
  const na = typeof a === 'number' ? a : a instanceof Date ? a.getTime() : Number(a);
  const nb = typeof b === 'number' ? b : b instanceof Date ? b.getTime() : Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return op(na, nb);
}
