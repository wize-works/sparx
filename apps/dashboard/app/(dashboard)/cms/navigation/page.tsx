import Link from 'next/link';
import { Button, Card, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowRight, Plus } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../_components/cms-tabs';

// Navigation menus are CMS-owned content (docs/30 §8): the merchant builds the
// header / footer / mega / custom menu trees here. Site Builder consumes them
// read-only — it binds a menu into a layout slot under /sitebuilder/navigation.

export const dynamic = 'force-dynamic';

// api-rest returns menu items as a flat list spanning every depth; the listing
// only needs top-level counts, so we keep `parentItemId` to filter.
interface NavMenu {
  id: string;
  location: string;
  name: string;
  items: { id: string; parentItemId: string | null }[];
}

const PRESET_LOCATIONS: { location: string; label: string; description: string }[] = [
  { location: 'header', label: 'Header', description: 'Top primary nav.' },
  { location: 'footer', label: 'Footer', description: 'Site-wide footer links.' },
  { location: 'mega', label: 'Mega menu', description: 'Categorised drop-down.' },
];

function topLevelCount(items: NavMenu['items']): number {
  return items.filter((i) => i.parentItemId === null).length;
}

export default async function CmsNavigationPage() {
  const menus = await api.get<NavMenu[]>('/v1/navigation/menus');
  const byLocation = new Map(menus.map((m) => [m.location, m]));
  const customMenus = menus.filter((m) => !PRESET_LOCATIONS.some((p) => p.location === m.location));

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CmsTabs current="navigation" />
        <Stack gap={2}>
          <Heading level={1}>Navigation</Heading>
          <Text variant="muted">
            Build your menu trees. Site Builder wires them into the header, footer, and announcement
            bar under its Header &amp; footer settings.
          </Text>
        </Stack>

        <div className="grid gap-3">
          {PRESET_LOCATIONS.map(({ location, label, description }) => {
            const existing = byLocation.get(location);
            const count = existing ? topLevelCount(existing.items) : 0;
            return (
              <Card key={location} variant="module" padding="md">
                <Stack direction="row" align="center" justify="between" gap={3}>
                  <Stack gap={1}>
                    <Stack direction="row" align="center" gap={2}>
                      <Heading level={4}>{label}</Heading>
                      <code className="text-xs text-[var(--color-text-tertiary)]">/{location}</code>
                    </Stack>
                    <Text size="sm" variant="muted">
                      {existing
                        ? `${count} top-level item${count === 1 ? '' : 's'} · ${existing.name}`
                        : description}
                    </Text>
                  </Stack>
                  <Button asChild color="module" size="sm">
                    <Link href={`/cms/navigation/${location}`}>
                      {existing ? 'Edit' : 'Create'}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </Stack>
              </Card>
            );
          })}
        </div>

        {customMenus.length > 0 && (
          <Stack gap={2}>
            <Heading level={4}>Custom menus</Heading>
            <div className="grid gap-2">
              {customMenus.map((m) => (
                <Card key={m.id} variant="module" padding="md">
                  <Stack direction="row" align="center" justify="between" gap={3}>
                    <Stack gap={1}>
                      <Heading level={4}>{m.name}</Heading>
                      <code className="text-xs text-[var(--color-text-tertiary)]">
                        /{m.location}
                      </code>
                    </Stack>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/cms/navigation/${m.location}`}>Edit</Link>
                    </Button>
                  </Stack>
                </Card>
              ))}
            </div>
          </Stack>
        )}

        <div>
          <Button
            asChild
            color="module"
            variant="outline"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
          >
            <Link href="/cms/navigation/custom">New custom menu</Link>
          </Button>
        </div>
      </Stack>
    </Container>
  );
}
