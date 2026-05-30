// sectionService — draft page composition (the editable SiteSection rows).
//
// Sections are the working set; publishing snapshots them into a SiteVersion.
// Config is validated/defaulted against the section's Zod schema in
// @sparx/sitebuilder-schemas so every transport stores the same shape.

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

export function list(ctx: ServiceContext, pageKey: string): Promise<SiteSection[]> {
  return withTenant(ctx, (tx) =>
    tx.siteSection.findMany({ where: { pageKey }, orderBy: { position: 'asc' } })
  );
}

export function listAll(ctx: ServiceContext): Promise<SiteSection[]> {
  return withTenant(ctx, (tx) =>
    tx.siteSection.findMany({ orderBy: [{ pageKey: 'asc' }, { position: 'asc' }] })
  );
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<SiteSection> {
  const input = CreateSectionInput.parse(rawInput);
  const config = parseSectionConfig(input.sectionType, input.config ?? {});

  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    // Append to the end of the page unless an explicit position is given.
    const last = await tx.siteSection.findFirst({
      where: { pageKey: input.pageKey },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = input.position ?? (last ? last.position + 1 : 0);

    const created = await tx.siteSection.create({
      data: {
        tenantId: ctx.tenantId,
        pageKey: input.pageKey,
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
      diff: { before: null, after: { sectionType: created.sectionType, pageKey: created.pageKey } },
    });
    return created;
  });
}

export async function update(
  ctx: ServiceContext,
  sectionId: string,
  rawInput: unknown
): Promise<SiteSection> {
  const input = UpdateSectionInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const existing = await tx.siteSection.findUnique({ where: { id: sectionId } });
    if (!existing) throw new SitebuilderNotFoundError('SiteSection', sectionId);

    const config =
      input.config !== undefined
        ? parseSectionConfig(existing.sectionType, input.config)
        : undefined;

    return tx.siteSection.update({
      where: { id: sectionId },
      data: {
        ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
        ...(input.visible !== undefined ? { visible: input.visible } : {}),
      },
    });
  });
}

export function setVisibility(
  ctx: ServiceContext,
  sectionId: string,
  visible: boolean
): Promise<SiteSection> {
  return update(ctx, sectionId, { visible });
}

export async function reorder(ctx: ServiceContext, rawInput: unknown): Promise<SiteSection[]> {
  const input = ReorderSectionsInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const owned = await tx.siteSection.findMany({
      where: { pageKey: input.pageKey, id: { in: input.orderedIds } },
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
    return tx.siteSection.findMany({
      where: { pageKey: input.pageKey },
      orderBy: { position: 'asc' },
    });
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
