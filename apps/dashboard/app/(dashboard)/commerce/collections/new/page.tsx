import { Container, PageHeader, Stack } from '@sparx/ui';

import { CollectionCreateForm } from '../_components/collection-create-form';

// Full-page surface for creating a collection. The form body lives in the
// surface-aware `CollectionCreateForm` (§13.1) so the SAME component renders
// here (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewCollectionPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New collection"
          description="Start with a name and a type. Manual collections let you hand-pick products; rules collections re-project membership when products or their tags change."
        />
        <CollectionCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
