import { Heading, Text } from '@sparx/ui';
import { getConfig, getTenant, listThemes, listVersions } from '../_lib/api';
import { Customizer } from '../_components/customizer';

// Where the live-preview iframe points. Tenant storefronts run at
// <slug>.sparx.zone in prod (same convention the CMS preview link uses).
// `SPARX_STOREFRONT_URL` is a local-dev override only — set it to
// http://localhost:3200 when running the storefront locally, since
// *.sparx.zone doesn't resolve on a laptop. It is intentionally unset in
// prod so we never fall back to localhost (which trips the browser's
// "access other apps on this device" prompt and refuses to connect).
const ZONE_DOMAIN = process.env.NEXT_PUBLIC_SPARX_ZONE_DOMAIN ?? 'sparx.zone';

function storefrontOrigin(slug: string): string {
  const devOverride = process.env.SPARX_STOREFRONT_URL;
  if (devOverride) return devOverride;
  return `https://${slug}.${ZONE_DOMAIN}`;
}

export default async function DesignPage() {
  const [config, themes, tenant, versions] = await Promise.all([
    getConfig(),
    listThemes(),
    getTenant(),
    listVersions(),
  ]);

  // Unpublished changes: the draft has been touched since the live version.
  const published = versions.find((v) => v.id === config.publishedVersionId);
  const hasUnpublishedChanges = published
    ? new Date(config.updatedAt) > new Date(published.createdAt)
    : false;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Design</Heading>
        <Text variant="muted">Customize your theme and preview changes live.</Text>
      </div>
      <Customizer
        config={config}
        themes={themes}
        storefrontUrl={storefrontOrigin(tenant.slug)}
        slug={tenant.slug}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
    </div>
  );
}
