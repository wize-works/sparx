import { Container, Stack } from '@sparx/ui';
import { SegmentDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SegmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <SegmentDetailContent id={id} />
      </Stack>
    </Container>
  );
}
