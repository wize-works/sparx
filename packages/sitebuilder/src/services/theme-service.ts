// themeService — theme catalog + per-tenant theme selection and settings.
//
// listThemes/getThemeSchema are static (no tenant). selectTheme/updateSettings
// mutate the draft SiteConfig; they do NOT publish — changes go live only when
// publishService.publishNow runs.

import { SelectThemeInput, UpdateSettingsInput } from '@sparx/sitebuilder-schemas';
import type { SiteConfig } from '@sparx/db';
import { withTenant } from '@sparx/db';
import { getTheme, THEME_LIST, type ThemePreset } from '@sparx/storefront-themes';

import { writeAuditLog } from '../audit';
import { publishSitebuilderEvent } from '../events';
import type { ServiceContext } from '../errors';
import { getOrCreateConfig } from './_config';

// ── Static catalog (no tenant) ──────────────────────────────────────────────

export function listThemes(): ThemePreset[] {
  return THEME_LIST;
}

export function getThemeSchema(themeKey: string): ThemePreset['settingsSchema'] {
  return getTheme(themeKey).settingsSchema;
}

// ── Per-tenant config ───────────────────────────────────────────────────────

export function getConfig(ctx: ServiceContext): Promise<SiteConfig> {
  return withTenant(ctx, (tx) => getOrCreateConfig(tx, ctx.tenantId));
}

export async function selectTheme(ctx: ServiceContext, rawInput: unknown): Promise<SiteConfig> {
  const input = SelectThemeInput.parse(rawInput);
  const updated = await withTenant(ctx, async (tx) => {
    const config = await getOrCreateConfig(tx, ctx.tenantId);
    const next = await tx.siteConfig.update({
      where: { tenantId: ctx.tenantId },
      data: { themeKey: input.themeKey },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.theme.selected',
      entityType: 'SiteConfig',
      entityId: ctx.tenantId,
      diff: { before: { themeKey: config.themeKey }, after: { themeKey: next.themeKey } },
    });
    return next;
  });

  await publishSitebuilderEvent({
    tenantId: ctx.tenantId,
    topic: 'sitebuilder.theme_changed',
    payload: { themeKey: updated.themeKey },
    dedupeKey: `sitebuilder.theme_changed:${ctx.tenantId}:${updated.themeKey}`,
  });

  return updated;
}

export async function updateSettings(ctx: ServiceContext, rawInput: unknown): Promise<SiteConfig> {
  const input = UpdateSettingsInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const config = await getOrCreateConfig(tx, ctx.tenantId);
    if (input.settings === undefined && input.appearancePolicy === undefined) {
      return config;
    }
    return tx.siteConfig.update({
      where: { tenantId: ctx.tenantId },
      data: {
        ...(input.settings !== undefined ? { draftSettings: input.settings } : {}),
        ...(input.appearancePolicy !== undefined
          ? { appearancePolicy: input.appearancePolicy }
          : {}),
      },
    });
  });
}
