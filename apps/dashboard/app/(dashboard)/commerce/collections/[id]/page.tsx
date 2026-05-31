import { Container, Stack } from '@sparx/ui';
import { CollectionDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CollectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CollectionDetailContent id={id} />
      </Stack>
    </Container>
  );
}
