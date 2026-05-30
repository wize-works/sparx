import Link from 'next/link';
import { Button, Container, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CmsTabs } from '../_components/cms-tabs';
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
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="pages" />
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to pages
            </Link>
          </Button>
        </Stack>
        <CmsPageDetailContent id={id} />
      </Stack>
    </Container>
  );
}
