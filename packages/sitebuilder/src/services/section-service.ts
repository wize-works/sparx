// sectionService — draft page composition (the editable SiteSection rows).
//
// Sections are the working set; publishing snapshots them into a SiteVersion.
// Config is validated/defaulted against the section's Zod schema in
// @sparx/sitebuilder-schemas so every transport stores the same shape.
//
// Phase 3 re-key: sections hang off a SiteTemplate, not a bare `pageKey`
// (docs/handoffs/sitebuilder-phase3-spec.md §3, §13). The native parent is
// `templateId`; a caller may still pass a `pageKey`, which the service resolves
// onto a template (transitional alias, removed in 3.3c). The returned view
// carries both the templateId/scope and the derived pageKey during the window.

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
import { findForPageKey, getOrCreateForPageKey, pageKeyForTemplate } from './template-service';

// The view the public surface returns. Carries the native templateId/scope plus
// the derived `pageKey` alias (dropped in 3.3c once no caller speaks pageKey).
export interface SectionView {
  id: string;
  tenantId: string;
  templateId: string;
  scope: string;
  templateKey: string;
  // Legacy alias — `home` for a home/default layout, the key otherwise.
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
    templateId: section.templateId,
    scope: template.scope,
    templateKey: template.key,
    pageKey: pageKeyForTemplate(template),
    sectionType: section.sectionType,
    position: section.position,
    visible: section.visible,
    config: section.config,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

// Resolve the target layout for a write. `templateId` wins; otherwise the
// pageKey alias is get-or-created (default 'home'). Cross-tenant ids return
// null under RLS → NotFound, so this also enforces tenant ownership.
async function resolveTemplateForWrite(
  tx: TxClient,
  tenantId: string,
  input: { templateId?: string; pageKey?: string }
): Promise<SiteTemplate> {
  if (input.templateId) {
    const t = await tx.siteTemplate.findUnique({ where: { id: input.templateId } });
    if (!t) throw new SitebuilderNotFoundError('SiteTemplate', input.templateId);
    return t;
  }
  return getOrCreateForPageKey(tx, tenantId, input.pageKey ?? 'home');
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
      : await findForPageKey(tx, ctx.tenantId, input.pageKey ?? 'home');
    if (!template) {
      throw new SitebuilderNotFoundError(
        'SiteTemplate',
        input.templateId ?? input.pageKey ?? 'home'
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
