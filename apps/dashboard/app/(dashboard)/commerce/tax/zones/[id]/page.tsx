import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Container, Stack } from '@sparx/ui';
import { TaxZoneDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function TaxZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Link
          href="/commerce/tax"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to tax
        </Link>
        <TaxZoneDetailContent id={id} />
      </Stack>
    </Container>
  );
}
