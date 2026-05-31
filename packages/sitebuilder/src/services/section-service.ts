// sectionService — draft page composition (the editable SiteSection rows).
//
// Sections are the working set; publishing snapshots them into a SiteVersion.
// Config is validated/defaulted against the section's Zod schema in
// @sparx/sitebuilder-schemas so every transport stores the same shape.
//
// Phase 3: sections hang off a SiteTemplate, not a bare `pageKey`
// (docs/handoffs/sitebuilder-phase3-spec.md §3, §13). A write targets a layout by
// `templateId` (preferred) or by `scope` (+ `key`, default 'default'); the
// returned view carries the templateId + scope/templateKey (no pageKey — that
// retired with 3.3c; it lives on only in the snapshot read path).

import {
  CreateSectionInput,
  ReorderSectionsInput,
  UpdateSectionInput,
  isSectionAllowedInScope,
  parseSectionConfig,
} from '@sparx/sitebuilder-schemas';
import type { Prisma, SiteSection, SiteTemplate, TxClient } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError, SitebuilderValidationError } from '../errors';
import { getOrCreateConfig } from './_config';
import { defaultTemplateName, findTemplate, getOrCreateTemplate } from './template-service';

// The view the public surface returns — the section plus its owning template's
// scope/key (templateId-native).
export interface SectionView {
  id: string;
  tenantId: string;
  templateId: string;
  scope: string;
  templateKey: string;
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
    templateId: section.templateId,
    scope: template.scope,
    templateKey: template.key,
    sectionType: section.sectionType,
    position: section.position,
    visible: section.visible,
    config: section.config,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

// Resolve the target layout for a write. `templateId` wins (NotFound if unknown —
// a cross-tenant id returns null under RLS, so this enforces tenant ownership);
// otherwise resolve-or-create by (scope, key). One of the two must be given.
async function resolveTemplateForWrite(
  tx: TxClient,
  tenantId: string,
  input: { templateId?: string; scope?: string; key?: string }
): Promise<SiteTemplate> {
  if (input.templateId) {
    const t = await tx.siteTemplate.findUnique({ where: { id: input.templateId } });
    if (!t) throw new SitebuilderNotFoundError('SiteTemplate', input.templateId);
    return t;
  }
  if (input.scope) {
    const key = input.key ?? 'default';
    return getOrCreateTemplate(
      tx,
      tenantId,
      input.scope,
      key,
      defaultTemplateName(input.scope, key)
    );
  }
  throw new SitebuilderValidationError('A section write must target a templateId or scope.', [
    { field: 'templateId', message: 'provide a templateId or scope' },
  ]);
}

/** List a layout's sections by (scope, key). Empty array if the layout is unknown. */
export function listForScope(
  ctx: ServiceContext,
  scope: string,
  key = 'default'
): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const template = await findTemplate(tx, ctx.tenantId, scope, key);
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

/** List a layout's sections by templateId. Empty array if the id is unknown. */
export function listForTemplate(ctx: ServiceContext, templateId: string): Promise<SectionView[]> {
  return withTenant(ctx, async (tx) => {
    const template = await tx.siteTemplate.findUnique({
      where: { id: templateId },
      select: { scope: true, key: true },
    });
    if (!template) return [];
    const rows = await tx.siteSection.findMany({
      where: { templateId },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => toView(r, template));
  });
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<SectionView> {
  const input = CreateSectionInput.parse(rawInput);
  const config = parseSectionConfig(input.sectionType, input.config ?? {});

  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const template = await resolveTemplateForWrite(tx, ctx.tenantId, input);
    // Scope safety: a bound section can only be added to a layout of its scope.
    if (!isSectionAllowedInScope(input.sectionType, template.scope)) {
      throw new SitebuilderValidationError(
        `Section "${input.sectionType}" is not allowed in a "${template.scope}" layout.`,
        [{ field: 'sectionType', message: `not allowed in scope ${template.scope}` }]
      );
    }
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
      diff: {
        before: null,
        after: {
          sectionType: created.sectionType,
          templateId: template.id,
          scope: template.scope,
          templateKey: template.key,
        },
      },
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
    const template = input.templateId
      ? await tx.siteTemplate.findUnique({ where: { id: input.templateId } })
      : input.scope
        ? await findTemplate(tx, ctx.tenantId, input.scope, input.key ?? 'default')
        : null;
    if (!template) {
      throw new SitebuilderNotFoundError(
        'SiteTemplate',
        input.templateId ??
          (input.scope ? `${input.scope}/${input.key ?? 'default'}` : 'unspecified')
      );
    }
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
      entityType: 'SiteTemplate',
      entityId: template.id,
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
