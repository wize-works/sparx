import Link from 'next/link';
import { Button, Container, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CmsTabs } from '../../_components/cms-tabs';
import { MediaAssetDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CmsTabs current="media" />
        <Button variant="link" size="sm" asChild>
          <Link href="/cms/media">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to media
          </Link>
        </Button>
        <MediaAssetDetailContent id={id} />
      </Stack>
    </Container>
  );
}
