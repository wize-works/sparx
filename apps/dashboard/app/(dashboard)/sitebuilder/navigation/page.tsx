import Link from 'next/link';
import { Button, Card, Heading, Stack, Text } from '@sparx/ui';
import { ArrowRight, Plus } from 'lucide-react';
import { listLayout, listMenus } from '../_lib/api';
import type { NavMenuDto } from '../_lib/types';
import { LayoutEditor } from '../_components/layout-editor';

export const dynamic = 'force-dynamic';

const PRESET_LOCATIONS: { location: string; label: string; description: string }[] = [
  { location: 'header', label: 'Header', description: 'Top primary nav.' },
  { location: 'footer', label: 'Footer', description: 'Site-wide footer links.' },
  { location: 'mega', label: 'Mega menu', description: 'Categorised drop-down.' },
];

function topLevelCount(items: NavMenuDto['items']): number {
  return items.filter((i) => i.parentItemId === null).length;
}

export default async function NavigationPage() {
  const [blocks, menus] = await Promise.all([listLayout(), listMenus()]);
  const byLocation = new Map(menus.map((m) => [m.location, m]));
  const customMenus = menus.filter((m) => !PRESET_LOCATIONS.some((p) => p.location === m.location));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level={1}>Navigation &amp; layout</Heading>
        <Text variant="muted">
          Build your menu trees, then wire them into the header, footer, and announcement bar.
          Publish from Design or Homepage to go live.
        </Text>
      </div>

      <Stack gap={4}>
        <Heading level={2}>Menus</Heading>
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
                  <Button asChild variant="module" size="sm">
                    <Link href={`/sitebuilder/navigation/${location}`}>
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
                      <Link href={`/sitebuilder/navigation/${m.location}`}>Edit</Link>
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
            variant="module-outline"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
          >
            <Link href="/sitebuilder/navigation/custom">New custom menu</Link>
          </Button>
        </div>
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>Header, footer &amp; announcement</Heading>
        <Text variant="muted">
          Appearance for each layout slot, plus which menu the header and footer use.
        </Text>
        <LayoutEditor blocks={blocks} menus={menus} />
      </Stack>
    </div>
  );
}
