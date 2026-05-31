// templateService — scoped page layouts (SiteTemplate), the Phase 3 generalization
// of the old bare `pageKey` string (docs/30 §4, docs/handoffs/sitebuilder-phase3-spec.md §3).
//
// Phase 3.0 keeps the public section API pageKey-shaped (routes, MCP tools, the
// dashboard all still speak `pageKey`); these helpers map a pageKey onto the
// template model so the re-key is purely internal:
//   "home"      ↔ (scope: 'home',   key: 'default')   — the storefront homepage
//   "<slug>"    ↔ (scope: 'custom', key: '<slug>')    — a standalone slug page (doc 30 §4.1)
// The native scope/templateId surface arrives with the editor work in 3.3.

import type { SiteTemplate, TxClient } from '@sparx/db';
import { withTenant } from '@sparx/db';

import type { ServiceContext } from '../errors';

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
export function list(ctx: ServiceContext, scope?: string): Promise<SiteTemplate[]> {
  return withTenant(ctx, (tx) =>
    tx.siteTemplate.findMany({
      where: scope ? { scope } : {},
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    })
  );
}
