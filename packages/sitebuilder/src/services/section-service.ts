// sectionService — draft page composition (the editable SiteSection rows).
//
// Sections are the working set; publishing snapshots them into a SiteVersion.
// Config is validated/defaulted against the section's Zod schema in
// @sparx/sitebuilder-schemas so every transport stores the same shape.
//
// Phase 3 re-key: sections now hang off a SiteTemplate, not a bare `pageKey`
// (docs/handoffs/sitebuilder-phase3-spec.md §3). The public surface stays
// pageKey-shaped — callers pass a pageKey, we resolve/create the matching
// template internally, and the returned view carries the derived pageKey — so
// routes, MCP tools, and the dashboard are unchanged in 3.0.

import {
  CreateSectionInput,
  ReorderSectionsInput,
  UpdateSectionInput,
  parseSectionConfig,
} from '@sparx/sitebuilder-schemas';
import type { Prisma, SiteSection } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError } from '../errors';
import { getOrCreateConfig } from './_config';
import { findForPageKey, getOrCreateForPageKey, pageKeyForTemplate } from './template-service';

// The pageKey-shaped view the public surface returns — mirrors the pre-Phase-3
// SiteSection row so routes/MCP/dashboard see an identical shape.
export interface SectionView {
  id: string;
  tenantId: string;
  pageKey: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

function toView(section: SiteSection, template: { scope: string; key: string }): SectionView {
  return {
    id: section.id,
    tenantId: section.tenantId,
    pageKey: pageKeyForTemplate(template),
    sectionType: section.sectionType,
    position: section.position,
    visible: section.visible,
    config: section.config,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

export function list(ctx: ServiceContext, pageKey: string): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const template = await findForPageKey(tx, ctx.tenantId, pageKey);
    if (!template) return [];
    const rows = await tx.siteSection.findMany({
      where: { templateId: template.id },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => toView(r, template));
  });
}

export function listAll(ctx: ServiceContext): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.siteSection.findMany({
      include: { template: { select: { scope: true, key: true } } },
      orderBy: [{ templateId: 'asc' }, { position: 'asc' }],
    });
    return rows.map((r) => toView(r, r.template));
  });
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<SectionView> {
  const input = CreateSectionInput.parse(rawInput);
  const config = parseSectionConfig(input.sectionType, input.config ?? {});

  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const template = await getOrCreateForPageKey(tx, ctx.tenantId, input.pageKey);
    // Append to the end of the template unless an explicit position is given.
    const last = await tx.siteSection.findFirst({
      where: { templateId: template.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = input.position ?? (last ? last.position + 1 : 0);

    const created = await tx.siteSection.create({
      data: {
        tenantId: ctx.tenantId,
        templateId: template.id,
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
      diff: { before: null, after: { sectionType: created.sectionType, pageKey: input.pageKey } },
    });
    return toView(created, template);
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
      include: { template: { select: { scope: true, key: true } } },
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
    return toView(updated, existing.template);
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
    const template = await findForPageKey(tx, ctx.tenantId, input.pageKey);
    if (!template) throw new SitebuilderNotFoundError('SiteTemplate', input.pageKey);
    const owned = await tx.siteSection.findMany({
      where: { templateId: template.id, id: { in: input.orderedIds } },
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
      entityType: 'SiteSection',
      entityId: input.pageKey,
      diff: { after: { order: input.orderedIds } },
    });
    const rows = await tx.siteSection.findMany({
      where: { templateId: template.id },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => toView(r, template));
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
