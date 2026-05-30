// Collection rule projection.
//
// Rules-driven collections store a `ruleSet` jsonb on ProductCollection.
// The commerce-indexer worker calls projectCollectionRules() whenever a
// product or collection event hints that membership might have changed.
// The function evaluates the rule against current products and writes
// the resulting set into CollectionProduct with addedBy='rule'. Manual
// rows (addedBy='manual') are left alone so the merchant's pinned items
// survive a reprojection.
//
// Rule grammar (intentionally small — the dashboard editor controls
// what the merchant can author):
//   { operator: 'AND' | 'OR', conditions: [Condition, ...] }
// Each Condition is one of:
//   { field: 'vendor', op: 'equals' | 'in', value: string | string[] }
//   { field: 'productType', op: 'equals' | 'in', value: string | string[] }
//   { field: 'tag', op: 'has' | 'hasAny', value: string | string[] }
//   { field: 'title', op: 'contains', value: string }
//   { field: 'status', op: 'equals', value: 'active' | 'draft' | 'archived' }
//   { field: 'priceMinCents', op: 'gte' | 'lte', value: number }
//   { field: 'fitmentMake', op: 'equals' | 'in', value: string | string[] }
//   { field: 'fitmentYear', op: 'equals', value: number }
//
// New operators can be added without a migration — the ruleSet column is
// jsonb and unknown ops are skipped (with a logged warning).

import { withTenant } from '@sparx/db';
import type { Prisma } from '@sparx/db';

import type { ServiceContext } from './errors';

interface Condition {
  field: string;
  op: string;
  value: unknown;
}

interface RuleSet {
  operator?: 'AND' | 'OR';
  conditions?: Condition[];
}

export interface ProjectionDiff {
  collectionId: string;
  added: string[];
  removed: string[];
  unchanged: number;
}

const MAX_PROJECTED_PRODUCTS = 5_000;

/**
 * Recompute the rule-driven membership for one collection. Idempotent.
 * Returns the diff so the worker can log + emit follow-up events.
 */
export async function projectCollectionRules(
  ctx: ServiceContext,
  collectionId: string
): Promise<ProjectionDiff> {
  return withTenant(ctx, async (tx) => {
    const collection = await tx.productCollection.findFirst({
      where: { id: collectionId, deletedAt: null, type: 'rules' },
      select: { id: true, ruleSet: true },
    });
    if (!collection) {
      return { collectionId, added: [], removed: [], unchanged: 0 };
    }

    const ruleSet = (collection.ruleSet ?? {}) as RuleSet;
    const where = compileRuleSet(ruleSet);

    const matches = await tx.product.findMany({
      where: { ...where, deletedAt: null },
      select: { id: true },
      take: MAX_PROJECTED_PRODUCTS,
    });
    const matchIds = new Set(matches.map((m) => m.id));

    const existing = await tx.collectionProduct.findMany({
      where: { collectionId },
      select: { productId: true, addedBy: true },
    });
    const manualIds = new Set(
      existing.filter((e) => e.addedBy === 'manual').map((e) => e.productId)
    );
    const existingRuleIds = new Set(
      existing.filter((e) => e.addedBy === 'rule').map((e) => e.productId)
    );

    const added: string[] = [];
    const removed: string[] = [];
    for (const id of matchIds) {
      if (!existingRuleIds.has(id) && !manualIds.has(id)) added.push(id);
    }
    for (const id of existingRuleIds) {
      if (!matchIds.has(id)) removed.push(id);
    }

    if (removed.length > 0) {
      await tx.collectionProduct.deleteMany({
        where: {
          collectionId,
          addedBy: 'rule',
          productId: { in: removed },
        },
      });
    }
    if (added.length > 0) {
      await tx.collectionProduct.createMany({
        data: added.map((productId, idx) => ({
          collectionId,
          productId,
          position: existing.length + idx,
          addedBy: 'rule',
        })),
        skipDuplicates: true,
      });
    }

    const unchanged = existingRuleIds.size - removed.length;
    return { collectionId, added, removed, unchanged };
  });
}

/**
 * Project every rules-driven collection in the tenant. Used when a
 * product changes and we don't know which rule-driven collections it
 * might newly match — cheaper than nothing, and the workload stays
 * small (typical tenant has <50 rules-driven collections).
 */
export async function projectAllCollectionRulesForTenant(
  ctx: ServiceContext
): Promise<ProjectionDiff[]> {
  const collectionIds = await withTenant(ctx, async (tx) => {
    const rows = await tx.productCollection.findMany({
      where: { type: 'rules', deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  });
  const out: ProjectionDiff[] = [];
  for (const id of collectionIds) {
    out.push(await projectCollectionRules(ctx, id));
  }
  return out;
}

// ─── Rule compilation ────────────────────────────────────────────────

function compileRuleSet(ruleSet: RuleSet): Prisma.ProductWhereInput {
  const conditions = ruleSet.conditions ?? [];
  if (conditions.length === 0) {
    // Empty rule set matches nothing — safer default than matching every
    // product. The dashboard editor refuses to save an empty rule set.
    return { id: { in: [] } };
  }
  const operator = ruleSet.operator ?? 'AND';
  const clauses: Prisma.ProductWhereInput[] = [];
  for (const c of conditions) {
    const clause = compileCondition(c);
    if (clause) clauses.push(clause);
  }
  if (clauses.length === 0) return { id: { in: [] } };
  return operator === 'OR' ? { OR: clauses } : { AND: clauses };
}

function compileCondition(c: Condition): Prisma.ProductWhereInput | null {
  switch (c.field) {
    case 'vendor':
      return stringMatch('vendor', c);
    case 'productType':
      return stringMatch('productType', c);
    case 'status':
      if (c.op === 'equals' && typeof c.value === 'string') {
        return { status: c.value };
      }
      return null;
    case 'tag':
      if (c.op === 'has' && typeof c.value === 'string') {
        return { tags: { has: c.value } };
      }
      if (c.op === 'hasAny' && Array.isArray(c.value)) {
        return {
          tags: {
            hasSome: (c.value as unknown[]).filter((v): v is string => typeof v === 'string'),
          },
        };
      }
      return null;
    case 'title':
      if (c.op === 'contains' && typeof c.value === 'string') {
        return { title: { contains: c.value, mode: 'insensitive' } };
      }
      return null;
    case 'priceMinCents':
      return numericMatch('priceMinCents', c);
    case 'priceMaxCents':
      return numericMatch('priceMaxCents', c);
    case 'fitmentMake':
      if (c.op === 'equals' && typeof c.value === 'string') {
        return { fitments: { some: { make: { name: c.value } } } };
      }
      if (c.op === 'in' && Array.isArray(c.value)) {
        const names = (c.value as unknown[]).filter((v): v is string => typeof v === 'string');
        return { fitments: { some: { make: { name: { in: names } } } } };
      }
      return null;
    case 'fitmentYear':
      if (c.op === 'equals' && typeof c.value === 'number') {
        return {
          fitments: {
            some: {
              yearMin: { lte: c.value },
              OR: [{ yearMax: { gte: c.value } }, { yearMax: null }],
            },
          },
        };
      }
      return null;
    default:
      return null;
  }
}

function stringMatch(
  field: 'vendor' | 'productType',
  c: Condition
): Prisma.ProductWhereInput | null {
  if (c.op === 'equals' && typeof c.value === 'string') {
    return { [field]: c.value };
  }
  if (c.op === 'in' && Array.isArray(c.value)) {
    const values = (c.value as unknown[]).filter((v): v is string => typeof v === 'string');
    return { [field]: { in: values } };
  }
  return null;
}

function numericMatch(
  field: 'priceMinCents' | 'priceMaxCents',
  c: Condition
): Prisma.ProductWhereInput | null {
  if (typeof c.value !== 'number') return null;
  if (c.op === 'gte') return { [field]: { gte: c.value } };
  if (c.op === 'lte') return { [field]: { lte: c.value } };
  if (c.op === 'equals') return { [field]: c.value };
  return null;
}
