// Segment evaluation helpers — preview-count + full recompute.
//
// Both are read-then-evaluate paths over @sparx/crm-schemas'
// evaluateSegmentRule. previewCount samples customers for sub-second editor
// feedback; recomputeFull walks every customer (nightly safety-net to
// reconcile drift from dropped events).

import { withTenant } from '@sparx/db';
import { SegmentRuleSchema, evaluateSegmentRule, type SegmentRule } from '@sparx/crm-schemas';

import { buildSegmentRuleProjection } from '../consumers/segment-projection';
import type { ServiceContext } from '../errors';
import { CrmValidationError } from '../errors';

const PREVIEW_SAMPLE_DEFAULT = 250;

/** Evaluate a candidate rule (not necessarily persisted yet) against a
 *  sample of customers and return the match count + sampled total. The
 *  dashboard rule editor calls this on every change to show "X of Y match." */
export async function previewCount(
  ctx: ServiceContext,
  args: { rule: unknown; sampleSize?: number }
): Promise<{ matches: number; sampled: number; total: number }> {
  const parsed = SegmentRuleSchema.safeParse(args.rule);
  if (!parsed.success) {
    throw new CrmValidationError('Rule failed validation', [
      { field: 'rule', message: parsed.error.issues[0]?.message ?? 'Invalid rule' },
    ]);
  }
  const rule: SegmentRule = parsed.data;
  const limit = Math.min(args.sampleSize ?? PREVIEW_SAMPLE_DEFAULT, 1000);

  return withTenant(ctx, async (tx) => {
    const [sample, total] = await Promise.all([
      tx.customer.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      tx.customer.count({ where: { deletedAt: null } }),
    ]);

    let matches = 0;
    for (const c of sample) {
      const projection = await buildSegmentRuleProjection(ctx, c.id).catch(() => null);
      if (!projection) continue;
      if (evaluateSegmentRule(rule, projection)) matches += 1;
    }

    return { matches, sampled: sample.length, total };
  });
}

/** Full recompute — re-evaluate every customer against every active
 *  segment for the tenant, reconciling segment_members. Nightly batch path;
 *  expensive (O(customers × segments × projection-fetch)). Use sparingly. */
export async function recomputeFull(
  ctx: ServiceContext,
  args: { segmentId?: string } = {}
): Promise<{ scanned: number; changed: number }> {
  let scanned = 0;
  let changed = 0;

  const customerIds = await withTenant(ctx, (tx) =>
    tx.customer.findMany({
      where: { deletedAt: null },
      select: { id: true },
    })
  );

  // Process one customer at a time. evaluateCustomerForTenant lives in the
  // consumer module — we import lazily to avoid a service ↔ consumer cycle.
  const { evaluateCustomerForTenant } = await import('../consumers/segment-evaluator');

  for (const { id } of customerIds) {
    const { entered, exited } = await evaluateCustomerForTenant(ctx.tenantId, id);
    scanned += 1;
    if (args.segmentId) {
      if (entered.includes(args.segmentId) || exited.includes(args.segmentId)) changed += 1;
    } else if (entered.length > 0 || exited.length > 0) {
      changed += 1;
    }
  }

  return { scanned, changed };
}
