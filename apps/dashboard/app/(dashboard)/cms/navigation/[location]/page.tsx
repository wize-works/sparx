import Link from 'next/link';
import { Button, Container, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CmsTabs } from '../../_components/cms-tabs';
import { MenuDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ location: string }>;
}

export default async function EditNavigationMenuPage({ params }: PageParams) {
  const { location } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="navigation" />
        <Button variant="link" size="sm" asChild>
          <Link href="/cms/navigation">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to navigation
          </Link>
        </Button>
        <MenuDetailContent id={location} />
      </Stack>
    </Container>
  );
}
