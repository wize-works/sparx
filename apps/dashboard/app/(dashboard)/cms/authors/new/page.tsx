// Dedicated "create author" route. Existed historically as a click-through
// from /cms/authors, but only the inline form on the list page handled it —
// hitting /cms/authors/new directly fell through to the [id] segment, which
// treated "new" as a UUID and produced a 500 (audit F-04).

import { Container, PageHeader, Stack } from '@sparx/ui';

import { AuthorCreateForm } from '../author-create-form';

export const dynamic = 'force-dynamic';

export default function NewAuthorPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New author"
          description="Add a byline for blog posts and editorial entries. Slug auto-derives from the display name when omitted; it must be unique within the tenant."
        />

        <AuthorCreateForm />
      </Stack>
    </Container>
  );
}
