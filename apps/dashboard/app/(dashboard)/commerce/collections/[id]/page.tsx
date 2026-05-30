import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Container, Stack } from '@sparx/ui';
import { CollectionDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CollectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Link
          href="/commerce/collections"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to collections
        </Link>
        <CollectionDetailContent id={id} />
      </Stack>
    </Container>
  );
}
