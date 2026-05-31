import { Container, Stack } from '@sparx/ui';
import { ReviewDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <ReviewDetailContent id={id} />
      </Stack>
    </Container>
  );
}
