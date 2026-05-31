// Storefront-level settings and theme token overrides. Sitebuilder owns
// layout + page composition; Commerce owns the commerce-side defaults
// (currency, default warehouse, channel toggles) and the per-tenant theme
// token overrides applied on top of the @sparx/ui storefront variants.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { Channel, Currency } from './common';

export const UpdateStorefrontSettingsInput = z.object({
  defaultCurrency: Currency,
  defaultLocale: z.string().min(2).max(10).default('en-US'),
  defaultWarehouseId: Uuid.optional(),
  channelsEnabled: z.array(Channel).default(['storefront']),
  // Cart abandonment threshold in minutes (default 120 — PRD §3 cart
  // abandonment definition).
  cartAbandonmentMinutes: z
    .number()
    .int()
    .min(15)
    .max(60 * 24 * 30)
    .default(120),
  // Storefront-wide guardrails surfaced as defaults at checkout.
  showStockBelow: z.number().int().nonnegative().default(10),
  hidePricesWhenSignedOut: z.boolean().default(false),
  requireAuthForCheckout: z.boolean().default(false),
});
export type UpdateStorefrontSettingsInput = z.infer<typeof UpdateStorefrontSettingsInput>;

// Theme tokens — the PRESENTATION-only subset a tenant can override on the
// storefront without touching Sitebuilder. Brand IDENTITY (primary/accent
// colour, typography, logo, favicon) is owned by the tenant-level brand
// (docs/30 §6) and is NOT settable here — those columns were removed from
// StorefrontTheme in migration 20260610000200. Anything beyond presentation
// goes through Sitebuilder's theme editor / the Brand panel.
export const StorefrontThemeTokens = z
  .object({
    colorBackground: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    colorMuted: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    radiusBase: z
      .string()
      .regex(/^\d+(?:\.\d+)?(?:px|rem|em)$/)
      .optional(),
  })
  .partial();
export type StorefrontThemeTokens = z.infer<typeof StorefrontThemeTokens>;

export const UpdateStorefrontThemeInput = z.object({
  tokens: StorefrontThemeTokens,
});
export type UpdateStorefrontThemeInput = z.infer<typeof UpdateStorefrontThemeInput>;
