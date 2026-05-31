import { Container, Stack } from '@sparx/ui';

import { TaxonomyDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ key: string }>;
}

export default async function TaxonomyDetailPage({ params }: PageParams) {
  const { key } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <TaxonomyDetailContent id={key} />
      </Stack>
    </Container>
  );
}
