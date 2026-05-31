import { Container, Stack } from '@sparx/ui';
import { ProviderInstallationDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function ProviderInstallationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <ProviderInstallationDetailContent id={id} />
      </Stack>
    </Container>
  );
}
