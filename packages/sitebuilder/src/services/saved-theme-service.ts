// savedThemeService — the tenant's NAMED theme variants (docs/36 Brand+Theme
// tier). CRUD over SiteTheme rows + `apply`, which loads a saved theme's
// presentation + base preset into the working draft (theme_key + draftSettings)
// without publishing. Distinct from the read-only platform presets returned by
// themeService.listThemes() — those stay code-first in @sparx/storefront-themes.
//
// Tenant-scoped via withTenant; SiteTheme is ENABLE+FORCE RLS, so a findUnique
// by a cross-tenant id returns null → ownership is enforced (NotFound), the same
// guarantee pageLayoutService relies on.

import {
  CreateSavedThemeInput,
  UpdateSavedThemeInput,
  type PresentationOverlay,
} from '@sparx/sitebuilder-schemas';
import type { SiteTheme } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError } from '../errors';
import { getOrCreateConfig } from './_config';

export interface SavedThemeView {
  id: string;
  name: string;
  basePresetKey: string;
  presentation: PresentationOverlay;
  createdAt: string;
  updatedAt: string;
}

function toView(row: SiteTheme): SavedThemeView {
  return {
    id: row.id,
    name: row.name,
    basePresetKey: row.basePresetKey,
    presentation: (row.presentation ?? {}) as PresentationOverlay,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function list(ctx: ServiceContext): Promise<SavedThemeView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.siteTheme.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toView);
  });
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<SavedThemeView> {
  const input = CreateSavedThemeInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const row = await tx.siteTheme.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        basePresetKey: input.basePresetKey,
        presentation: input.presentation,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.theme.saved',
      entityType: 'SiteTheme',
      entityId: row.id,
      diff: { after: { name: row.name, basePresetKey: row.basePresetKey } },
    });
    return toView(row);
  });
}

export async function update(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<SavedThemeView> {
  const input = UpdateSavedThemeInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const existing = await tx.siteTheme.findUnique({ where: { id } });
    if (!existing) throw new SitebuilderNotFoundError('SiteTheme', id);
    const row = await tx.siteTheme.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.presentation !== undefined ? { presentation: input.presentation } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.theme.updated',
      entityType: 'SiteTheme',
      entityId: row.id,
      diff: { before: { name: existing.name }, after: { name: row.name } },
    });
    return toView(row);
  });
}

export async function remove(ctx: ServiceContext, id: string): Promise<{ id: string }> {
  return withTenant(ctx, async (tx) => {
    const existing = await tx.siteTheme.findUnique({ where: { id } });
    if (!existing) throw new SitebuilderNotFoundError('SiteTheme', id);
    await tx.siteTheme.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.theme.deleted',
      entityType: 'SiteTheme',
      entityId: id,
      diff: { before: { name: existing.name } },
    });
    return { id };
  });
}

// Load a saved theme into the working draft: set theme_key = basePresetKey and
// merge its presentation into draftSettings (preserving tokens/customCss). Does
// NOT publish — the merchant publishes or schedules afterward. The published
// snapshot picks it up because publish reads the draft.
export async function apply(
  ctx: ServiceContext,
  id: string
): Promise<{ ok: true; themeKey: string }> {
  return withTenant(ctx, async (tx) => {
    const theme = await tx.siteTheme.findUnique({ where: { id } });
    if (!theme) throw new SitebuilderNotFoundError('SiteTheme', id);
    const config = await getOrCreateConfig(tx, ctx.tenantId);
    const draft = (config.draftSettings ?? {}) as Record<string, unknown>;
    await tx.siteConfig.update({
      where: { tenantId: ctx.tenantId },
      data: {
        themeKey: theme.basePresetKey,
        draftSettings: { ...draft, presentation: theme.presentation },
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.theme.applied',
      entityType: 'SiteTheme',
      entityId: theme.id,
      diff: { after: { themeKey: theme.basePresetKey } },
    });
    return { ok: true, themeKey: theme.basePresetKey };
  });
}
