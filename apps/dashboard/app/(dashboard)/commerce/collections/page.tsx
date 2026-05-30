import Link from 'next/link';
import { Layers, Plus, Sparkles, Star } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
  Heading,
  Input,
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
import { EntityRowLink } from '../../_components/entity-row-link';

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

export default async function CollectionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const typeFilter = stringParam(params.type);
  const q = stringParam(params.q);
  const featuredOnly = stringParam(params.featured) === '1';

  const query = new URLSearchParams({ take: '100' });
  if (typeFilter === 'manual' || typeFilter === 'rules') query.set('type', typeFilter);
  if (featuredOnly) query.set('featured', 'true');
  if (q) query.set('q', q);

  const { items: rawItems, total: rawTotal } = await api.get<CollectionListResponse>(
    `/v1/commerce/collections?${query.toString()}`
  );
  const items = featuredOnly ? rawItems.filter((c) => c.featured) : rawItems;
  const total = featuredOnly ? items.length : rawTotal;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Layers className="h-5 w-5" />
              <Heading level={1}>Collections</Heading>
              <Badge variant="module">
                {total} collection{total === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Manual lists and rules-driven smart collections. Manual stays the same until you edit
              it; rules re-project on the next index flush (Phase 1.5 wires the indexer).
            </Text>
          </Stack>
          <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/commerce/collections/new">New collection</Link>
          </Button>
        </Stack>

        <form>
          <Card padding="sm">
            <CardContent>
              <Stack direction="row" align="center" gap={3} wrap>
                <Input
                  name="q"
                  placeholder="Name or handle"
                  defaultValue={q ?? ''}
                  className="min-w-[260px] flex-1"
                />
                <select
                  name="type"
                  defaultValue={typeFilter ?? ''}
                  className="flex h-9 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  aria-label="Type"
                >
                  <option value="">All types</option>
                  <option value="manual">Manual</option>
                  <option value="rules">Rules-driven</option>
                </select>
                <Stack direction="row" align="center" gap={2}>
                  <input
                    type="checkbox"
                    id="featured"
                    name="featured"
                    value="1"
                    defaultChecked={featuredOnly}
                    className="h-4 w-4"
                  />
                  <Text size="sm" as="label" htmlFor="featured">
                    Featured only
                  </Text>
                </Stack>
                <Button type="submit" variant="secondary">
                  Apply
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </form>

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
                  <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
                    <Link href="/commerce/collections/new">New collection</Link>
                  </Button>
                ) : undefined
              }
            />
          </Card>
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
                          variant={c.type === 'rules' ? 'module' : 'outline'}
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
