import Link from 'next/link';
import { PackageOpen, Package2, Plus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { configuratorService } from '@sparx/commerce';
import {
  Badge,
  Button,
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

// Bundles — kit / pack / gift-set wrappers around N component variants.
// One wrapper product = one bundle, set via `bundleProductId`. The
// configurator + cart pipelines decrement inventory per inventoryMode.

export const dynamic = 'force-dynamic';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default async function BundlesPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Kits, packs, and gift sets."
        description="Activate the Commerce module from Billing to manage bundles."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const bundles = await configuratorService.listBundles(ctx);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Package2 className="h-5 w-5" />
              <Heading level={1}>Bundles</Heading>
              <Badge variant="module">{bundles.length}</Badge>
            </Stack>
            <Text variant="muted">
              A bundle is a wrapper product that resolves to a fixed set of component variants. Use
              the Configurator instead when components are user-selectable.
            </Text>
          </Stack>
          <Button asChild>
            <Link href="/commerce/bundles/new">
              <Plus className="h-4 w-4" />
              Create bundle
            </Link>
          </Button>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>All bundles</Heading>
              <CardDescription>
                Click a row to edit components, pricing mode, or inventory behavior.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {bundles.length === 0 ? (
              <EmptyState
                icon={<Package2 className="h-5 w-5" />}
                title="No bundles yet"
                description="Create a wrapper product first (e.g. ‘Starter Beauty Kit’), then bundle its components here."
                action={
                  <Button asChild>
                    <Link href="/commerce/bundles/new">Create bundle</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bundle product</TableHead>
                    <TableHead>Components</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead>Inventory</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundles.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/bundles/${b.id}`}
                          entityType="bundle"
                          entityId={b.id}
                          className="hover:text-[var(--module-active)]"
                        >
                          {b.bundleProductTitle}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>{b.componentCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{b.pricingMode}</Badge>
                        {b.pricingMode === 'fixed' && b.fixedPriceCents != null && (
                          <Text size="xs" variant="muted" className="mt-1">
                            {moneyFmt.format(b.fixedPriceCents / 100)}
                          </Text>
                        )}
                        {b.pricingMode === 'percent_off_sum' && b.percentOffSum != null && (
                          <Text size="xs" variant="muted" className="mt-1">
                            {b.percentOffSum}% off
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {b.inventoryMode}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" variant="muted">
                          {new Date(b.updatedAt).toLocaleDateString()}
                        </Text>
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
