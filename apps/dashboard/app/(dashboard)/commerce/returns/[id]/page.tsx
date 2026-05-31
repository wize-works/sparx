import { Container, Stack } from '@sparx/ui';
import { ReturnDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <ReturnDetailContent id={id} />
      </Stack>
    </Container>
  );
}
