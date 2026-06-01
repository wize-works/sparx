import { Container, PageHeader, Stack } from '@sparx/ui';

import { PriceListCreateForm } from '../_components/price-list-create-form';

// Full-page surface for creating a price list. The form body lives in the
// surface-aware `PriceListCreateForm` (§13.1) so the SAME component renders
// here (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewPriceListPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New price list"
          description="Targeting (segment, B2B account) can be set after the list exists. Per-variant entries are managed from the detail page."
        />
        <PriceListCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
