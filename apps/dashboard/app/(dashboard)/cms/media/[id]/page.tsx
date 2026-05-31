import { Container, Stack } from '@sparx/ui';

import { MediaAssetDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <MediaAssetDetailContent id={id} />
      </Stack>
    </Container>
  );
}
