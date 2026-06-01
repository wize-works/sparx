import { Container, PageHeader, Stack } from '@sparx/ui';

import { ProductCreateForm } from '../_components/product-create-form';

// Full-page surface for creating a product. The form body lives in the
// surface-aware `ProductCreateForm` (§13.1) so the SAME component renders here
// (`surface="page"`) and inside the `@detail` drawer/modal overlay
// (`surface="overlay"`). This route is what `fullPage` / `newTab` detail-view
// preferences, deep links, and the overlay's "maximize" button resolve to.

export default function NewProductPage() {
  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New product"
          description="Create the catalog row first; add variants, options, media, pricing, and fitment from the product detail tabs. Anything not set here can be edited later — the only required field is the title."
        />
        <ProductCreateForm surface="page" />
      </Stack>
    </Container>
  );
}
