import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Container, Stack } from '@sparx/ui';
import { B2bAccountDetailContent } from './_content';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function B2bAccountDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Button color="primary" variant="link" size="sm" asChild>
          <Link href="/crm/b2b">
            <ArrowLeft className="h-3.5 w-3.5" /> All B2B accounts
          </Link>
        </Button>
        <B2bAccountDetailContent id={id} />
      </Stack>
    </Container>
  );
}
