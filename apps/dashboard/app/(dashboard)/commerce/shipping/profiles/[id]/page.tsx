import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Container, Stack } from '@sparx/ui';
import { ShippingProfileDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function ShippingProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Link
          href="/commerce/shipping"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to shipping
        </Link>
        <ShippingProfileDetailContent id={id} />
      </Stack>
    </Container>
  );
}
