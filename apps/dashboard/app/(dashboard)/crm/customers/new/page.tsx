import { Container, PageHeader, Stack } from '@sparx/ui';

import { CustomerCreateForm } from '../_components/customer-create-form';

// Full-page surface for creating a customer. The form body lives in the
// surface-aware `CustomerCreateForm` (§13.1) so the SAME component renders
// here (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewCustomerPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New customer"
          description="Add a contact manually. Prospects can later be promoted to retail or B2B with no row migration."
        />
        <CustomerCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
