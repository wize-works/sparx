import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { CrmNotFoundError, pipelineService } from '@sparx/crm';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';

import { PipelineEditor } from './_components/pipeline-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPipelinePage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let pipeline;
  try {
    pipeline = await pipelineService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/pipelines">
              <ArrowLeft className="h-3.5 w-3.5" /> All pipelines
            </Link>
          </Button>
          <Heading level={1}>Edit {pipeline.name}</Heading>
          <Text variant="muted">
            Drag to reorder stages, edit names + probabilities, or add a new stage. Probability here
            feeds the weighted forecast on the pipeline detail page.
          </Text>
        </Stack>

        <PipelineEditor
          pipeline={{
            id: pipeline.id,
            name: pipeline.name,
            slug: pipeline.slug,
            isDefault: pipeline.isDefault,
            archivedAt: pipeline.archivedAt?.toISOString() ?? null,
            stages: pipeline.stages.map((s) => ({
              id: s.id,
              name: s.name,
              sortOrder: s.sortOrder,
              probability: Number(s.probability),
              stageType: s.stageType as 'open' | 'won' | 'lost',
              color: s.color,
            })),
          }}
        />
      </Stack>
    </Container>
  );
}
