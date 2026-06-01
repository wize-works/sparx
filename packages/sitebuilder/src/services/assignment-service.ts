// assignmentService — layout assignment (docs/36 §6, docs/handoffs/sitebuilder-pc-spec.md).
//
// Site Builder OWNS the assignment; the data module owns its records. Two
// SB-owned tables: the per-target tenant default (SiteLayoutDefault) and the
// per-item override (SiteLayoutAssignment, keyed by the record's stable id).
// `readAssignmentSnapshot` resolves both into the layoutKeys the storefront
// resolver cascades over — read LIVE at snapshot time (publish-service), never
// baked into the version (the referenced layout's sections must be published to
// take effect anyway).

import { AssignLayoutInput, SetLayoutDefaultInput } from '@sparx/sitebuilder-schemas';
import type { TxClient } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError, SitebuilderValidationError } from '../errors';

export interface AssignmentView {
  id: string;
  targetId: string;
  itemRef: string;
  pageLayoutId: string;
}

// The resolver maps the storefront cascades over: per-target default layoutKey +
// per-item override layoutKeys. Both reference a layout BY KEY (resolved from the
// owning PageLayout), so the storefront filters snapshot sections by it.
export interface SnapshotAssignments {
  defaults: Record<string, string>;
  items: { targetId: string; itemRef: string; layoutKey: string }[];
}

// A layout the assignment points at must belong to the tenant (RLS — a
// cross-tenant id returns null) AND match the target (you can't pin a product to
// a collection layout). Returns the verified layout or throws.
async function requireOwnedLayout(tx: TxClient, pageLayoutId: string, targetId: string) {
  const layout = await tx.pageLayout.findUnique({ where: { id: pageLayoutId } });
  if (!layout) throw new SitebuilderNotFoundError('PageLayout', pageLayoutId);
  if (layout.targetId !== targetId) {
    throw new SitebuilderValidationError(
      `Layout ${pageLayoutId} is for target "${layout.targetId}", not "${targetId}".`,
      [{ field: 'pageLayoutId', message: `layout target mismatch` }]
    );
  }
  return layout;
}

/** Set (upsert) the tenant default layout for a target. */
export async function setDefault(ctx: ServiceContext, rawInput: unknown): Promise<AssignmentView> {
  const input = SetLayoutDefaultInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    await requireOwnedLayout(tx, input.pageLayoutId, input.targetId);
    const row = await tx.siteLayoutDefault.upsert({
      where: { tenantId_targetId: { tenantId: ctx.tenantId, targetId: input.targetId } },
      create: {
        tenantId: ctx.tenantId,
        targetId: input.targetId,
        pageLayoutId: input.pageLayoutId,
      },
      update: { pageLayoutId: input.pageLayoutId },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.layout_default.set',
      entityType: 'SiteLayoutDefault',
      entityId: row.id,
      diff: { after: { targetId: input.targetId, pageLayoutId: input.pageLayoutId } },
    });
    return { id: row.id, targetId: row.targetId, itemRef: '', pageLayoutId: row.pageLayoutId };
  });
}

/** Clear the tenant default for a target (falls back to the `default` layout). */
export async function clearDefault(ctx: ServiceContext, targetId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.siteLayoutDefault.deleteMany({ where: { targetId } });
  });
}

/** Pin (upsert) a per-item layout override. */
export async function assign(ctx: ServiceContext, rawInput: unknown): Promise<AssignmentView> {
  const input = AssignLayoutInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    await requireOwnedLayout(tx, input.pageLayoutId, input.targetId);
    const row = await tx.siteLayoutAssignment.upsert({
      where: {
        tenantId_targetId_itemRef: {
          tenantId: ctx.tenantId,
          targetId: input.targetId,
          itemRef: input.itemRef,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        targetId: input.targetId,
        itemRef: input.itemRef,
        pageLayoutId: input.pageLayoutId,
      },
      update: { pageLayoutId: input.pageLayoutId },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.layout_assignment.set',
      entityType: 'SiteLayoutAssignment',
      entityId: row.id,
      diff: {
        after: {
          targetId: input.targetId,
          itemRef: input.itemRef,
          pageLayoutId: input.pageLayoutId,
        },
      },
    });
    return {
      id: row.id,
      targetId: row.targetId,
      itemRef: row.itemRef,
      pageLayoutId: row.pageLayoutId,
    };
  });
}

/** Remove a per-item override (the item falls back to the cascade). */
export async function unassign(
  ctx: ServiceContext,
  targetId: string,
  itemRef: string
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.siteLayoutAssignment.deleteMany({ where: { targetId, itemRef } });
  });
}

/** The current resolution for one item: its override pageLayoutId, the target
 *  default, or null (→ the `default` layout). Powers the editor picker. */
export function getResolution(
  ctx: ServiceContext,
  targetId: string,
  itemRef: string
): Promise<{ assignedLayoutId: string | null; defaultLayoutId: string | null }> {
  return withTenant(ctx, async (tx) => {
    const [item, def] = await Promise.all([
      tx.siteLayoutAssignment.findUnique({
        where: { tenantId_targetId_itemRef: { tenantId: ctx.tenantId, targetId, itemRef } },
      }),
      tx.siteLayoutDefault.findUnique({
        where: { tenantId_targetId: { tenantId: ctx.tenantId, targetId } },
      }),
    ]);
    return {
      assignedLayoutId: item?.pageLayoutId ?? null,
      defaultLayoutId: def?.pageLayoutId ?? null,
    };
  });
}

/** All per-item overrides for a target (admin/listing). */
export function listForTarget(ctx: ServiceContext, targetId: string): Promise<AssignmentView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.siteLayoutAssignment.findMany({
      where: { targetId },
      orderBy: { itemRef: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      targetId: r.targetId,
      itemRef: r.itemRef,
      pageLayoutId: r.pageLayoutId,
    }));
  });
}

/**
 * Resolve both assignment tables into the storefront cascade maps (per-target
 * default layoutKey + per-item override layoutKeys). Read LIVE at snapshot time.
 * tx-based so publish-service can call it within its read transaction.
 */
export async function readAssignmentSnapshot(
  tx: TxClient,
  _tenantId: string
): Promise<SnapshotAssignments> {
  const [defaults, items] = await Promise.all([
    tx.siteLayoutDefault.findMany({ include: { pageLayout: { select: { key: true } } } }),
    tx.siteLayoutAssignment.findMany({ include: { pageLayout: { select: { key: true } } } }),
  ]);
  return {
    defaults: Object.fromEntries(defaults.map((d) => [d.targetId, d.pageLayout.key])),
    items: items.map((a) => ({
      targetId: a.targetId,
      itemRef: a.itemRef,
      layoutKey: a.pageLayout.key,
    })),
  };
}
