import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Container, Stack } from '@sparx/ui';
import { WarehouseDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WarehouseDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Link
          href="/commerce/warehouses"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to warehouses
        </Link>
        <WarehouseDetailContent id={id} />
      </Stack>
    </Container>
  );
}
