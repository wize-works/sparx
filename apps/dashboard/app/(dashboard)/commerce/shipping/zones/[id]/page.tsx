import { Container, Stack } from '@sparx/ui';
import { ShippingZoneDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function ShippingZoneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <ShippingZoneDetailContent id={id} />
      </Stack>
    </Container>
  );
}
