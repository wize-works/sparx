// sectionService — draft page composition (the editable SiteSection rows).
//
// Sections are the working set; publishing snapshots them into a SiteVersion.
// Config is validated/defaulted against the section's Zod schema in
// @sparx/sitebuilder-schemas so every transport stores the same shape.
//
// Sections hang off a PageLayout (docs/36 §5). A write targets a layout by
// `pageLayoutId` (preferred) or by `targetId` (+ `key`, default 'default'); the
// returned view carries the pageLayoutId + targetId/templateKey (no pageKey —
// it lives on only in the snapshot read path).

import {
  CreateSectionInput,
  ReorderSectionsInput,
  UpdateSectionInput,
  defaultLayoutName,
  isSectionAllowedInTarget,
  parseSectionConfig,
} from '@sparx/sitebuilder-schemas';
import type { PageLayout, Prisma, SiteSection, TxClient } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError, SitebuilderValidationError } from '../errors';
import { getOrCreateConfig } from './_config';
import { findPageLayout, getOrCreatePageLayout } from './page-layout-service';

// The view the public surface returns — the section plus its owning layout's
// targetId/key (pageLayoutId-native).
export interface SectionView {
  id: string;
  tenantId: string;
  pageLayoutId: string;
  targetId: string;
  templateKey: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

function toView(section: SiteSection, layout: { targetId: string; key: string }): SectionView {
  return {
    id: section.id,
    tenantId: section.tenantId,
    pageLayoutId: section.pageLayoutId,
    targetId: layout.targetId,
    templateKey: layout.key,
    sectionType: section.sectionType,
    position: section.position,
    visible: section.visible,
    config: section.config,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

// Resolve the target layout for a write. `pageLayoutId` wins (NotFound if unknown
// — a cross-tenant id returns null under RLS, so this enforces tenant ownership);
// otherwise resolve-or-create by (targetId, key). One of the two must be given.
async function resolvePageLayoutForWrite(
  tx: TxClient,
  tenantId: string,
  input: { pageLayoutId?: string; targetId?: string; key?: string }
): Promise<PageLayout> {
  if (input.pageLayoutId) {
    const l = await tx.pageLayout.findUnique({ where: { id: input.pageLayoutId } });
    if (!l) throw new SitebuilderNotFoundError('PageLayout', input.pageLayoutId);
    return l;
  }
  if (input.targetId) {
    const key = input.key ?? 'default';
    return getOrCreatePageLayout(
      tx,
      tenantId,
      input.targetId,
      key,
      defaultLayoutName(input.targetId, key)
    );
  }
  throw new SitebuilderValidationError('A section write must target a pageLayoutId or targetId.', [
    { field: 'pageLayoutId', message: 'provide a pageLayoutId or targetId' },
  ]);
}

/** List a layout's sections by (targetId, key). Empty array if the layout is unknown. */
export function listForTarget(
  ctx: ServiceContext,
  targetId: string,
  key = 'default'
): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const layout = await findPageLayout(tx, ctx.tenantId, targetId, key);
    if (!layout) return [];
    const rows = await tx.siteSection.findMany({
      where: { pageLayoutId: layout.id },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => toView(r, layout));
  });
}

export function listAll(ctx: ServiceContext): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.siteSection.findMany({
      include: { pageLayout: { select: { targetId: true, key: true } } },
      orderBy: [{ pageLayoutId: 'asc' }, { position: 'asc' }],
    });
    return rows.map((r) => toView(r, r.pageLayout));
  });
}

/** List a layout's sections by pageLayoutId. Empty array if the id is unknown. */
export function listForPageLayout(
  ctx: ServiceContext,
  pageLayoutId: string
): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const layout = await tx.pageLayout.findUnique({
      where: { id: pageLayoutId },
      select: { targetId: true, key: true },
    });
    if (!layout) return [];
    const rows = await tx.siteSection.findMany({
      where: { pageLayoutId },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => toView(r, layout));
  });
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<SectionView> {
  const input = CreateSectionInput.parse(rawInput);
  const config = parseSectionConfig(input.sectionType, input.config ?? {});

  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const layout = await resolvePageLayoutForWrite(tx, ctx.tenantId, input);
    // Target safety: a bound section can only be added to a layout whose target
    // supplies its data binding (docs/36 §4.1).
    if (!isSectionAllowedInTarget(input.sectionType, layout.targetId)) {
      throw new SitebuilderValidationError(
        `Section "${input.sectionType}" is not allowed in a "${layout.targetId}" layout.`,
        [{ field: 'sectionType', message: `not allowed in target ${layout.targetId}` }]
      );
    }
    // Append to the end of the layout unless an explicit position is given.
    const last = await tx.siteSection.findFirst({
      where: { pageLayoutId: layout.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = input.position ?? (last ? last.position + 1 : 0);

    const created = await tx.siteSection.create({
      data: {
        tenantId: ctx.tenantId,
        pageLayoutId: layout.id,
        sectionType: input.sectionType,
        position,
        config: config as Prisma.InputJsonValue,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.section.created',
      entityType: 'SiteSection',
      entityId: created.id,
      diff: {
        before: null,
        after: {
          sectionType: created.sectionType,
          pageLayoutId: layout.id,
          targetId: layout.targetId,
          templateKey: layout.key,
        },
      },
    });
    return toView(created, layout);
  });
}

export async function update(
  ctx: ServiceContext,
  sectionId: string,
  rawInput: unknown
): Promise<SectionView> {
  const input = UpdateSectionInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const existing = await tx.siteSection.findUnique({
      where: { id: sectionId },
      include: { pageLayout: { select: { targetId: true, key: true } } },
    });
    if (!existing) throw new SitebuilderNotFoundError('SiteSection', sectionId);

    const config =
      input.config !== undefined
        ? parseSectionConfig(existing.sectionType, input.config)
        : undefined;

    const updated = await tx.siteSection.update({
      where: { id: sectionId },
      data: {
        ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
        ...(input.visible !== undefined ? { visible: input.visible } : {}),
      },
    });
    return toView(updated, existing.pageLayout);
  });
}

export function setVisibility(
  ctx: ServiceContext,
  sectionId: string,
  visible: boolean
): Promise<SectionView> {
  return update(ctx, sectionId, { visible });
}

export async function reorder(ctx: ServiceContext, rawInput: unknown): Promise<SectionView[]> {
  const input = ReorderSectionsInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const layout = input.pageLayoutId
      ? await tx.pageLayout.findUnique({ where: { id: input.pageLayoutId } })
      : input.targetId
        ? await findPageLayout(tx, ctx.tenantId, input.targetId, input.key ?? 'default')
        : null;
    if (!layout) {
      throw new SitebuilderNotFoundError(
        'PageLayout',
        input.pageLayoutId ??
          (input.targetId ? `${input.targetId}/${input.key ?? 'default'}` : 'unspecified')
      );
    }
    const owned = await tx.siteSection.findMany({
      where: { pageLayoutId: layout.id, id: { in: input.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== input.orderedIds.length) {
      throw new SitebuilderNotFoundError('SiteSection', 'one or more sections');
    }
    await Promise.all(
      input.orderedIds.map((id, index) =>
        tx.siteSection.update({ where: { id }, data: { position: index } })
      )
    );
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.sections.reordered',
      entityType: 'PageLayout',
      entityId: layout.id,
      diff: { after: { order: input.orderedIds } },
    });
    const rows = await tx.siteSection.findMany({
      where: { pageLayoutId: layout.id },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => toView(r, layout));
  });
}

export async function remove(ctx: ServiceContext, sectionId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.siteSection.findUnique({ where: { id: sectionId } });
    if (!existing) throw new SitebuilderNotFoundError('SiteSection', sectionId);
    await tx.siteSection.delete({ where: { id: sectionId } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.section.deleted',
      entityType: 'SiteSection',
      entityId: sectionId,
      diff: { before: { sectionType: existing.sectionType }, after: null },
    });
  });
}
