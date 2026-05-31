import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Container, Stack } from '@sparx/ui';
import { SegmentDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SegmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Button color="primary" variant="link" size="sm" asChild>
          <Link href="/crm/segments">
            <ArrowLeft className="h-3.5 w-3.5" /> All segments
          </Link>
        </Button>
        <SegmentDetailContent id={id} />
      </Stack>
    </Container>
  );
}
