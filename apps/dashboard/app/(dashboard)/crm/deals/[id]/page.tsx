import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Container, Stack } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { DealDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: PageProps) {
  const { id } = await params;
  // Resolve the deal's pipeline so the back link returns to the correct
  // Kanban board. Fetched separately from the content component (which also
  // fetches the deal) — kept lightweight, and api-rest's request-level
  // cache dedupes the actual DB hit.
  let pipelineId: string | null = null;
  try {
    const deal = await api.get<{ pipelineId: string }>(`/v1/crm/deals/${id}`);
    pipelineId = deal.pipelineId;
  } catch {
    // Fall back to the pipelines index — _content will render the not-found
    // state itself.
  }
  const backHref = pipelineId ? `/crm/pipelines/${pipelineId}` : '/crm/pipelines';

  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
          <Link href={backHref}>Back to pipeline</Link>
        </Button>
        <DealDetailContent id={id} />
      </Stack>
    </Container>
  );
}
