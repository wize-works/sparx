import { Heading, Text } from '@sparx/ui';
import { getConfig, listPageLayouts, listSectionsByPageLayout, listVersions } from '../_lib/api';
import { LayoutScopeEditor } from '../_components/layout-scope-editor';
import { PublishBar } from '../_components/publish-bar';

// Collection page layout (doc 36 §5, Phase 3 §7). One `collection`-scope layout
// shared by every collection page. Mirrors the product layout: seeded default
// read-only until "Customize", then a normal editable section list; the shared
// canvas previews the layout against sample collection data (doc 36 §9).
export default async function CollectionLayoutPage() {
  const [pageLayouts, config, versions] = await Promise.all([
    listPageLayouts('commerce:collection'),
    getConfig(),
    listVersions(),
  ]);
  const pageLayout = pageLayouts.find((l) => l.key === 'default') ?? null;
  const sections = pageLayout ? await listSectionsByPageLayout(pageLayout.id) : [];
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
        targetId="commerce:collection"
        pageLayoutId={pageLayout?.id ?? null}
        sections={sections}
      />
    </div>
  );
}
