import { Container, Stack } from '@sparx/ui';
import { TaxZoneDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function TaxZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <TaxZoneDetailContent id={id} />
      </Stack>
    </Container>
  );
}
