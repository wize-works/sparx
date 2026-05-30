import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Container, Heading, Stack } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { CmsTabs } from '../../_components/cms-tabs';
import { AuthorEditForm } from './author-edit-form';

export const dynamic = 'force-dynamic';

interface ApiAuthor {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
}

interface PageParams {
  params: Promise<{ id: string }>;
}

// Lenient UUID v4-ish check — the api-rest route validates strictly, but if a
// non-UUID slug ever reaches this segment (e.g. a stale link) we'd rather
// render a clean 404 than push the upstream 500 through the global error
// boundary as "This page couldn't load" (audit F-04, F-09).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditAuthorPage({ params }: PageParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  let author: ApiAuthor;
  try {
    author = await api.get<ApiAuthor>(`/v1/authors/${id}`);
  } catch (err) {
    const status = (err as ApiRestError).status;
    // 404 → not-found. Anything else (including 500/400/422) is also an
    // unviewable author from the user's perspective; render the framework
    // 404 rather than the global error page so the CmsTabs nav stays
    // visible and they can back out.
    if (status === 404 || status >= 400) notFound();
    throw err;
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="authors" />
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms/authors">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to authors
            </Link>
          </Button>
          <Heading level={1}>Edit author</Heading>
        </Stack>

        <AuthorEditForm
          author={{
            id: author.id,
            displayName: author.display_name,
            slug: author.slug,
            bio: author.bio ?? '',
          }}
        />
      </Stack>
    </Container>
  );
}
