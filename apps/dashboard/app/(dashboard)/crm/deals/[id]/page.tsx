import { Container, Stack } from '@sparx/ui';

import { DealDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <DealDetailContent id={id} />
      </Stack>
    </Container>
  );
}
