// pageLayoutService — page layouts (PageLayout) keyed by a layout TARGET, the
// P-B generalization of the old fixed `scope` enum (docs/30 §4, docs/36 §4,
// docs/handoffs/sitebuilder-pb-spec.md).
//
// The surface is (targetId, key) / pageLayoutId: callers resolve-or-create a
// layout, then do section CRUD by pageLayoutId. The legacy `pageKey` mapping
// ("home" ↔ site:home/default, "<slug>" ↔ cms:content-page/<slug>) no longer
// lives here — it survives only in the snapshot read path (publish-internals +
// the storefront), which still reads pre-Phase-3 published SiteVersions.

import {
  CreatePageLayoutInput,
  DEFAULT_TEMPLATES,
  MaterializePageLayoutInput,
  defaultLayoutName,
  parseSectionConfig,
} from '@sparx/sitebuilder-schemas';
import type { PageLayout, Prisma, TxClient } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { getOrCreateConfig } from './_config';

// The transport-facing view of a PageLayout (stable shape across REST/MCP/SA).
export interface PageLayoutView {
  id: string;
  tenantId: string;
  targetId: string;
  key: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function toView(layout: PageLayout): PageLayoutView {
  return {
    id: layout.id,
    tenantId: layout.tenantId,
    targetId: layout.targetId,
    key: layout.key,
    name: layout.name,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt,
  };
}

/** Find-or-create the layout for a (targetId, key); lazily materialized like SiteConfig. */
export async function getOrCreatePageLayout(
  tx: TxClient,
  tenantId: string,
  targetId: string,
  key: string,
  name: string
): Promise<PageLayout> {
  const existing = await tx.pageLayout.findUnique({
    where: { tenantId_targetId_key: { tenantId, targetId, key } },
  });
  if (existing) return existing;
  return tx.pageLayout.create({ data: { tenantId, targetId, key, name } });
}

/** Find (without creating) the layout for a (targetId, key). */
export function findPageLayout(
  tx: TxClient,
  tenantId: string,
  targetId: string,
  key: string
): Promise<PageLayout | null> {
  return tx.pageLayout.findUnique({
    where: { tenantId_targetId_key: { tenantId, targetId, key } },
  });
}

/** All page layouts for a tenant, optionally filtered by target (editor + listing). */
export function list(ctx: ServiceContext, targetId?: string): Promise<PageLayoutView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.pageLayout.findMany({
      where: targetId ? { targetId } : {},
      orderBy: [{ targetId: 'asc' }, { key: 'asc' }],
    });
    return rows.map(toView);
  });
}

/** Resolve-or-create the (targetId, key) layout (lazily materialized, empty). */
export function getOrCreate(ctx: ServiceContext, rawInput: unknown): Promise<PageLayoutView> {
  const input = CreatePageLayoutInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const layout = await getOrCreatePageLayout(
      tx,
      ctx.tenantId,
      input.targetId,
      input.key,
      input.name ?? defaultLayoutName(input.targetId, input.key)
    );
    return toView(layout);
  });
}

/**
 * "Customize this layout" (docs/36 §3): resolve-or-create the (targetId, key)
 * layout and, if it's still empty, copy the code-defined DEFAULT_TEMPLATES rows
 * into real SiteSection rows. Idempotent — a layout that already has sections is
 * returned untouched, so a second call never duplicates. Targets without a code
 * default (site:home / cms:content-page) just get an empty layout.
 */
export function materializeDefault(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<PageLayoutView> {
  const { targetId, key } = MaterializePageLayoutInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const layout = await getOrCreatePageLayout(
      tx,
      ctx.tenantId,
      targetId,
      key,
      defaultLayoutName(targetId, key)
    );

    const existing = await tx.siteSection.count({ where: { pageLayoutId: layout.id } });
    const defaults =
      existing === 0 && (targetId === 'commerce:product' || targetId === 'commerce:collection')
        ? DEFAULT_TEMPLATES[targetId]
        : [];

    if (defaults.length > 0) {
      for (const [position, d] of defaults.entries()) {
        const config = parseSectionConfig(d.sectionType, d.config);
        await tx.siteSection.create({
          data: {
            tenantId: ctx.tenantId,
            pageLayoutId: layout.id,
            sectionType: d.sectionType,
            position,
            config: config as Prisma.InputJsonValue,
          },
        });
      }
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: 'user',
        action: 'sitebuilder.page_layout.materialized',
        entityType: 'PageLayout',
        entityId: layout.id,
        diff: { after: { targetId, key, sections: defaults.length } },
      });
    }

    return toView(layout);
  });
}
