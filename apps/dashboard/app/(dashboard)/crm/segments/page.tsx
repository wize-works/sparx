import Link from 'next/link';
import { Layers, Plus, Star, Archive } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { EntityRowLink } from '../../_components/entity-row-link';
import { RecomputeButton } from './_components/recompute-button';

export const dynamic = 'force-dynamic';

interface SegmentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isBuiltIn: boolean;
  archivedAt: string | null;
}

interface MemberCountResponse {
  total: number;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SegmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const includeArchived = Boolean(params.includeArchived);

  const segments = await api.get<SegmentRow[]>(
    `/v1/crm/segments${includeArchived ? '?include_archived=true' : ''}`
  );
  const counts = await Promise.all(
    segments.map((s) =>
      api
        .get<MemberCountResponse>(`/v1/crm/segments/${s.id}/member-count`)
        .then((r) => ({ id: s.id, count: r.total }))
    )
  );
  const countById = new Map(counts.map((c) => [c.id, c.count]));

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Layers className="h-5 w-5" />}
          title="Segments"
          badge={
            <Badge color="module">
              {segments.length} segment{segments.length === 1 ? '' : 's'}
            </Badge>
          }
          description="Live customer audiences updated incrementally as events flow. Email broadcasts and automations target segments by name; membership joins are O(1)."
          actions={
            <>
              <Button asChild variant="ghost">
                <Link href={includeArchived ? '/crm/segments' : '/crm/segments?includeArchived=1'}>
                  {includeArchived ? 'Hide archived' : 'Show archived'}
                </Link>
              </Button>
              <RecomputeButton />
              <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/crm/segments/new">New segment</Link>
              </Button>
            </>
          }
        />

        {segments.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="No segments yet"
              description="Built-in segments like High Value and At Risk are seeded automatically — if you see this, the seed didn't run. Create one to get started."
              action={
                <Button asChild color="module">
                  <Link href="/crm/segments/new">Create a segment</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Stack gap={3}>
            {segments.map((s) => (
              <Card key={s.id} variant={s.archivedAt ? 'default' : 'module'}>
                <CardContent>
                  <Stack direction="row" align="center" justify="between" wrap gap={3}>
                    <Stack gap={1} className="min-w-0 flex-1">
                      <Stack direction="row" align="center" gap={2}>
                        <EntityRowLink
                          href={`/crm/segments/${s.id}`}
                          entityType="segment"
                          entityId={s.id}
                          className="text-base font-medium hover:text-[var(--module-active)] hover:underline"
                        >
                          {s.name}
                        </EntityRowLink>
                        {s.isBuiltIn && (
                          <Badge variant="outline" className="text-xs">
                            <Star className="h-3 w-3" /> Built-in
                          </Badge>
                        )}
                        {s.archivedAt && (
                          <Badge color="warning" className="text-xs">
                            <Archive className="h-3 w-3" /> Archived
                          </Badge>
                        )}
                      </Stack>
                      {s.description && (
                        <Text size="sm" variant="muted" className="truncate">
                          {s.description}
                        </Text>
                      )}
                      <Text size="xs" variant="muted">
                        slug <code>{s.slug}</code>
                      </Text>
                    </Stack>
                    <Stack direction="row" align="center" gap={3}>
                      <Stack gap={0}>
                        <Text size="xs" variant="muted">
                          Members
                        </Text>
                        <Text size="lg" weight="medium" className="tabular-nums">
                          {countById.get(s.id) ?? 0}
                        </Text>
                      </Stack>
                      <Button asChild variant="ghost">
                        <Link href={`/crm/segments/${s.id}`}>Open</Link>
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
