import { Heading, Text } from '@sparx/ui';
import { getConfig, listThemes } from '../_lib/api';
import { ThemeGallery } from '../_components/theme-gallery';

export default async function ThemesPage() {
  const [config, themes] = await Promise.all([getConfig(), listThemes()]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Themes</Heading>
        <Text variant="muted">
          Pick a starting point. Applying a theme keeps your content and updates colors, fonts, and
          layout. Fine-tune in Design.
        </Text>
      </div>
      <ThemeGallery themes={themes} current={config.themeKey} />
    </div>
  );
}
