import { Heading, Text } from '@sparx/ui';
import { getConfig, listSectionsByPageLayout, listVersions, resolvePageLayout } from '../_lib/api';
import { SectionBuilder } from '../_components/section-builder';
import { PublishBar } from '../_components/publish-bar';

// Homepage composition. Renders in the editor shell's inspector column; the
// shared persistent canvas (in the /sitebuilder layout) shows the live home page
// and the section editor drives it (select / reorder / edit → reload). The
// homepage is the `site:home` target's page layout; we resolve it (idempotent)
// so the editor addresses sections by pageLayoutId.
export default async function HomepagePage() {
  const [pageLayout, config, versions] = await Promise.all([
    resolvePageLayout('site:home'),
    getConfig(),
    listVersions(),
  ]);
  const sections = await listSectionsByPageLayout(pageLayout.id);
  const published = versions.find((v) => v.id === config.publishedVersionId);
  const hasUnpublishedChanges = published
    ? new Date(config.updatedAt) > new Date(published.createdAt)
    : sections.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Homepage</Heading>
        <Text variant="muted">Compose your homepage from sections. Drag to reorder.</Text>
      </div>
      <PublishBar
        isPublished={config.publishedVersionId !== null}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
      <SectionBuilder
        pageLayoutId={pageLayout.id}
        targetId="site:home"
        sections={sections}
        previewPath="/"
      />
    </div>
  );
}
