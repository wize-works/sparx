import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  Heading,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { FitmentPanel } from './_components/fitment-panel';
import { InventoryPanel } from './_components/inventory-panel';
import { ProductEditForm } from './_components/product-edit-form';
import { ProductStatusBar } from './_components/product-status-bar';
import { VariantsPanel } from './_components/variants-panel';

type ProductStatus = 'active' | 'draft' | 'archived';

interface ProductDetail {
  id: string;
  tenantId: string;
  title: string;
  handle: string;
  description: string | null;
  status: ProductStatus;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  fulfillmentType: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  hazmatClass: string;
  requiresShipping: boolean;
  taxClass: string | null;
  originCountry: string | null;
  hsCode: string | null;
  metadata: Record<string, unknown>;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  defaultWarehouseId: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  inStock: boolean;
  averageRating: number | null;
  reviewCount: number;
  variantCount: number;
  optionCount: number;
  categoryIds: string[];
  collectionIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface OptionValueRow {
  id: string;
  optionId: string;
  value: string;
  swatchHex: string | null;
  swatchImageId: string | null;
  position: number;
}

interface OptionRow {
  id: string;
  productId: string;
  name: string;
  displayType: string;
  position: number;
  values: OptionValueRow[];
}

interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  title: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  costCents: number | null;
  currency: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  inventoryPolicy: string;
  requiresShipping: boolean;
  fulfillmentType: string | null;
  dropshipSourceId: string | null;
  isDefault: boolean;
  position: number;
  metadata: Record<string, unknown>;
  optionValueIds: string[];
  imageCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ProductFitmentRow {
  id: string;
  productId: string;
  domainId: string;
  domainSlug: string;
  categoryId: string;
  categoryName: string;
  itemId: string | null;
  itemName: string | null;
  variantId: string | null;
  variantName: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  notes: string | null;
}

interface FitmentDomainRow {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  labels: { l1: string; l2?: string; l3?: string; range?: string };
  rangeUnit: string | null;
  isGlobal: boolean;
  categoryCount: number;
}

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InventoryLevelRow {
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
  unitCostCents: number | null;
  updatedAt: string;
}

// Detail content for a commerce product. Mounted by both the full-page
// route and the dashboard shell's drawer / modal. Container width + back
// link live in page.tsx.

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

interface Props {
  id: string;
}

export async function ProductDetailContent({ id }: Props) {
  let product: ProductDetail;
  try {
    product = await api.get<ProductDetail>(`/v1/commerce/products/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const [options, variants, fitments, domains, warehouses] = await Promise.all([
    api.get<OptionRow[]>(`/v1/commerce/products/${id}/variants/options`),
    api.get<VariantRow[]>(`/v1/commerce/products/${id}/variants?include_archived=true`),
    api.get<ProductFitmentRow[]>(`/v1/commerce/products/${id}/fitment`),
    api.get<FitmentDomainRow[]>('/v1/commerce/fitment/domains'),
    api.get<WarehouseRow[]>('/v1/commerce/warehouses'),
  ]);

  const inventoryLevels = await Promise.all(
    variants.map(async (variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      variantTitle: variant.title,
      levels: await api.get<InventoryLevelRow[]>(
        `/v1/commerce/inventory/levels/variant/${variant.id}`
      ),
    }))
  );

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={4}>
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{product.title}</Heading>
            <Badge color={STATUS_VARIANT[product.status] ?? 'outline'}>{product.status}</Badge>
            {product.fulfillmentType !== 'physical' && (
              <Badge variant="outline">{product.fulfillmentType}</Badge>
            )}
            {product.hazmatClass !== 'none' && (
              <Badge color="warning">hazmat: {product.hazmatClass}</Badge>
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
          <VariantsPanel
            productId={product.id}
            productTitle={product.title}
            options={options}
            variants={variants}
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
          <InventoryPanel
            productId={product.id}
            variantsWithLevels={inventoryLevels}
            warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
          />
        </TabsContent>

        <TabsContent value="fitment">
          <FitmentPanel
            productId={product.id}
            productTitle={product.title}
            fitments={fitments}
            domains={domains.map((d) => ({
              id: d.id,
              slug: d.slug,
              displayName: d.displayName,
              labels: d.labels,
              rangeUnit: d.rangeUnit,
            }))}
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
