import { Heading, Text } from '@sparx/ui';
import {
  getConfig,
  listSampleProducts,
  listSectionsByTemplate,
  listTemplates,
  listVersions,
} from '../_lib/api';
import { LayoutScopeEditor } from '../_components/layout-scope-editor';
import { PublishBar } from '../_components/publish-bar';

// Product page layout (Phase 3 §7). One `product`-scope layout that every
// product page renders through. Until a merchant clicks "Customize", no template
// rows exist and the storefront falls back to the seeded code default — so the
// editor shows that default read-only with the CTA. The shared canvas previews a
// sample product so the bound sections render against real data.
export default async function ProductLayoutPage() {
  const [templates, samples, config, versions] = await Promise.all([
    listTemplates('product'),
    listSampleProducts(),
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
        scope="product"
        templateId={template?.id ?? null}
        sections={sections}
        samples={samples}
      />
    </div>
  );
}
