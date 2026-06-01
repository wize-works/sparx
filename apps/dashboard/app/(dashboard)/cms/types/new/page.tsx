import { Container, PageHeader, Stack } from '@sparx/ui';

import { ContentTypeCreateForm } from '../_components/content-type-create-form';

export const dynamic = 'force-dynamic';

// Full-page surface for creating a custom content type. The form body lives in
// the surface-aware `ContentTypeCreateForm` (§13.1) so the SAME component
// renders here (`surface="page"`) and inside the `@detail` drawer/modal
// (`surface="overlay"`). fullPage / newTab detail-view prefs, deep links, and
// the overlay's "maximize" button all resolve here.

export default function NewContentTypePage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New custom content type"
          description="Define a tenant-specific authoring shape — testimonials, case studies, events, anything. The schema validates against the same FieldDef union the platform uses for built-ins, so the schema-driven form on this dashboard works out of the box."
        />

        <ContentTypeCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
