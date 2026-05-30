import { notFound } from 'next/navigation';
import { Package2, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { CommerceNotFoundError, configuratorService } from '@sparx/commerce';
import { withTenant } from '@sparx/db';
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

import { ModuleStub } from '../../../../../components/module-stub';

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

export async function BundleDetailContent({ id }: Props) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to manage bundles."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let bundle;
  try {
    bundle = await configuratorService.getBundle(ctx, id);
  } catch (err) {
    if (err instanceof CommerceNotFoundError) notFound();
    throw err;
  }

  const variants = await loadVariants(ctx);
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

async function loadVariants(ctx: { tenantId: string; userId: string }): Promise<VariantOption[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productVariant.findMany({
      where: { deletedAt: null },
      orderBy: [{ product: { title: 'asc' } }, { sku: 'asc' }],
      take: 500,
      select: {
        id: true,
        sku: true,
        title: true,
        priceCents: true,
        product: { select: { id: true, title: true } },
      },
    });
    return rows.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      priceCents: v.priceCents,
      productId: v.product.id,
      productTitle: v.product.title,
    }));
  });
}
