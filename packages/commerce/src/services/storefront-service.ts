// storefrontService — per-tenant storefront settings + theme tokens.
// Sitebuilder owns layout; this service owns the commerce-relevant
// defaults (currency, channels, abandonment threshold, theme overrides).

import type {
  UpdateStorefrontSettingsInput,
  UpdateStorefrontThemeInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

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

export function getSettings(_ctx: ServiceContext): Promise<StorefrontSettings> {
  return notImplemented('storefrontService.getSettings');
}

export function updateSettings(
  _ctx: ServiceContext,
  _input: UpdateStorefrontSettingsInput
): Promise<void> {
  return notImplemented('storefrontService.updateSettings');
}

export function getTheme(_ctx: ServiceContext): Promise<Record<string, string | null>> {
  return notImplemented('storefrontService.getTheme');
}

export function updateTheme(
  _ctx: ServiceContext,
  _input: UpdateStorefrontThemeInput
): Promise<void> {
  return notImplemented('storefrontService.updateTheme');
}
