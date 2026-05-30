import Link from 'next/link';
import { DollarSign, PackageOpen, Plus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { pricingService } from '@sparx/commerce';
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
import { EntityRowLink } from '../../_components/entity-row-link';

// Pricing — price lists, contract prices, bulk tiers.
// Resolution order is locked: contract → price list → bulk tier → base
// (see packages/commerce/src/services/pricing-service.ts). This page
// shows all three layers + lets staff manage price lists; per-list entry
// editing lives on the detail page.

export const dynamic = 'force-dynamic';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

export default async function PricingPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Price lists, B2B contracts, bulk discounts."
        description="Activate the Commerce module from Billing to manage pricing."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [priceLists, bulkTiers] = await Promise.all([
    pricingService.listPriceLists(ctx),
    pricingService.listBulkTiers(ctx),
  ]);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <DollarSign className="h-5 w-5" />
              <Heading level={1}>Pricing</Heading>
              <Badge variant="module">{priceLists.length} price lists</Badge>
            </Stack>
            <Text variant="muted">
              Resolution order: B2B contract price → price list → bulk tier → variant base.
              Discounts apply on top via the Discounts page.
            </Text>
          </Stack>
          <Button asChild>
            <Link href="/commerce/pricing/new">
              <Plus className="h-4 w-4" />
              Add price list
            </Link>
          </Button>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Price lists</Heading>
              <CardDescription>
                Channel/segment/B2B-targeted price overrides. Higher priority wins when multiple
                lists are eligible.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {priceLists.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-5 w-5" />}
                title="No price lists yet"
                description="Create one to offer per-channel pricing (e.g. B2B portal at 15% off) or per-segment pricing (e.g. wholesale customers)."
                action={
                  <Button asChild>
                    <Link href="/commerce/pricing/new">Create price list</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Entries</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceLists.map((list) => (
                    <TableRow key={list.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/pricing/${list.id}`}
                          entityType="price-list"
                          entityId={list.id}
                          className="hover:text-[var(--module-active)]"
                        >
                          {list.name}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{list.currency}</span>
                      </TableCell>
                      <TableCell>
                        {list.channel ? (
                          <Badge variant="outline">{list.channel}</Badge>
                        ) : (
                          <Text size="xs" variant="muted">
                            all
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>{list.priority}</TableCell>
                      <TableCell>{list.entryCount}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[list.status] ?? 'outline'}>
                          {list.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Bulk price tiers</Heading>
              <CardDescription>
                Quantity ramps without a discount code. Variant-scoped tiers override list-scoped
                tiers when both apply.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {bulkTiers.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-5 w-5" />}
                title="No bulk tiers yet"
                description="Add a quantity ramp from a product detail page (Pricing tab) or a price list (Bulk tiers tab)."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Min qty</TableHead>
                    <TableHead>Unit price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkTiers.map((tier) => (
                    <TableRow key={tier.id}>
                      <TableCell>
                        {tier.variantId ? (
                          <Badge variant="outline">variant</Badge>
                        ) : (
                          <Badge variant="outline">price list</Badge>
                        )}
                      </TableCell>
                      <TableCell>{tier.minQuantity}+</TableCell>
                      <TableCell>{moneyFmt.format(tier.unitPriceCents / 100)}</TableCell>
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
