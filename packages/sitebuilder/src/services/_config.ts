// Shared helper — lazily materialize the per-tenant SiteConfig row.
//
// A tenant gets a SiteConfig the first time they touch the Site Builder
// (select a theme, add a section, open the customizer). Defaulting lazily
// keeps tenants who never use the module out of the table.

import type { SiteConfig, TxClient } from '@sparx/db';
import { DEFAULT_THEME_KEY } from '@sparx/storefront-themes';

export async function getOrCreateConfig(tx: TxClient, tenantId: string): Promise<SiteConfig> {
  const existing = await tx.siteConfig.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return tx.siteConfig.create({
    data: {
      tenantId,
      themeKey: DEFAULT_THEME_KEY,
      appearancePolicy: 'light-only',
      draftSettings: { tokens: { light: {}, dark: {} }, customCss: '' },
    },
  });
}
