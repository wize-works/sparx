import Link from 'next/link';
import { Button, Container, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CmsTabs } from '../../_components/cms-tabs';
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
        <CmsTabs current="taxonomy" />
        <Button color="primary" variant="link" size="sm" asChild>
          <Link href="/cms/taxonomy">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to taxonomies
          </Link>
        </Button>
        <TaxonomyDetailContent id={key} />
      </Stack>
    </Container>
  );
}
