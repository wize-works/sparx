import { Container, PageHeader, Stack } from '@sparx/ui';

import { WarehouseCreateForm } from '../_components/warehouse-create-form';

// Full-page surface for creating a warehouse. The form body lives in the
// surface-aware `WarehouseCreateForm` (§13.1) so the SAME component renders
// here (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewWarehousePage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New warehouse"
          description="Set the basics now; reorder defaults + hours of operation can be edited after the warehouse exists."
        />
        <WarehouseCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
