import { Container, PageHeader, Stack } from '@sparx/ui';

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
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New custom content type"
          description="Define a tenant-specific authoring shape — testimonials, case studies, events, anything. The schema validates against the same FieldDef union the platform uses for built-ins, so the schema-driven form on this dashboard works out of the box."
        />

        <CustomTypeForm initialSchema={SAMPLE_SCHEMA} />
      </Stack>
    </Container>
  );
}
