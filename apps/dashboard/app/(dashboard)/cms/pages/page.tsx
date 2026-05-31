import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Grid,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';
import { FileText, Plus } from 'lucide-react';

import { api } from '@/lib/api-rest-client';
import { EntityRowLink } from '../../_components/entity-row-link';
import { EntryListFilters } from '../_components/entry-list-filters';

// CMS Pages list — reached from the CMS overview (/cms) and the "Pages" panel
// section. Page detail stays at /cms/[id] (the shell's `page` entityType +
// drawer convention point there). The CMS module gate runs in layout.tsx.

export const dynamic = 'force-dynamic';

interface ApiEntry {
  id: string;
  slug: string | null;
  status: string;
  body: { title?: string } & Record<string, unknown>;
  updated_at: string;
  published_at: string | null;
}

interface SearchParams {
  status?: string | string[];
  q?: string | string[];
  cursor?: string | string[];
}

const PAGE_SIZE = 50;

function asString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) usp.set(k, v);
  }
  return usp.toString();
}

export default async function CmsPagesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = asString(sp.status);
  const q = asString(sp.q);
  const cursor = asString(sp.cursor);

  // Server-side query mirrors the filter UI exactly so the URL is the
  // source of truth for the entry list.
  const apiQuery = buildQuery({
    type: 'page',
    limit: String(PAGE_SIZE),
    ...(status && status !== 'all' ? { status } : {}),
    ...(q ? { q } : {}),
    ...(cursor ? { cursor } : {}),
  });

  const paged = await api.getPaged<ApiEntry[]>(`/v1/content/entries?${apiQuery}`);
  const entries = paged.data;
  const nextCursor = typeof paged.meta?.next_cursor === 'string' ? paged.meta.next_cursor : null;

  const baseParams: Record<string, string | undefined> = {
    ...(status && status !== 'all' ? { status } : {}),
    ...(q ? { q } : {}),
  };
  const nextHref = nextCursor
    ? `/cms/pages?${buildQuery({ ...baseParams, cursor: nextCursor })}`
    : null;
  const isFiltered = Boolean(status && status !== 'all') || Boolean(q);
  const isPaged = Boolean(cursor);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          className="mb-0"
          icon={<FileText className="h-5 w-5" />}
          title="Pages"
          badge={<Badge variant="outline">{entries.length}</Badge>}
          description="Pages, landing pages, and policy content for your storefront."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/cms/new">New page</Link>
            </Button>
          }
        />

        <EntryListFilters />

        {entries.length === 0 ? (
          <Card variant="module" padding="none">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={isFiltered ? 'No pages match your filter' : 'No pages yet'}
              description={
                isFiltered
                  ? 'Try clearing the filter or searching for a different term.'
                  : 'Create your first page to start building out your store.'
              }
              action={
                isFiltered ? (
                  <Button asChild variant="ghost">
                    <Link href="/cms/pages">Clear filters</Link>
                  </Button>
                ) : (
                  <Button asChild color="module">
                    <Link href="/cms/new">Create a page</Link>
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {entries.map((e) => (
              <Card key={e.id} variant="module">
                <CardHeader>
                  <CardDescription>/{e.slug ?? ''}</CardDescription>
                  <CardTitle>{e.body.title ?? '(untitled)'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack direction="row" align="center" gap={2}>
                    <Badge color={e.status === 'published' ? 'success' : 'outline'}>
                      {e.status}
                    </Badge>
                    <Text size="xs" variant="muted">
                      {e.status === 'published' && e.published_at
                        ? `Published ${new Date(e.published_at).toLocaleDateString()}`
                        : `Last edited ${new Date(e.updated_at).toLocaleDateString()}`}
                    </Text>
                  </Stack>
                </CardContent>
                <CardFooter>
                  <Button color="module" variant="outline" size="sm" asChild>
                    <EntityRowLink href={`/cms/${e.id}`} entityType="page" entityId={e.id}>
                      Edit
                    </EntityRowLink>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        )}

        {(nextHref !== null || isPaged) && (
          <Stack direction="row" align="center" justify="between">
            {isPaged ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/cms/pages?${buildQuery(baseParams)}`}>← First page</Link>
              </Button>
            ) : (
              <span />
            )}
            {nextHref ? (
              <Button asChild color="module" variant="outline" size="sm">
                <Link href={nextHref}>Load more →</Link>
              </Button>
            ) : (
              <Text size="xs" variant="muted">
                End of list.
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
