import { Layers, Plus, Sparkles, Star } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  Container,
  EmptyState,
  Grid,
  PageHeader,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EntityCreateButton } from '../../_components/entity-create-button';
import { EntityRowLink } from '../../_components/entity-row-link';
import { ListToolbar } from '../../_components/list-toolbar';
import { getUserPreferences } from '../../_shell/preferences';

interface CollectionSummary {
  id: string;
  name: string;
  handle: string;
  type: 'manual' | 'rules';
  productCount: number;
  featured: boolean;
  updatedAt: string;
}

interface CollectionListResponse {
  items: CollectionSummary[];
  total: number;
}

// Collections — the merchandising surface ("Featured", "New for Spring",
// "Diesel Service Specials"). Two flavors: manual (hand-curated product
// list) and rules-driven (predicate evaluated by the commerce-indexer
// worker on a debounce).

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TYPE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'rules', label: 'Rules-driven' },
];

export default async function CollectionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const typeFilter = stringParam(params.type);
  const q = stringParam(params.q);

  const query = new URLSearchParams({ take: '100' });
  if (typeFilter === 'manual' || typeFilter === 'rules') query.set('type', typeFilter);
  if (q) query.set('q', q);

  const [{ items, total }, prefs] = await Promise.all([
    api.get<CollectionListResponse>(`/v1/commerce/collections?${query.toString()}`),
    getUserPreferences(),
  ]);
  const view = (stringParam(params.view) ?? prefs.defaultListView) === 'card' ? 'card' : 'table';

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Layers className="h-5 w-5" />}
          title="Collections"
          badge={
            <Badge color="module">
              {total} collection{total === 1 ? '' : 's'}
            </Badge>
          }
          description="Manual lists and rules-driven smart collections. Manual stays the same until you edit it; rules re-project on the next index flush (Phase 1.5 wires the indexer)."
          actions={
            <EntityCreateButton
              entityType="collection"
              newHref="/commerce/collections/new"
              color="module"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              New
            </EntityCreateButton>
          }
        />

        <ListToolbar
          searchPlaceholder="Search collections…"
          filters={[{ key: 'type', label: 'Types', options: TYPE_OPTIONS }]}
          enableViewToggle
        />

        {items.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title={total === 0 ? 'No collections yet' : 'No collections match these filters'}
              description={
                total === 0
                  ? 'Start with a hand-picked "Featured" list, then add rules-driven collections (best sellers, on sale, by tag) once you have a few products.'
                  : 'Adjust filters to broaden the results.'
              }
              action={
                total === 0 ? (
                  <EntityCreateButton
                    entityType="collection"
                    newHref="/commerce/collections/new"
                    color="module"
                    leftIcon={<Plus className="h-4 w-4" />}
                  >
                    New
                  </EntityCreateButton>
                ) : undefined
              }
            />
          </Card>
        ) : view === 'card' ? (
          <Grid minItemWidth="18rem" gap={4}>
            {items.map((c) => (
              <Card key={c.id} variant="module" padding="md">
                <Stack gap={3}>
                  <Stack direction="row" align="start" justify="between" gap={2}>
                    <Stack gap={1} className="min-w-0">
                      <EntityRowLink
                        href={`/commerce/collections/${c.id}`}
                        entityType="collection"
                        entityId={c.id}
                        className="truncate text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                      >
                        {c.name}
                      </EntityRowLink>
                      <Text size="xs" variant="muted">
                        /{c.handle}
                      </Text>
                    </Stack>
                    <Badge color={c.type === 'rules' ? 'module' : 'outline'} className="text-xs">
                      {c.type === 'rules' ? (
                        <>
                          <Sparkles className="mr-1 h-3 w-3" />
                          rules
                        </>
                      ) : (
                        'manual'
                      )}
                    </Badge>
                  </Stack>
                  <Stack direction="row" align="center" justify="between" gap={2}>
                    {c.featured ? (
                      <Badge variant="outline" className="text-xs">
                        <Star className="mr-1 h-3 w-3" />
                        featured
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <Text size="sm" className="tabular-nums">
                      {c.productCount} product{c.productCount === 1 ? '' : 's'}
                    </Text>
                  </Stack>
                  <Text size="xs" variant="muted">
                    updated {new Date(c.updatedAt).toLocaleDateString()}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        ) : (
          <Card padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Stack gap={1}>
                          <Stack direction="row" align="center" gap={2}>
                            <EntityRowLink
                              href={`/commerce/collections/${c.id}`}
                              entityType="collection"
                              entityId={c.id}
                              className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                            >
                              {c.name}
                            </EntityRowLink>
                            {c.featured && (
                              <Badge variant="outline" className="text-xs">
                                <Star className="mr-1 h-3 w-3" />
                                featured
                              </Badge>
                            )}
                          </Stack>
                          <Text size="xs" variant="muted">
                            /{c.handle}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Badge
                          color={c.type === 'rules' ? 'module' : 'outline'}
                          className="text-xs"
                        >
                          {c.type === 'rules' ? (
                            <>
                              <Sparkles className="mr-1 h-3 w-3" />
                              rules
                            </>
                          ) : (
                            'manual'
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Text size="sm">{c.productCount}</Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}
