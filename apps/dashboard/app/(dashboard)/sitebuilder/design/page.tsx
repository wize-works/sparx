import { getBrand, getConfig, listThemes, listVersions } from '../_lib/api';
import { ThemeInspector } from '../_components/theme-inspector';

// Theme scope. Renders in the editor shell's inspector column; the persistent
// canvas (mounted in the layout) shows the live storefront, and the inspector
// streams compiled v2 theme CSS to it as the merchant edits.
export default async function DesignPage() {
  const [config, themes, brand, versions] = await Promise.all([
    getConfig(),
    listThemes(),
    getBrand(),
    listVersions(),
  ]);

  // Unpublished changes: the draft has been touched since the live version.
  const published = versions.find((v) => v.id === config.publishedVersionId);
  const hasUnpublishedChanges = published
    ? new Date(config.updatedAt) > new Date(published.createdAt)
    : false;

  return (
    <ThemeInspector
      config={config}
      themes={themes}
      brand={brand}
      isPublished={config.publishedVersionId !== null}
      hasUnpublishedChanges={hasUnpublishedChanges}
    />
  );
}
