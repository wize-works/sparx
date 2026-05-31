import { Container, Stack } from '@sparx/ui';
import { PriceListDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PriceListDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PriceListDetailContent id={id} />
      </Stack>
    </Container>
  );
}
