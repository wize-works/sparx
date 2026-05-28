import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Container, Heading, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { EditPageForm, type EditableTenantPage } from './edit-form';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ id: string }>;
}

interface ApiEntry {
  id: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
  published_at: string | null;
  updated_at: string;
}

export default async function EditCmsPage({ params }: PageParams) {
  const { id } = await params;
  let entry: ApiEntry;
  try {
    entry = await api.get<ApiEntry>(`/v1/content/entries/${id}`);
  } catch (err) {
    const e = err as ApiRestError;
    if (e?.status === 404) notFound();
    throw err;
  }

  const docBody =
    entry.body.body && typeof entry.body.body === 'object'
      ? (entry.body.body as Record<string, unknown>)
      : { type: 'doc', content: [] };

  const editable: EditableTenantPage = {
    id: entry.id,
    slug: entry.slug ?? '',
    title: typeof entry.body.title === 'string' ? entry.body.title : '',
    status: entry.status,
    body: docBody,
    seoTitle: typeof entry.seo.title === 'string' ? entry.seo.title : null,
    metaDescription: typeof entry.seo.description === 'string' ? entry.seo.description : null,
    publishedAt: entry.published_at ? new Date(entry.published_at) : null,
    updatedAt: new Date(entry.updated_at),
  };

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

        <EditPageForm page={editable} />
      </Stack>
    </Container>
  );
}
