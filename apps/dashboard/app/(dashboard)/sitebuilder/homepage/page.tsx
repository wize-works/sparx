import { Heading, Text } from '@sparx/ui';
import { getConfig, listSections, listVersions } from '../_lib/api';
import { SectionBuilder } from '../_components/section-builder';
import { PublishBar } from '../_components/publish-bar';

export default async function HomepagePage() {
  const [config, sections, versions] = await Promise.all([
    getConfig(),
    listSections('home'),
    listVersions(),
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
          Compose your homepage from sections. Drag order with the arrows; publish when ready.
        </Text>
      </div>
      <PublishBar
        isPublished={config.publishedVersionId !== null}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
      <SectionBuilder pageKey="home" sections={sections} />
    </div>
  );
}
