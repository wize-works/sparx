import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button, Container, Heading, Stack, Text } from '@sparx/ui';

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
