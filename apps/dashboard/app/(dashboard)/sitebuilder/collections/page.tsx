import { Heading, Text } from '@sparx/ui';
import {
  getConfig,
  listSampleCollections,
  listSectionsByTemplate,
  listTemplates,
  listVersions,
} from '../_lib/api';
import { LayoutScopeEditor } from '../_components/layout-scope-editor';
import { PublishBar } from '../_components/publish-bar';

// Collection page layout (Phase 3 §7). One `collection`-scope layout shared by
// every collection page. Mirrors the product layout: seeded default read-only
// until "Customize", then a normal editable section list; the shared canvas
// previews a sample collection.
export default async function CollectionLayoutPage() {
  const [templates, samples, config, versions] = await Promise.all([
    listTemplates('collection'),
    listSampleCollections(),
    getConfig(),
    listVersions(),
  ]);
  const template = templates.find((t) => t.key === 'default') ?? null;
  const sections = template ? await listSectionsByTemplate(template.id) : [];
  const published = versions.find((v) => v.id === config.publishedVersionId);
  const hasUnpublishedChanges = published
    ? new Date(config.updatedAt) > new Date(published.createdAt)
    : sections.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Collection pages</Heading>
        <Text variant="muted">
          One layout shared by every collection page. Bound sections fill in each collection&apos;s
          header and products automatically.
        </Text>
      </div>
      <PublishBar
        isPublished={config.publishedVersionId !== null}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
      <LayoutScopeEditor
        scope="collection"
        templateId={template?.id ?? null}
        sections={sections}
        samples={samples}
      />
    </div>
  );
}
