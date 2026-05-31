import { Heading, Text } from '@sparx/ui';
import { getBrand, resolveMediaUrl } from '../_lib/api';
import { BrandPanel } from '../_components/brand-panel';

// Brand — the tenant-level source of truth for identity (docs/30 §6). Edited
// here in the Site Builder, but owned above every module: email, CRM and the
// storefront theme all read it and none may override it. Logo/favicon ids are
// resolved to preview URLs server-side so the board renders on first paint.
export default async function BrandPage() {
  const brand = await getBrand();
  const [logoLight, logoDark, favicon] = await Promise.all([
    resolveMediaUrl(brand.logoLightMediaId),
    resolveMediaUrl(brand.logoDarkMediaId),
    resolveMediaUrl(brand.faviconMediaId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Brand</Heading>
        <Text variant="muted">
          Your identity — logo, colors, and type — read across the storefront, email, and everywhere
          your business appears. Set it once; every surface reads it.
        </Text>
      </div>
      <BrandPanel initial={brand} initialMedia={{ logoLight, logoDark, favicon }} />
    </div>
  );
}
