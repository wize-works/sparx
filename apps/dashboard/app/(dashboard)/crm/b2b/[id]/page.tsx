import { Container, Stack } from '@sparx/ui';
import { B2bAccountDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function B2bAccountDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <B2bAccountDetailContent id={id} />
      </Stack>
    </Container>
  );
}
