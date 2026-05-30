import { notFound } from 'next/navigation';
import { Heading, Stack } from '@sparx/ui';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { AuthorEditForm } from './author-edit-form';

// Detail content for a CMS author. Mounted by both the full-page route
// and the dashboard shell's drawer / modal. Container width + back button +
// CmsTabs live in page.tsx.

export const dynamic = 'force-dynamic';

interface ApiAuthor {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
}

// Lenient UUID v4-ish check — matches the route guard so a stale link to a
// non-UUID slug renders a clean 404 inside the drawer rather than pushing
// the upstream 500 to the global error boundary.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  id: string;
}

export async function AuthorDetailContent({ id }: Props) {
  if (!UUID_RE.test(id)) notFound();
  let author: ApiAuthor;
  try {
    author = await api.get<ApiAuthor>(`/v1/authors/${id}`);
  } catch (err) {
    const status = (err as ApiRestError).status;
    if (status === 404 || status >= 400) notFound();
    throw err;
  }

  return (
    <Stack gap={6}>
      <Heading level={1}>Edit author</Heading>
      <AuthorEditForm
        author={{
          id: author.id,
          displayName: author.display_name,
          slug: author.slug,
          bio: author.bio ?? '',
        }}
      />
    </Stack>
  );
}
