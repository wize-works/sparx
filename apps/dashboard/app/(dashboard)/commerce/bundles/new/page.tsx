import Link from 'next/link';
import { ArrowLeft, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
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

import { ModuleStub } from '../../../../../components/module-stub';

import {
  BundleEditor,
  type BundleProductOption,
  type VariantOption,
} from '../_components/bundle-editor';

export const dynamic = 'force-dynamic';

export default async function NewBundlePage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to create bundles."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [products, variants] = await Promise.all([loadBundleProducts(ctx), loadVariants(ctx)]);

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

async function loadBundleProducts(ctx: {
  tenantId: string;
  userId: string;
}): Promise<BundleProductOption[]> {
  return withTenant(ctx, async (tx) => {
    // Wrap-eligible products: not deleted, no existing bundle row, any status.
    const taken = await tx.bundle.findMany({ select: { bundleProductId: true } });
    const takenIds = new Set(taken.map((b) => b.bundleProductId));
    const rows = await tx.product.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      take: 500,
      select: { id: true, title: true, handle: true, status: true },
    });
    return rows
      .filter((r) => !takenIds.has(r.id))
      .map((r) => ({ id: r.id, title: r.title, handle: r.handle, status: r.status }));
  });
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
