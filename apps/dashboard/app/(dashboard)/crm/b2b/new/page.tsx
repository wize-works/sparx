import { Container, PageHeader, Stack } from '@sparx/ui';

import { B2bAccountCreateForm } from '../_components/b2b-account-create-form';

// Full-page surface for creating a B2B account. The form body lives in the
// surface-aware `B2bAccountCreateForm` (§13.1) so the SAME component renders
// here (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewB2bAccountPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New B2B account"
          description="Track a wholesale or fleet customer's pricing, credit, and engine profile so commerce modules can quote, ship, and invoice them consistently."
        />
        <B2bAccountCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
