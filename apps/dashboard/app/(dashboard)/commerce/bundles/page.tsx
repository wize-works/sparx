import Link from 'next/link';
import { Package2, Plus } from 'lucide-react';

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
import { EntityRowLink } from '../../_components/entity-row-link';

interface BundleRow {
  id: string;
  bundleProductId: string;
  bundleProductTitle: string;
  pricingMode: string;
  fixedPriceCents: number | null;
  percentOffSum: number | null;
  inventoryMode: string;
  componentCount: number;
  updatedAt: string;
}

// Bundles — kit / pack / gift-set wrappers around N component variants.
// One wrapper product = one bundle, set via `bundleProductId`. The
// configurator + cart pipelines decrement inventory per inventoryMode.

export const dynamic = 'force-dynamic';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default async function BundlesPage() {
  const bundles = await api.get<BundleRow[]>('/v1/commerce/bundles');

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Package2 className="h-5 w-5" />}
          title="Bundles"
          badge={<Badge color="module">{bundles.length}</Badge>}
          description="A bundle is a wrapper product that resolves to a fixed set of component variants. Use the Configurator instead when components are user-selectable."
          actions={
            <Button color="module" asChild>
              <Link href="/commerce/bundles/new">
                <Plus className="h-4 w-4" />
                Create bundle
              </Link>
            </Button>
          }
        />

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
                  <Button color="module" asChild>
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
