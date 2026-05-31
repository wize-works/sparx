// Dedicated "create author" route. Existed historically as a click-through
// from /cms/authors, but only the inline form on the list page handled it —
// hitting /cms/authors/new directly fell through to the [id] segment, which
// treated "new" as a UUID and produced a 500 (audit F-04).

import Link from 'next/link';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CmsTabs } from '../../_components/cms-tabs';
import { AuthorCreateForm } from '../author-create-form';

export const dynamic = 'force-dynamic';

export default function NewAuthorPage() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="authors" />
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/cms/authors">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to authors
            </Link>
          </Button>
          <Heading level={1}>New author</Heading>
          <Text variant="muted">
            Add a byline for blog posts and editorial entries. Slug auto-derives from the display
            name when omitted; it must be unique within the tenant.
          </Text>
        </Stack>

        <AuthorCreateForm />
      </Stack>
    </Container>
  );
}
