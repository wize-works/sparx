import Link from 'next/link';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { CustomTypeForm } from './custom-type-form';

export const dynamic = 'force-dynamic';

const SAMPLE_SCHEMA = JSON.stringify(
  {
    fields: [
      { key: 'title', type: 'text', label: 'Title', required: true, max: 200 },
      { key: 'slug', type: 'slug', label: 'Slug', sourceField: 'title' },
      { key: 'summary', type: 'long_text', label: 'Summary', max: 480 },
      { key: 'body', type: 'rich_text', label: 'Body', required: true },
      { key: 'heroImage', type: 'asset', label: 'Hero image', accept: ['image/*'] },
    ],
  },
  null,
  2
);

export default function NewContentTypePage() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/cms/types">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to content types
            </Link>
          </Button>
          <Heading level={1}>New custom content type</Heading>
          <Text variant="muted">
            Define a tenant-specific authoring shape — testimonials, case studies, events, anything.
            The schema validates against the same FieldDef union the platform uses for built-ins, so
            the schema-driven form on this dashboard works out of the box.
          </Text>
        </Stack>

        <CustomTypeForm initialSchema={SAMPLE_SCHEMA} />
      </Stack>
    </Container>
  );
}
