import { Container, PageHeader, Stack } from '@sparx/ui';

import { SegmentCreateForm } from '../_components/segment-create-form';

// Full-page surface for creating a segment. The form body lives in the
// surface-aware `SegmentCreateForm` (§13.1) so the SAME component renders
// here (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewSegmentPage() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New segment"
          description="Segments are materialized incrementally; this rule is evaluated on every event that could change a customer's projection (orders, opens, clicks, B2B updates)."
        />
        <SegmentCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
