import { notFound } from 'next/navigation';
import { Package2 } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import {
  BundleEditor,
  type ComponentDraft,
  type VariantOption,
} from '../_components/bundle-editor';
import { BundleDeleteButton } from './_components/bundle-delete-button';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface BundleComponent {
  id: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  defaultQuantity: number;
  isRequired: boolean;
  isSwappable: boolean;
  swappableProductId: string | null;
  position: number;
}

interface BundleDetail {
  id: string;
  bundleProductId: string;
  bundleProductTitle: string;
  pricingMode: string;
  fixedPriceCents: number | null;
  percentOffSum: number | null;
  inventoryMode: string;
  componentCount: number;
  updatedAt: string;
  components: BundleComponent[];
}

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

export async function BundleDetailContent({ id }: Props) {
  let bundle: BundleDetail;
  try {
    bundle = await api.get<BundleDetail>(`/v1/commerce/bundles/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const variantRows = await api.get<VariantListRow[]>('/v1/commerce/variants?take=500');
  const variants: VariantOption[] = variantRows.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    priceCents: v.priceCents,
    productId: v.productId,
    productTitle: v.productTitle,
  }));

  const initialComponents: ComponentDraft[] = bundle.components.map((c) => ({
    variantId: c.variantId,
    defaultQuantity: c.defaultQuantity,
    isRequired: c.isRequired,
    isSwappable: c.isSwappable,
    swappableProductId: c.swappableProductId,
    position: c.position,
  }));

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={4}>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={3} wrap>
            <Package2 className="h-5 w-5" />
            <Heading level={1}>{bundle.bundleProductTitle}</Heading>
            <Badge variant="outline">{bundle.pricingMode}</Badge>
            <Badge variant="outline">{bundle.inventoryMode}</Badge>
          </Stack>
          <Text size="sm" variant="muted">
            {bundle.componentCount} component{bundle.componentCount === 1 ? '' : 's'} · updated{' '}
            {new Date(bundle.updatedAt).toLocaleDateString()}
          </Text>
        </Stack>
        <BundleDeleteButton bundleId={bundle.id} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Configuration</Heading>
            <CardDescription>
              Edit pricing, inventory mode, and component list. Saving replaces the entire component
              list (small + simple beats diffing).
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <BundleEditor
            bundleId={bundle.id}
            products={[]}
            variants={variants}
            initialBundleProductId={bundle.bundleProductId}
            initialPricingMode={
              bundle.pricingMode as 'sum_of_components' | 'fixed' | 'percent_off_sum'
            }
            initialFixedPriceCents={bundle.fixedPriceCents}
            initialPercentOffSum={bundle.percentOffSum}
            initialInventoryMode={
              bundle.inventoryMode as 'decrement_components' | 'decrement_bundle_sku'
            }
            initialComponents={initialComponents}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}
