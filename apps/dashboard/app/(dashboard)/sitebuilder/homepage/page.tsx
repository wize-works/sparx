import { Heading, Text } from '@sparx/ui';
import { getConfig, getSitePreviewToken, getTenant, listSections, listVersions } from '../_lib/api';
import { PageBuilder } from '../_components/page-builder';
import { PublishBar } from '../_components/publish-bar';
import { storefrontOrigin } from '../_lib/storefront';

export default async function HomepagePage() {
  const [config, sections, versions, tenant, previewToken] = await Promise.all([
    getConfig(),
    listSections('home'),
    listVersions(),
    getTenant(),
    getSitePreviewToken(),
  ]);
  const published = versions.find((v) => v.id === config.publishedVersionId);
  const hasUnpublishedChanges = published
    ? new Date(config.updatedAt) > new Date(published.createdAt)
    : sections.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Homepage</Heading>
        <Text variant="muted">
          Compose your homepage from sections. Drag to reorder; publish when ready.
        </Text>
      </div>
      <PublishBar
        isPublished={config.publishedVersionId !== null}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
      <PageBuilder
        pageKey="home"
        sections={sections}
        storefrontUrl={storefrontOrigin(tenant.slug)}
        slug={tenant.slug}
        previewToken={previewToken}
      />
    </div>
  );
}
