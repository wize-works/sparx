import { Container, Stack } from '@sparx/ui';
import { ShippingProfileDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function ShippingProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <ShippingProfileDetailContent id={id} />
      </Stack>
    </Container>
  );
}
