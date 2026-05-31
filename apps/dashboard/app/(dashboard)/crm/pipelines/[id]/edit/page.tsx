import { notFound } from 'next/navigation';

import { Container, PageHeader, Stack } from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { PipelineEditor } from './_components/pipeline-editor';

export const dynamic = 'force-dynamic';

interface PipelineForEdit {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  archivedAt: string | null;
  stages: {
    id: string;
    name: string;
    sortOrder: number;
    probability: string | number;
    stageType: 'open' | 'won' | 'lost';
    color: string | null;
  }[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPipelinePage({ params }: PageProps) {
  const { id } = await params;

  let pipeline: PipelineForEdit;
  try {
    pipeline = await api.get<PipelineForEdit>(`/v1/crm/pipelines/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title={`Edit ${pipeline.name}`}
          description="Drag to reorder stages, edit names + probabilities, or add a new stage. Probability here feeds the weighted forecast on the pipeline detail page."
        />

        <PipelineEditor
          pipeline={{
            id: pipeline.id,
            name: pipeline.name,
            slug: pipeline.slug,
            isDefault: pipeline.isDefault,
            archivedAt: pipeline.archivedAt,
            stages: pipeline.stages.map((s) => ({
              id: s.id,
              name: s.name,
              sortOrder: s.sortOrder,
              probability: Number(s.probability),
              stageType: s.stageType,
              color: s.color,
            })),
          }}
        />
      </Stack>
    </Container>
  );
}
