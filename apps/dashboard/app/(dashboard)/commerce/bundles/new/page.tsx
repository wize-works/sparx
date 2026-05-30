import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import {
  BundleEditor,
  type BundleProductOption,
  type VariantOption,
} from '../_components/bundle-editor';

export const dynamic = 'force-dynamic';

interface VariantListRow {
  id: string;
  sku: string;
  title: string | null;
  priceCents: number;
  productId: string;
  productTitle: string;
  productHandle: string;
  productStatus: string;
  archivedAt: string | null;
}

interface ProductListRow {
  id: string;
  title: string;
  handle: string;
  status: string;
}

interface BundleSummary {
  id: string;
  bundleProductId: string;
}

export default async function NewBundlePage() {
  const [variantRows, productsResponse, bundles] = await Promise.all([
    api.get<VariantListRow[]>('/v1/commerce/variants?take=500'),
    api.getPaged<ProductListRow[]>('/v1/commerce/products?take=250'),
    api.get<BundleSummary[]>('/v1/commerce/bundles'),
  ]);

  const takenIds = new Set(bundles.map((b) => b.bundleProductId));
  const products: BundleProductOption[] = productsResponse.data
    .filter((p) => !takenIds.has(p.id))
    .map((p) => ({ id: p.id, title: p.title, handle: p.handle, status: p.status }));

  const variants: VariantOption[] = variantRows.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    priceCents: v.priceCents,
    productId: v.productId,
    productTitle: v.productTitle,
  }));

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/bundles"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to bundles
          </Link>
          <Heading level={1}>New bundle</Heading>
          <Text variant="muted">
            Pick the wrapper product, add components, then choose how price + inventory resolve.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Configuration</Heading>
              <CardDescription>
                A bundle product can wrap up to 50 components. Each component carries a default
                quantity and may be flagged optional or swappable.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <BundleEditor products={products} variants={variants} />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
