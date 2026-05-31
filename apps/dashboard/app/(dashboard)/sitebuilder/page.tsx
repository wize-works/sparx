import Link from 'next/link';
import { Badge, Button, Card, Heading, Stack, Text } from '@sparx/ui';
import { getConfig, listThemes } from './_lib/api';

// Site Builder Overview — the module root (the contextual panel's "Overview"
// entry). It renders in the editor shell's inspector column, with the live
// storefront preview beside it; scope editing happens in the sibling routes
// reached from the module nav. Kept slim to fit the inspector width.
export default async function SitebuilderOverview() {
  const [config, themes] = await Promise.all([getConfig(), listThemes()]);
  const theme = themes.find((t) => t.key === config.themeKey);
  const isPublished = config.publishedVersionId !== null;

  return (
    <Stack gap={6}>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Heading level={1}>Site Builder</Heading>
          {isPublished ? (
            <Badge color="success">Published</Badge>
          ) : (
            <Badge color="neutral">Draft</Badge>
          )}
        </div>
        <Text variant="muted">
          Your storefront at a glance — the live preview is shown alongside. Pick a section from the
          left to edit it.
        </Text>
      </div>

      <Card variant="module" padding="md">
        <Text size="xs" variant="muted">
          Active theme
        </Text>
        <Heading level={4}>{theme?.name ?? config.themeKey}</Heading>
        {theme?.description ? (
          <Text variant="muted" size="sm">
            {theme.description}
          </Text>
        ) : null}
      </Card>

      <Stack gap={2}>
        <Button asChild shape="block">
          <Link href="/sitebuilder/design">Edit theme &amp; design</Link>
        </Button>
        <Button asChild variant="outline" shape="block">
          <Link href="/sitebuilder/pages">Manage pages</Link>
        </Button>
        <Button asChild variant="outline" shape="block">
          <Link href="/sitebuilder/brand">Edit brand</Link>
        </Button>
        <Button asChild variant="ghost" shape="block">
          <Link href="/sitebuilder/publishing">
            {isPublished ? 'Publishing & versions' : 'Publish your site'}
          </Link>
        </Button>
      </Stack>
    </Stack>
  );
}
