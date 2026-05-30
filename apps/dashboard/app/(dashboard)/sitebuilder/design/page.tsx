import { Heading, Text } from '@sparx/ui';
import { getConfig, getTenant, listThemes, listVersions } from '../_lib/api';
import { Customizer } from '../_components/customizer';

const STOREFRONT_URL = process.env.SPARX_STOREFRONT_URL ?? 'http://localhost:3200';

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
        storefrontUrl={STOREFRONT_URL}
        slug={tenant.slug}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
    </div>
  );
}
