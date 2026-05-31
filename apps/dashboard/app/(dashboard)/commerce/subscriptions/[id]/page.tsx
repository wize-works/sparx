import { Container, Stack } from '@sparx/ui';
import { SubscriptionDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <SubscriptionDetailContent id={id} />
      </Stack>
    </Container>
  );
}
