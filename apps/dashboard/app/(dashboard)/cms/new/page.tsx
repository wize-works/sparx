import { Container, PageHeader, Stack } from '@sparx/ui';

import { PageCreateForm } from '../_components/page-create-form';

// Full-page surface for creating a page. The form body lives in the
// surface-aware `PageCreateForm` (§13.1) so the SAME component renders here
// (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New page"
          description="Saves as a draft. Publish from the editor once the content is ready — nothing goes live until you say so."
        />
        <PageCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
