import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { ArrowRight, Layers, Plus } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../_components/cms-tabs';

export const dynamic = 'force-dynamic';

interface ApiMenu {
  id: string;
  location: string;
  name: string;
  // api-rest /v1/navigation/menus returns items as a FLAT list spanning every
  // depth (Prisma include is non-recursive — children + parents come back in
  // the same array). We filter to top-level for the listing count so the
  // number on this page matches the "{n} top-level items" the editor shows
  // (audit UX-11).
  items: { id: string; parentItemId: string | null }[];
}

function topLevelCount(items: ApiMenu['items']): number {
  return items.filter((i) => i.parentItemId === null).length;
}

const PRESET_LOCATIONS: { location: string; label: string; description: string }[] = [
  { location: 'header', label: 'Header', description: 'Top primary nav.' },
  { location: 'footer', label: 'Footer', description: 'Site-wide footer links.' },
  { location: 'mega', label: 'Mega menu', description: 'Categorised drop-down.' },
];

export default async function NavigationMenusPage() {
  const menus = await api.get<ApiMenu[]>('/v1/navigation/menus');
  const byLocation = new Map(menus.map((m) => [m.location, m]));

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="navigation" />
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Layers className="h-5 w-5" />
            <Heading level={1}>Navigation</Heading>
            <Badge variant="outline">{menus.length}</Badge>
          </Stack>
          <Text variant="muted">
            Edit the header, footer, and mega menu trees. Each item can link to a published entry or
            an external URL — never both.
          </Text>
        </Stack>

        <Stack gap={3}>
          {PRESET_LOCATIONS.map(({ location, label, description }) => {
            const existing = byLocation.get(location);
            return (
              <Card key={location} variant="module">
                <CardHeader>
                  <Stack direction="row" align="center" justify="between">
                    <Stack gap={1}>
                      <Stack direction="row" align="center" gap={2}>
                        <Heading level={3}>{label}</Heading>
                        <code className="text-xs text-[var(--color-text-tertiary)]">
                          /{location}
                        </code>
                      </Stack>
                      <CardDescription>{description}</CardDescription>
                    </Stack>
                    <Button asChild variant="module" size="sm">
                      <Link href={`/cms/navigation/${location}`}>
                        {existing ? 'Edit' : 'Create'}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </Stack>
                </CardHeader>
                {existing &&
                  (() => {
                    const topCount = topLevelCount(existing.items);
                    return (
                      <CardContent>
                        <Text size="sm" variant="muted">
                          {topCount} top-level item{topCount === 1 ? '' : 's'} ·{' '}
                          <strong>{existing.name}</strong>
                        </Text>
                      </CardContent>
                    );
                  })()}
              </Card>
            );
          })}
        </Stack>

        {menus.filter((m) => !PRESET_LOCATIONS.some((p) => p.location === m.location)).length >
          0 && (
          <Stack gap={2}>
            <Heading level={3}>Custom menus</Heading>
            <Stack gap={2}>
              {menus
                .filter((m) => !PRESET_LOCATIONS.some((p) => p.location === m.location))
                .map((m) => (
                  <Card key={m.id} variant="module">
                    <CardHeader>
                      <Stack direction="row" align="center" justify="between">
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
                    </CardHeader>
                  </Card>
                ))}
            </Stack>
          </Stack>
        )}

        <Card variant="module">
          <CardHeader>
            <Heading level={4}>Custom location</Heading>
            <CardDescription>
              Use a unique URL-safe key like <code>custom_sidebar</code> to spin up a fresh menu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="module-outline" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/cms/navigation/custom">New custom menu</Link>
            </Button>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
