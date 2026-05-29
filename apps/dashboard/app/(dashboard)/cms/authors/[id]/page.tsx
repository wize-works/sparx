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

export default async function EditAuthorPage({ params }: PageParams) {
  const { id } = await params;
  let author: ApiAuthor;
  try {
    author = await api.get<ApiAuthor>(`/v1/authors/${id}`);
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
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
