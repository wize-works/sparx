import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, KanbanSquare, List, BarChart3, Plus } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { CrmNotFoundError, dealService, pipelineService } from '@sparx/crm';
import {
  Badge,
  Button,
  Container,
  Heading,
  Stack,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@sparx/ui';

import { PipelineKanban } from './_components/pipeline-kanban';
import { PipelineList } from './_components/pipeline-list';
import { PipelineForecast } from './_components/pipeline-forecast';

// Pipeline detail — Kanban (default), list, or forecast. The view switch
// lives in the URL (?view=) so back-button + bookmarks behave.

export const dynamic = 'force-dynamic';

type View = 'kanban' | 'list' | 'forecast';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PipelineDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const view: View = sp.view === 'list' ? 'list' : sp.view === 'forecast' ? 'forecast' : 'kanban';

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let pipeline;
  try {
    pipeline = await pipelineService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const { items: deals } = await dealService.list(ctx, {
    pipelineId: pipeline.id,
    take: 250,
  });
  const dealCounts = pipeline.stages.map((stage) => ({
    stageId: stage.id,
    count: deals.filter((d) => d.stageId === stage.id).length,
  }));

  return (
    <Container size="full" className="px-6">
      <Stack gap={6} className="py-8">
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              <Link href="/crm/pipelines">All pipelines</Link>
            </Button>
            <Stack direction="row" align="center" gap={2}>
              <Heading level={1}>{pipeline.name}</Heading>
              {pipeline.isDefault && <Badge variant="outline">Default</Badge>}
              <Badge variant="module">
                {deals.length} open deal{deals.length === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              {pipeline.stages.length} stage{pipeline.stages.length === 1 ? '' : 's'} ·{' '}
              <code>{pipeline.slug}</code>
            </Text>
          </Stack>
          <Stack direction="row" gap={2}>
            <Tabs value={view}>
              <TabsList>
                <TabsTrigger value="kanban" asChild>
                  <Link href={`/crm/pipelines/${pipeline.id}`}>
                    <KanbanSquare className="h-3.5 w-3.5" /> Kanban
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="list" asChild>
                  <Link href={`/crm/pipelines/${pipeline.id}?view=list`}>
                    <List className="h-3.5 w-3.5" /> List
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="forecast" asChild>
                  <Link href={`/crm/pipelines/${pipeline.id}?view=forecast`}>
                    <BarChart3 className="h-3.5 w-3.5" /> Forecast
                  </Link>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href={`/crm/deals/new?pipelineId=${pipeline.id}`}>New deal</Link>
            </Button>
          </Stack>
        </Stack>

        {view === 'kanban' && (
          <PipelineKanban
            pipelineId={pipeline.id}
            stages={pipeline.stages.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
              stageType: s.stageType,
              probability: Number(s.probability),
              count: dealCounts.find((c) => c.stageId === s.id)?.count ?? 0,
            }))}
            deals={deals.map((d) => ({
              id: d.id,
              title: d.title,
              stageId: d.stageId,
              value: Number(d.value),
              currency: d.currency,
              probability: Number(d.probability),
              assignedRepId: d.assignedRepId,
              expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
              tags: d.tags,
            }))}
          />
        )}
        {view === 'list' && <PipelineList pipelineId={pipeline.id} />}
        {view === 'forecast' && <PipelineForecast pipelineId={pipeline.id} />}
      </Stack>
    </Container>
  );
}
