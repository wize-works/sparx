import { Heart } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  PageHeader,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

export const dynamic = 'force-dynamic';

interface TopVariant {
  variantId: string;
  sku: string;
  variantTitle: string | null;
  productId: string;
  productTitle: string;
  productHandle: string;
  saveCount: number;
}

interface WishlistAnalytics {
  wishlistCount: number;
  itemCount: number;
  topVariants: TopVariant[];
}

export default async function WishlistsPage() {
  const analytics = await api.get<WishlistAnalytics>('/v1/commerce/wishlists/analytics?take=50');
  const { wishlistCount, itemCount, topVariants } = analytics;

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Heart className="h-5 w-5" />}
          title="Wishlists"
          badge={
            <Badge color="module">
              {wishlistCount} lists · {itemCount} items
            </Badge>
          }
          description="Analytics view. Customers own their wishlists; staff do not edit them. Use this list to decide restock priority, promo targeting, and which abandoned-wishlist nudges to send."
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Most-saved variants</Heading>
              <CardDescription>
                Aggregated across every customer wishlist in the tenant. Top 50.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {topVariants.length === 0 ? (
              <EmptyState
                icon={<Heart className="h-5 w-5" />}
                title="No saves yet"
                description="Once the storefront ships, wishlist saves show up here within seconds."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Saved by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topVariants.map((row) => (
                    <TableRow key={row.variantId}>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {row.variantId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {row.sku}
                        </Text>
                      </TableCell>
                      <TableCell>{row.productTitle}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{row.saveCount}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
