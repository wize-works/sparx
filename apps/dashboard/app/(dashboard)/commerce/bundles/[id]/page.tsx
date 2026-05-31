import { Container, Stack } from '@sparx/ui';
import { BundleDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BundleDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <BundleDetailContent id={id} />
      </Stack>
    </Container>
  );
}
