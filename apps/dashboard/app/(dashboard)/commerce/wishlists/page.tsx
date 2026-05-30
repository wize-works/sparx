import { Heart, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { reviewService } from '@sparx/commerce';
import { withTenant } from '@sparx/db';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../components/module-stub';

export const dynamic = 'force-dynamic';

// Wishlist analytics — read-only "what's most-saved" view. Useful for
// restock prioritization, promo selection, and the abandoned-wishlist
// recovery email (future worker).
export default async function WishlistsPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Wishlist analytics."
        description="Activate the Commerce module from Billing to see what customers are saving."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [topVariants, wishlistCount, itemCount] = await Promise.all([
    reviewService.topWishlistedVariants(ctx, 50),
    withTenant(ctx, (tx) => tx.wishlist.count()),
    withTenant(ctx, (tx) => tx.wishlistItem.count()),
  ]);

  const variantIds = topVariants.map((v) => v.variantId);
  const variants =
    variantIds.length > 0
      ? await withTenant(ctx, (tx) =>
          tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            include: { product: { select: { title: true } } },
          })
        )
      : [];
  const byId = new Map(variants.map((v) => [v.id, v]));

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Heart className="h-5 w-5" />
            <Heading level={1}>Wishlists</Heading>
            <Badge variant="module">
              {wishlistCount} lists · {itemCount} items
            </Badge>
          </Stack>
          <Text variant="muted">
            Analytics view. Customers own their wishlists; staff do not edit them. Use this list to
            decide restock priority, promo targeting, and which abandoned-wishlist nudges to send.
          </Text>
        </Stack>

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
                  {topVariants.map((row) => {
                    const v = byId.get(row.variantId);
                    return (
                      <TableRow key={row.variantId}>
                        <TableCell>
                          <Text size="xs" className="font-mono">
                            {row.variantId.slice(0, 8)}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Text size="xs" className="font-mono">
                            {v?.sku ?? '—'}
                          </Text>
                        </TableCell>
                        <TableCell>{v?.product?.title ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{row.saveCount}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
