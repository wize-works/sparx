import { notFound } from 'next/navigation';
import { Layers, Sparkles, Star } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
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

import { CollectionMembershipEditor } from './_components/collection-membership-editor';
import { CollectionMetaForm } from './_components/collection-meta-form';

interface CollectionDetail {
  id: string;
  name: string;
  handle: string;
  type: 'manual' | 'rules';
  productCount: number;
  featured: boolean;
  updatedAt: string;
  description: string | null;
  heroMediaId: string | null;
  ruleSet: Record<string, unknown> | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  productIds: string[];
  createdAt: string;
}

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

interface Props {
  id: string;
}

export async function CollectionDetailContent({ id }: Props) {
  let collection: CollectionDetail;
  try {
    collection = await api.get<CollectionDetail>(`/v1/commerce/collections/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const { items: allProducts } = await api.get<ProductListResponse>(
    '/v1/commerce/products?take=250'
  );

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={4}>
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{collection.name}</Heading>
            <Badge color={collection.type === 'rules' ? 'module' : 'outline'}>
              {collection.type === 'rules' ? (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  rules
                </>
              ) : (
                'manual'
              )}
            </Badge>
            {collection.featured && (
              <Badge variant="outline">
                <Star className="mr-1 h-3 w-3" />
                featured
              </Badge>
            )}
          </Stack>
          <Stack direction="row" align="center" gap={2}>
            <Text size="sm" variant="muted">
              /{collection.handle}
            </Text>
            <Text size="sm" variant="muted">
              · {collection.productCount} product{collection.productCount === 1 ? '' : 's'}
            </Text>
          </Stack>
        </Stack>
      </Stack>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">
            <Layers className="mr-2 h-4 w-4" />
            Products
            <Badge variant="outline" className="ml-2 text-xs">
              {collection.productCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="meta">Metadata</TabsTrigger>
          {collection.type === 'rules' && <TabsTrigger value="rules">Rules</TabsTrigger>}
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Membership</Heading>
                <CardDescription>
                  {collection.type === 'manual'
                    ? 'Pick which products belong to this collection. Order maps to storefront sort.'
                    : 'Rules-driven membership is read-only here. Edit the ruleSet on the Rules tab; the indexer worker re-projects on the next flush.'}
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <CollectionMembershipEditor
                collectionId={collection.id}
                type={collection.type}
                selectedProductIds={collection.productIds}
                allProducts={allProducts.map((p) => ({
                  id: p.id,
                  title: p.title,
                  handle: p.handle,
                  status: p.status,
                  vendor: p.vendor,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meta">
          <CollectionMetaForm
            collectionId={collection.id}
            name={collection.name}
            handle={collection.handle}
            description={collection.description}
            featured={collection.featured}
            seoTitle={collection.seoTitle}
            seoDescription={collection.seoDescription}
          />
        </TabsContent>

        {collection.type === 'rules' && (
          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <Heading level={3}>Rule editor — Phase 1.5</Heading>
                <CardDescription>
                  The full rule editor (title / vendor / product_type / tag / price / inventory /
                  fitment predicates with AND/OR matching) lands alongside the commerce-indexer
                  worker. Today this collection&apos;s seeded ruleSet is persisted as-is; merchants
                  can still edit metadata and watch the projection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3 text-xs">
                  {JSON.stringify(collection.ruleSet ?? {}, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </Stack>
  );
}
