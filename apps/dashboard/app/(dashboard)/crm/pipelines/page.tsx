import Link from 'next/link';
import { KanbanSquare, ArrowRight, Archive, Plus, Settings } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { EntityCreateButton } from '../../_components/entity-create-button';

interface PipelineStageRow {
  id: string;
  name: string;
  stageType: 'open' | 'won' | 'lost';
  probability: string | number;
  color: string | null;
}

interface PipelineRow {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  archivedAt: string | null;
  stages: PipelineStageRow[];
}

// Pipelines index — one card per pipeline, click-through to Kanban.
//
// Stages are listed inline as a horizontal mini-funnel so the list view
// communicates the shape of each pipeline without forcing a click into
// the detail page. Archived pipelines are hidden by default; toggle with
// ?includeArchived=1.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PipelinesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const includeArchived = Boolean(params.includeArchived);

  const pipelines = await api.get<PipelineRow[]>(
    `/v1/crm/pipelines${includeArchived ? '?include_archived=true' : ''}`
  );

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<KanbanSquare className="h-5 w-5" />}
          title="Pipelines"
          badge={
            <Badge color="module">
              {pipelines.length} pipeline{pipelines.length === 1 ? '' : 's'}
            </Badge>
          }
          description="Each pipeline has its own ordered stage list. Deals move between stages on the Kanban board; stage probability feeds the forecast."
          actions={
            <>
              <Button asChild variant="ghost">
                <Link
                  href={includeArchived ? '/crm/pipelines' : '/crm/pipelines?includeArchived=1'}
                >
                  {includeArchived ? 'Hide archived' : 'Show archived'}
                </Link>
              </Button>
              <EntityCreateButton
                entityType="pipeline"
                newHref="/crm/pipelines/new"
                color="module"
                leftIcon={<Plus className="h-4 w-4" />}
              >
                New
              </EntityCreateButton>
            </>
          }
        />

        {pipelines.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<KanbanSquare className="h-5 w-5" />}
              title="No pipelines yet"
              description="A default pipeline is created when CRM is activated. If you cleared it, your tenant has no pipelines configured."
            />
          </Card>
        ) : (
          <Stack gap={4}>
            {pipelines.map((pipeline) => (
              <Card key={pipeline.id} variant={pipeline.archivedAt ? 'default' : 'module'}>
                <CardHeader>
                  <Stack direction="row" align="center" justify="between" wrap>
                    <Stack gap={1}>
                      <Stack direction="row" align="center" gap={2}>
                        <CardTitle>{pipeline.name}</CardTitle>
                        {pipeline.isDefault && (
                          <Badge variant="outline" className="text-xs">
                            Default
                          </Badge>
                        )}
                        {pipeline.archivedAt && (
                          <Badge color="warning" className="text-xs">
                            <Archive className="h-3 w-3" /> Archived
                          </Badge>
                        )}
                      </Stack>
                      <Text size="sm" variant="muted">
                        {pipeline.stages.length} stage{pipeline.stages.length === 1 ? '' : 's'} —
                        slug <code>{pipeline.slug}</code>
                      </Text>
                    </Stack>
                    <Stack direction="row" gap={2}>
                      <Button
                        asChild
                        variant="ghost"
                        shape="square"
                        size="sm"
                        aria-label="Edit pipeline"
                      >
                        <Link href={`/crm/pipelines/${pipeline.id}/edit`}>
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="ghost">
                        <Link href={`/crm/pipelines/${pipeline.id}?view=list`}>List</Link>
                      </Button>
                      <Button asChild variant="ghost">
                        <Link href={`/crm/pipelines/${pipeline.id}?view=forecast`}>Forecast</Link>
                      </Button>
                      <Button asChild color="module" rightIcon={<ArrowRight className="h-4 w-4" />}>
                        <Link href={`/crm/pipelines/${pipeline.id}`}>Open Kanban</Link>
                      </Button>
                    </Stack>
                  </Stack>
                </CardHeader>
                <CardContent>
                  <Stack direction="row" gap={2} wrap>
                    {pipeline.stages.map((stage) => (
                      <Stack
                        key={stage.id}
                        direction="row"
                        align="center"
                        gap={1}
                        className="rounded-md border border-[var(--color-border-default)] px-2 py-1"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              stage.color ??
                              (stage.stageType === 'won'
                                ? 'var(--color-success-500)'
                                : stage.stageType === 'lost'
                                  ? 'var(--color-danger-500)'
                                  : 'var(--module-active)'),
                          }}
                        />
                        <Text size="sm">{stage.name}</Text>
                        <Text size="xs" variant="muted">
                          {Number(stage.probability)}%
                        </Text>
                      </Stack>
                    ))}
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
