import Link from 'next/link';
import { Layers, Plus, Star, Archive } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { segmentService } from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { EntityRowLink } from '../../_components/entity-row-link';
import { CrmTabs } from '../_components/crm-tabs';
import { RecomputeButton } from './_components/recompute-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SegmentsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const includeArchived = Boolean(params.includeArchived);
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const segments = await segmentService.list(ctx, { includeArchived });
  const counts = await Promise.all(
    segments.map((s) =>
      segmentService.memberCount(ctx, s.id).then((count) => ({ id: s.id, count }))
    )
  );
  const countById = new Map(counts.map((c) => [c.id, c.count]));

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="segments" />
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Layers className="h-5 w-5" />
              <Heading level={1}>Segments</Heading>
              <Badge variant="module">
                {segments.length} segment{segments.length === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Live customer audiences updated incrementally as events flow. Email broadcasts and
              automations target segments by name; membership joins are O(1).
            </Text>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button asChild variant="ghost">
              <Link href={includeArchived ? '/crm/segments' : '/crm/segments?includeArchived=1'}>
                {includeArchived ? 'Hide archived' : 'Show archived'}
              </Link>
            </Button>
            <RecomputeButton />
            <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/crm/segments/new">New segment</Link>
            </Button>
          </Stack>
        </Stack>

        {segments.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="No segments yet"
              description="Built-in segments like High Value and At Risk are seeded automatically — if you see this, the seed didn't run. Create one to get started."
              action={
                <Button asChild variant="module">
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
                          <Badge variant="warning" className="text-xs">
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
