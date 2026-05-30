import Link from 'next/link';
import { Button, Container, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CmsTabs } from '../../_components/cms-tabs';
import { AuthorDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditAuthorPage({ params }: PageParams) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="authors" />
        <Button variant="link" size="sm" asChild>
          <Link href="/cms/authors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to authors
          </Link>
        </Button>
        <AuthorDetailContent id={id} />
      </Stack>
    </Container>
  );
}
