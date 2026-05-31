import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  PageHeader,
  Stack,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { NewTemplateForm, type ProductOption } from './_components/new-template-form';

interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: 'active' | 'draft' | 'archived';
  vendor: string | null;
  productType: string | null;
  variantCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  imageUrl: string | null;
  tags: string[];
  updatedAt: string;
}

interface ProductListResponse {
  items: ProductListItem[];
  total: number;
}

export const dynamic = 'force-dynamic';

export default async function NewConfiguratorTemplatePage() {
  const products = await loadProducts();

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New configurator template"
          description="Bind a template to a configurable product. Start with a single option to learn the grammar, then add rules + add-ons from the detail page."
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Template basics</Heading>
              <CardDescription>
                The starter payload below is a minimal valid template. Edit it as JSON, save, then
                expand from the detail editor.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <NewTemplateForm products={products} />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

async function loadProducts(): Promise<ProductOption[]> {
  const { items } = await api.get<ProductListResponse>(
    '/v1/commerce/products?take=250&include_archived=true'
  );
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title));
  return sorted.map((p) => ({ id: p.id, title: p.title, handle: p.handle, status: p.status }));
}
