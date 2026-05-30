import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Container, Stack } from '@sparx/ui';
import { dealService } from '@sparx/crm';
import { requireSession } from '@sparx/auth';
import { DealDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: PageProps) {
  const { id } = await params;
  // Resolve the deal's pipeline so the back link returns to the correct
  // Kanban board. Fetched separately from the content component (which also
  // fetches the deal) — kept lightweight, and the request-level cache
  // dedupes the actual DB hit.
  const session = await requireSession();
  let pipelineId: string | null = null;
  try {
    const deal = await dealService.get(
      { tenantId: session.user.tenantId, userId: session.user.id },
      id
    );
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
