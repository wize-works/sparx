import { getBrand, getConfig, listSavedThemes, resolveMediaUrl } from '../_lib/api';
import { ThemeCenter } from '../_components/theme-center';

// Brand & Theme — the merged "Look" surface (docs/30 Brand+Theme, docs/33 token
// model v2). Tenant identity (the source of truth, read by email/CRM/storefront)
// and the storefront presentation overlay edited in one screen, with a live
// component showcase. Logo/favicon ids resolve to preview URLs server-side so
// the showcase renders on first paint; saved themes degrade to empty until the
// /v1/sitebuilder/saved-themes backend lands.
export default async function BrandPage() {
  const [brand, config, savedThemes] = await Promise.all([
    getBrand(),
    getConfig(),
    listSavedThemes(),
  ]);
  const [logoLight, logoDark, favicon] = await Promise.all([
    resolveMediaUrl(brand.logoLightMediaId),
    resolveMediaUrl(brand.logoDarkMediaId),
    resolveMediaUrl(brand.faviconMediaId),
  ]);

  return (
    <ThemeCenter
      brand={brand}
      config={config}
      savedThemes={savedThemes}
      media={{ logoLight, logoDark, favicon }}
    />
  );
}
