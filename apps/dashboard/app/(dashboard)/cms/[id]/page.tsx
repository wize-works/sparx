import { Container, Stack } from '@sparx/ui';

import { CmsPageDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ id: string }>;
}

// Full-page route wrapper for a CMS page detail. The actual editing UI
// lives in `_content.tsx` so it can also mount inside the dashboard
// shell's detail panel (drawer / modal). The route adds the full-page
// chrome the panel doesn't: width-constrained Container, intra-module
// tabs nav, back link.
export default async function EditCmsPage({ params }: PageParams) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CmsPageDetailContent id={id} />
      </Stack>
    </Container>
  );
}
