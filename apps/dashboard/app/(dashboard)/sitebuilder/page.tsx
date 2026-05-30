import Link from 'next/link';
import { Badge, Card, Heading, Text } from '@sparx/ui';
import { getConfig, listThemes } from './_lib/api';

const SECTIONS = [
  { href: '/sitebuilder/design', title: 'Design', desc: 'Theme, colors, fonts, and live preview.' },
  {
    href: '/sitebuilder/themes',
    title: 'Themes',
    desc: 'Switch between curated storefront themes.',
  },
  {
    href: '/sitebuilder/homepage',
    title: 'Homepage',
    desc: 'Compose your homepage from sections.',
  },
  { href: '/sitebuilder/pages', title: 'Pages', desc: 'Build section-based landing pages.' },
  {
    href: '/sitebuilder/navigation',
    title: 'Navigation',
    desc: 'Header, footer, and announcement bar.',
  },
  {
    href: '/sitebuilder/publishing',
    title: 'Publishing',
    desc: 'Version history, rollback, and schedules.',
  },
];

export default async function SitebuilderOverview() {
  const [config, themes] = await Promise.all([getConfig(), listThemes()]);
  const theme = themes.find((t) => t.key === config.themeKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level={1}>Site Builder</Heading>
          <Text variant="muted">Design and publish your storefront.</Text>
        </div>
        {config.publishedVersionId ? (
          <Badge variant="success">Published</Badge>
        ) : (
          <Badge variant="secondary">Not published</Badge>
        )}
      </div>

      <Card variant="module" padding="md">
        <Text size="xs" variant="muted">
          Active theme
        </Text>
        <Heading level={3}>{theme?.name ?? config.themeKey}</Heading>
        <Text variant="muted">{theme?.description}</Text>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card
              variant="module"
              padding="md"
              className="h-full hover:border-[var(--module-active)]"
            >
              <Heading level={4}>{s.title}</Heading>
              <Text variant="muted">{s.desc}</Text>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
