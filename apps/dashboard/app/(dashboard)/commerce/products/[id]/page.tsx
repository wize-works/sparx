import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { CommerceNotFoundError, productService } from '@sparx/commerce';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  Container,
  Heading,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../../components/module-stub';

import { ProductEditForm } from './_components/product-edit-form';
import { ProductStatusBar } from './_components/product-status-bar';

// Product detail. Phase 1.1 surfaces:
//   • header (title, handle, status badge, publish/archive controls)
//   • Overview tab — inline edit of the basics + organization + shipping
//   • Variants, Media, Pricing, Inventory, Fitment, Configurator, SEO tabs
//     stub out their content until their Phase lands. Tabs already render
//     so navigation feels permanent; each empty pane carries a short
//     "wires in Phase N" note so it doesn't read as broken.

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Commerce is disabled. Activate it from Billing to view products."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let product;
  try {
    product = await productService.get(ctx, id);
  } catch (err) {
    if (err instanceof CommerceNotFoundError) notFound();
    throw err;
  }

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/products"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to products
          </Link>
          <Stack direction="row" align="end" justify="between" wrap gap={4}>
            <Stack gap={2}>
              <Stack direction="row" align="center" gap={3} wrap>
                <Heading level={1}>{product.title}</Heading>
                <Badge variant={STATUS_VARIANT[product.status] ?? 'outline'}>
                  {product.status}
                </Badge>
                {product.fulfillmentType !== 'physical' && (
                  <Badge variant="outline">{product.fulfillmentType}</Badge>
                )}
                {product.hazmatClass !== 'none' && (
                  <Badge variant="warning">hazmat: {product.hazmatClass}</Badge>
                )}
              </Stack>
              <Stack direction="row" align="center" gap={2}>
                <Text size="sm" variant="muted">
                  /{product.handle}
                </Text>
                {product.status === 'active' && (
                  <a
                    href={`https://storefront.placeholder/products/${product.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--module-active)]"
                  >
                    View on storefront
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </Stack>
            </Stack>
            <ProductStatusBar
              productId={product.id}
              status={product.status}
              hasVariants={product.variantCount > 0}
            />
          </Stack>
        </Stack>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="variants">
              Variants
              {product.variantCount > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {product.variantCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="fitment">Fitment</TabsTrigger>
            <TabsTrigger value="configurator">Configurator</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ProductEditForm product={product} />
          </TabsContent>

          <TabsContent value="variants">
            <PhaseStub
              title="Variants — Phase 1.2"
              description="Option matrix (Color × Size × Material), per-color image pinning, SKU / barcode / price / weight per row, inventory policy, dropship sourcing."
            />
          </TabsContent>

          <TabsContent value="media">
            <PhaseStub
              title="Media — Phase 1.2"
              description="Image gallery, 360 spin, video, swap+sort, alt text. Reuses the CMS media picker."
            />
          </TabsContent>

          <TabsContent value="pricing">
            <PhaseStub
              title="Pricing — Phase 3"
              description="Price lists, bulk-quantity tiers, contract prices for B2B accounts, automatic discount eligibility preview."
            />
          </TabsContent>

          <TabsContent value="inventory">
            <PhaseStub
              title="Inventory — Phase 2"
              description="Per-warehouse on-hand / allocated / available, low-stock thresholds, lot + serial tracking, reservation timeline."
            />
          </TabsContent>

          <TabsContent value="fitment">
            <PhaseStub
              title="Fitment — Phase 1.4"
              description="Vehicle make / model / engine compatibility. Year range, notes, bulk-assign from a fitment-export CSV (Gillett Diesel reference case)."
            />
          </TabsContent>

          <TabsContent value="configurator">
            <PhaseStub
              title="Configurator — Phase 4"
              description="Option matrix + conditional rules + add-ons. Visual rule editor and config sandbox for built-to-order products."
            />
          </TabsContent>

          <TabsContent value="seo">
            <ProductSeoPanel product={product} />
          </TabsContent>
        </Tabs>
      </Stack>
    </Container>
  );
}

function PhaseStub({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent>
        <Stack gap={2} className="py-6 text-center">
          <Heading level={4}>{title}</Heading>
          <Text variant="muted">{description}</Text>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ProductSeoPanel({
  product,
}: {
  product: { seoTitle: string | null; seoDescription: string | null; handle: string };
}) {
  return (
    <Card>
      <CardHeader>
        <Heading level={3}>Search engine listing</Heading>
        <Text variant="muted" size="sm">
          What this product looks like in Google / Bing results.
        </Text>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          <Stack
            gap={1}
            className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
          >
            <Text size="sm" className="text-blue-700">
              {product.seoTitle ?? '(set a title to preview)'}
            </Text>
            <Text size="xs" variant="muted">
              storefront.example/products/{product.handle}
            </Text>
            <Text size="xs">{product.seoDescription ?? '(set a description to preview)'}</Text>
          </Stack>
          <Text size="xs" variant="muted">
            SEO fields edit alongside the basics on the Overview tab.
          </Text>
        </Stack>
      </CardContent>
    </Card>
  );
}
