import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Container, Stack } from '@sparx/ui';
import { QuoteDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QuoteDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
          <Link href="/crm/quotes">All quotes</Link>
        </Button>
        <QuoteDetailContent id={id} />
      </Stack>
    </Container>
  );
}
