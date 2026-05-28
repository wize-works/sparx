import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import { Button, Container, Heading, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { EditPageForm, type EditableTenantPage } from './edit-form';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditCmsPage({ params }: PageParams) {
  const { user } = await requireSession();
  const { id } = await params;

  const page = await withTenant<EditableTenantPage | null>({ tenantId: user.tenantId }, (tx) =>
    tx.page.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        content: true,
        seoTitle: true,
        metaDescription: true,
        publishedAt: true,
        updatedAt: true,
      },
    })
  );

  if (!page) {
    notFound();
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to pages
            </Link>
          </Button>
          <Heading level={1}>Edit page</Heading>
        </Stack>

        <EditPageForm page={page} />
      </Stack>
    </Container>
  );
}
