// Segment rule shape — the predicate tree stored in segments.rules JSONB.
//
// A rule is a recursive boolean tree: AND, OR, NOT nodes wrap children;
// leaf predicates compare a CustomerProjection field against a value. The
// evaluator (Phase 4) is a pure function over (rule, projection) — that
// same function is used both at email-broadcast time (preview count) and
// inside the segment-evaluator Pub/Sub consumer (incremental updates into
// segment_members). See locked decision #4.
//
// Phase 1 ships only the shape; the evaluator lands with Phase 4 and lives
// here so its type signature stays load-bearing across consumers.

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────
// Leaf predicate
// ─────────────────────────────────────────────────────────────────────────
// Fields are addressed by a dotted path into the CustomerProjection
// produced by segmentService.buildProjection(). Restricting the set of
// allowed fields here lets the projection builder be the gatekeeper for
// what segment rules can read — adding a new field is a one-place change.

export const SegmentField = z.enum([
  'customer.type',
  'customer.email',
  'customer.tags',
  'customer.company',
  'customer.createdAt',
  'customer.totalSpent',
  'customer.orderCount',
  'customer.firstOrderAt',
  'customer.lastOrderAt',
  'customer.daysSinceLastOrder',
  'customer.assignedRepId',
  'customer.doNotContact',
  'customer.b2bAccountId',
  'b2bAccount.pricingTier',
  'b2bAccount.creditUtilization',
  'b2bAccount.fleetSize',
  'b2bAccount.status',
  'b2bAccount.paymentTerms',
  'email.openedLast30d',
  'email.clickedLast30d',
  'email.unsubscribed',
]);
export type SegmentField = z.infer<typeof SegmentField>;

export const SegmentOperator = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'contains', // text-field substring or array contains-element
  'not_contains',
  'is_null',
  'is_not_null',
  'between', // value is [min, max]
]);
export type SegmentOperator = z.infer<typeof SegmentOperator>;

// JSON-serializable literal — anything that survives JSONB round-trip.
const Literal = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const LiteralArray = z.array(Literal);

const PredicateLeaf = z.object({
  kind: z.literal('predicate'),
  field: SegmentField,
  op: SegmentOperator,
  value: z.union([Literal, LiteralArray]).optional(),
});
export type PredicateLeaf = z.infer<typeof PredicateLeaf>;

// ─────────────────────────────────────────────────────────────────────────
// Recursive AND/OR/NOT tree
// ─────────────────────────────────────────────────────────────────────────
// Zod 4: declare the TS type up front, then use z.lazy in the union for the
// branches that recurse. discriminatedUnion does not compose with z.lazy in
// Zod 4 (same constraint cms-schemas hit) — z.union works fine because each
// branch is uniquely discriminated by `kind`.

export type SegmentRule =
  | PredicateLeaf
  | { kind: 'and'; children: SegmentRule[] }
  | { kind: 'or'; children: SegmentRule[] }
  | { kind: 'not'; child: SegmentRule };

const And = z.lazy(() =>
  z.object({
    kind: z.literal('and'),
    children: z.array(SegmentRuleSchema).min(1).max(20),
  })
);

const Or = z.lazy(() =>
  z.object({
    kind: z.literal('or'),
    children: z.array(SegmentRuleSchema).min(1).max(20),
  })
);

const Not = z.lazy(() =>
  z.object({
    kind: z.literal('not'),
    child: SegmentRuleSchema,
  })
);

export const SegmentRuleSchema: z.ZodType<SegmentRule> = z.lazy(() =>
  z.union([PredicateLeaf, And, Or, Not])
);

// ─────────────────────────────────────────────────────────────────────────
// CustomerProjection
// ─────────────────────────────────────────────────────────────────────────
// The flat view a segment rule reads. Built by segmentService.buildProjection
// from one tenant-scoped query and cached briefly per evaluation. Phase 4
// implements the builder; Phase 1 ships the shape so consumers (the rule
// editor's autocomplete, the safety-net batch worker) know what to expect.

export const CustomerProjection = z.object({
  customer: z.object({
    id: z.string().uuid(),
    type: z.enum(['prospect', 'retail', 'b2b']),
    email: z.string().nullable(),
    tags: z.array(z.string()),
    company: z.string().nullable(),
    createdAt: z.string().datetime(),
    totalSpent: z.number(),
    orderCount: z.number().int(),
    firstOrderAt: z.string().datetime().nullable(),
    lastOrderAt: z.string().datetime().nullable(),
    daysSinceLastOrder: z.number().int().nullable(),
    assignedRepId: z.string().uuid().nullable(),
    doNotContact: z.boolean(),
    b2bAccountId: z.string().uuid().nullable(),
  }),
  b2bAccount: z
    .object({
      pricingTier: z.string().nullable(),
      creditUtilization: z.number(), // 0–1 ratio of credit_used / credit_limit
      fleetSize: z.number().int().nullable(),
      status: z.enum(['active', 'credit_hold', 'suspended', 'inactive']),
      paymentTerms: z.string().nullable(),
    })
    .nullable(),
  email: z.object({
    openedLast30d: z.number().int(),
    clickedLast30d: z.number().int(),
    unsubscribed: z.boolean(),
  }),
});
export type CustomerProjection = z.infer<typeof CustomerProjection>;
