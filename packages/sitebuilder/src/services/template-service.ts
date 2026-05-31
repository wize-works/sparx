// templateService — scoped page layouts (SiteTemplate), the Phase 3 generalization
// of the old bare `pageKey` string (docs/30 §4, docs/handoffs/sitebuilder-phase3-spec.md §3, §13).
//
// The native surface is (scope, key) / templateId: callers resolve-or-create a
// template, then do section CRUD by templateId. The pageKey helpers below remain
// only as a transitional alias the section service maps onto a template when a
// caller still speaks pageKey (removed in 3.3c):
//   "home"      ↔ (scope: 'home',   key: 'default')   — the storefront homepage
//   "<slug>"    ↔ (scope: 'custom', key: '<slug>')    — a standalone slug page (doc 30 §4.1)

import {
  CreateTemplateInput,
  DEFAULT_TEMPLATES,
  MaterializeTemplateInput,
  parseSectionConfig,
} from '@sparx/sitebuilder-schemas';
import type { Prisma, SiteTemplate, TxClient } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { getOrCreateConfig } from './_config';

// The transport-facing view of a SiteTemplate (stable shape across REST/MCP/SA).
export interface TemplateView {
  id: string;
  tenantId: string;
  scope: string;
  key: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function toView(t: SiteTemplate): TemplateView {
  return {
    id: t.id,
    tenantId: t.tenantId,
    scope: t.scope,
    key: t.key,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// Humanized default name for a (scope, key) when the caller doesn't supply one.
const SCOPE_NAMES: Record<string, string> = {
  home: 'Home',
  product: 'Product page',
  collection: 'Collection page',
  'cms-page': 'Page',
  custom: 'Page',
};
function defaultTemplateName(scope: string, key: string): string {
  if (scope === 'custom' || scope === 'cms-page') return key;
  return SCOPE_NAMES[scope] ?? key;
}

/** Map a legacy pageKey onto its (scope, key, name). */
export function scopeKeyForPageKey(pageKey: string): { scope: string; key: string; name: string } {
  return pageKey === 'home'
    ? { scope: 'home', key: 'default', name: 'Home' }
    : { scope: 'custom', key: pageKey, name: pageKey };
}

/** The inverse — the pageKey a template resolves to (back-compat for snapshots). */
export function pageKeyForTemplate(t: { scope: string; key: string }): string {
  return t.scope === 'home' ? 'home' : t.key;
}

/** Find-or-create the template for a (scope, key); lazily materialized like SiteConfig. */
export async function getOrCreateTemplate(
  tx: TxClient,
  tenantId: string,
  scope: string,
  key: string,
  name: string
): Promise<SiteTemplate> {
  const existing = await tx.siteTemplate.findUnique({
    where: { tenantId_scope_key: { tenantId, scope, key } },
  });
  if (existing) return existing;
  return tx.siteTemplate.create({ data: { tenantId, scope, key, name } });
}

/** Find-or-create the template a legacy pageKey maps to. */
export function getOrCreateForPageKey(
  tx: TxClient,
  tenantId: string,
  pageKey: string
): Promise<SiteTemplate> {
  const { scope, key, name } = scopeKeyForPageKey(pageKey);
  return getOrCreateTemplate(tx, tenantId, scope, key, name);
}

/** Find (without creating) the template a legacy pageKey maps to. */
export function findForPageKey(
  tx: TxClient,
  tenantId: string,
  pageKey: string
): Promise<SiteTemplate | null> {
  const { scope, key } = scopeKeyForPageKey(pageKey);
  return tx.siteTemplate.findUnique({
    where: { tenantId_scope_key: { tenantId, scope, key } },
  });
}

/** All templates for a tenant, optionally filtered by scope (editor + listing). */
export function list(ctx: ServiceContext, scope?: string): Promise<TemplateView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.siteTemplate.findMany({
      where: scope ? { scope } : {},
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return rows.map(toView);
  });
}

/** Resolve-or-create the (scope, key) layout (lazily materialized, empty). */
export function getOrCreate(ctx: ServiceContext, rawInput: unknown): Promise<TemplateView> {
  const input = CreateTemplateInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const template = await getOrCreateTemplate(
      tx,
      ctx.tenantId,
      input.scope,
      input.key,
      input.name ?? defaultTemplateName(input.scope, input.key)
    );
    return toView(template);
  });
}

/**
 * "Customize this layout" (spec §13.1): resolve-or-create the (scope, key)
 * layout and, if it's still empty, copy the code-defined DEFAULT_TEMPLATES[scope]
 * rows into real SiteSection rows. Idempotent — a layout that already has
 * sections is returned untouched, so a second call never duplicates. Scopes
 * without a code default (home / cms-page / custom) just get an empty layout.
 */
export function materializeDefault(ctx: ServiceContext, rawInput: unknown): Promise<TemplateView> {
  const { scope, key } = MaterializeTemplateInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const template = await getOrCreateTemplate(
      tx,
      ctx.tenantId,
      scope,
      key,
      defaultTemplateName(scope, key)
    );

    const existing = await tx.siteSection.count({ where: { templateId: template.id } });
    const defaults =
      existing === 0 && (scope === 'product' || scope === 'collection')
        ? DEFAULT_TEMPLATES[scope]
        : [];

    if (defaults.length > 0) {
      for (const [position, d] of defaults.entries()) {
        const config = parseSectionConfig(d.sectionType, d.config);
        await tx.siteSection.create({
          data: {
            tenantId: ctx.tenantId,
            templateId: template.id,
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
        action: 'sitebuilder.template.materialized',
        entityType: 'SiteTemplate',
        entityId: template.id,
        diff: { after: { scope, key, sections: defaults.length } },
      });
    }

    return toView(template);
  });
}
