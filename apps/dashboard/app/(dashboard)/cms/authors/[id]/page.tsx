import { Container, Stack } from '@sparx/ui';

import { AuthorDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditAuthorPage({ params }: PageParams) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <AuthorDetailContent id={id} />
      </Stack>
    </Container>
  );
}
