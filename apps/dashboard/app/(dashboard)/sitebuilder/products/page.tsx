import { Heading, Text } from '@sparx/ui';
import { getConfig, listPageLayouts, listSectionsByPageLayout, listVersions } from '../_lib/api';
import { LayoutScopeEditor } from '../_components/layout-scope-editor';
import { PublishBar } from '../_components/publish-bar';

// Product page layout (doc 36 §5, Phase 3 §7). One `product`-scope layout that
// every product page renders through. Until a merchant clicks "Customize", no
// layout rows exist and the storefront falls back to the seeded code default — so
// the editor shows that default read-only with the CTA. The shared canvas previews
// the layout against sample product data (doc 36 §9).
export default async function ProductLayoutPage() {
  const [pageLayouts, config, versions] = await Promise.all([
    listPageLayouts('commerce:product'),
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
        <Heading level={1}>Product pages</Heading>
        <Text variant="muted">
          One layout shared by every product page. Bound sections fill in each product&apos;s own
          details automatically.
        </Text>
      </div>
      <PublishBar
        isPublished={config.publishedVersionId !== null}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
      <LayoutScopeEditor
        targetId="commerce:product"
        pageLayoutId={pageLayout?.id ?? null}
        sections={sections}
      />
    </div>
  );
}
