// storefrontService — per-tenant storefront settings + theme tokens.
//
// Sitebuilder owns layout; this service owns the commerce-relevant
// defaults (currency, channels, abandonment threshold, theme overrides).
//
// Both settings and theme are one-row-per-tenant (tenantId is the
// primary key) so reads and upserts are point lookups. RLS enforces
// per-tenant isolation regardless.

import { UpdateStorefrontSettingsInput, UpdateStorefrontThemeInput } from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';

export interface StorefrontSettings {
  defaultCurrency: string;
  defaultLocale: string;
  defaultWarehouseId: string | null;
  channelsEnabled: string[];
  cartAbandonmentMinutes: number;
  showStockBelow: number;
  hidePricesWhenSignedOut: boolean;
  requireAuthForCheckout: boolean;
}

const DEFAULTS: StorefrontSettings = {
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
  defaultWarehouseId: null,
  channelsEnabled: ['storefront'],
  cartAbandonmentMinutes: 120,
  showStockBelow: 10,
  hidePricesWhenSignedOut: false,
  requireAuthForCheckout: false,
};

export async function getSettings(ctx: ServiceContext): Promise<StorefrontSettings> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.storefrontSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    if (!row) return DEFAULTS;
    return {
      defaultCurrency: row.defaultCurrency,
      defaultLocale: row.defaultLocale,
      defaultWarehouseId: row.defaultWarehouseId,
      channelsEnabled: Array.isArray(row.channelsEnabled)
        ? (row.channelsEnabled as string[])
        : DEFAULTS.channelsEnabled,
      cartAbandonmentMinutes: row.cartAbandonmentMinutes,
      showStockBelow: row.showStockBelow,
      hidePricesWhenSignedOut: row.hidePricesWhenSignedOut,
      requireAuthForCheckout: row.requireAuthForCheckout,
    };
  });
}

export async function updateSettings(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = UpdateStorefrontSettingsInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const before = await tx.storefrontSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    await tx.storefrontSettings.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        defaultCurrency: input.defaultCurrency,
        defaultLocale: input.defaultLocale,
        defaultWarehouseId: input.defaultWarehouseId ?? null,
        channelsEnabled: input.channelsEnabled,
        cartAbandonmentMinutes: input.cartAbandonmentMinutes,
        showStockBelow: input.showStockBelow,
        hidePricesWhenSignedOut: input.hidePricesWhenSignedOut,
        requireAuthForCheckout: input.requireAuthForCheckout,
      },
      update: {
        defaultCurrency: input.defaultCurrency,
        defaultLocale: input.defaultLocale,
        defaultWarehouseId: input.defaultWarehouseId ?? null,
        channelsEnabled: input.channelsEnabled,
        cartAbandonmentMinutes: input.cartAbandonmentMinutes,
        showStockBelow: input.showStockBelow,
        hidePricesWhenSignedOut: input.hidePricesWhenSignedOut,
        requireAuthForCheckout: input.requireAuthForCheckout,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: before
        ? 'commerce.storefront.settings.updated'
        : 'commerce.storefront.settings.created',
      entityType: 'StorefrontSettings',
      entityId: ctx.tenantId,
      diff: { before: before as Record<string, unknown> | null, after: input },
    });
  });
}

// Presentation-only theme overrides. Brand identity (primary/accent colour,
// typography, logo, favicon) is owned by the tenant-level brand (docs/30 §6) and
// is NOT stored here — those columns were removed in migration 20260610000200.
export async function getTheme(ctx: ServiceContext): Promise<Record<string, string | null>> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.storefrontTheme.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    const empty: Record<string, string | null> = {};
    if (!row) return empty;
    return {
      colorBackground: row.colorBackground,
      colorMuted: row.colorMuted,
      radiusBase: row.radiusBase,
    };
  });
}

export async function updateTheme(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = UpdateStorefrontThemeInput.parse(rawInput);

  // Strip undefined keys so an upsert doesn't blow away an existing
  // value the user didn't touch — the form only sends the fields that
  // changed.
  const cleanTokens: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(input.tokens)) {
    cleanTokens[key] = value ?? null;
  }

  await withTenant(ctx, async (tx) => {
    await tx.storefrontTheme.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...cleanTokens },
      update: cleanTokens,
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.storefront.theme.updated',
      entityType: 'StorefrontTheme',
      entityId: ctx.tenantId,
      diff: { after: cleanTokens },
    });
  });
}
