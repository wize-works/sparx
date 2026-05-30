import Link from 'next/link';
import { PackageOpen, Plus, Tag } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { discountService } from '@sparx/commerce';
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

import { DiscountStatusToggle } from './_components/discount-status-toggle';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default async function DiscountsPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Codes, automatic discounts, BOGO."
        description="Activate the Commerce module from Billing to manage discounts."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const discounts = await discountService.listDiscounts(ctx);

  const active = discounts.filter((d) => d.status === 'active');
  const draft = discounts.filter((d) => d.status === 'draft');

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Tag className="h-5 w-5" />
              <Heading level={1}>Discounts</Heading>
              <Badge variant="module">
                {active.length} active · {draft.length} draft
              </Badge>
            </Stack>
            <Text variant="muted">
              Codes activate when a shopper enters them; automatic discounts apply silently when
              their conditions match. Stacking rules govern combining with subscribe-and-save and
              loyalty.
            </Text>
          </Stack>
          <Button asChild>
            <Link href="/commerce/discounts/new">
              <Plus className="h-4 w-4" />
              Create discount
            </Link>
          </Button>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>All discounts</Heading>
              <CardDescription>
                Higher-priority discounts evaluate first when multiple are eligible. Per-customer
                limits and total caps are enforced at redemption time.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {discounts.length === 0 ? (
              <EmptyState
                icon={<Tag className="h-5 w-5" />}
                title="No discounts yet"
                description="Create a code (e.g. WELCOME10) for new-customer promos, or an automatic discount that applies when conditions are met."
                action={
                  <Button asChild>
                    <Link href="/commerce/discounts/new">Create discount</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code / Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Stack gap={0}>
                          {d.code ? (
                            <span className="font-mono text-xs">{d.code}</span>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              automatic
                            </Badge>
                          )}
                          <Text size="xs" variant="muted">
                            {d.name}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{d.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {d.type === 'percent' && `${d.valuePercent}%`}
                        {d.type === 'fixed' && moneyFmt.format((d.valueCents ?? 0) / 100)}
                        {d.type === 'free_shipping' && 'free shipping'}
                        {d.type === 'buy_x_get_y' && 'BOGO'}
                        {d.type === 'bundle' && 'bundle'}
                      </TableCell>
                      <TableCell>
                        {d.usageCount}
                        {d.totalUsageLimit !== null ? ` / ${d.totalUsageLimit}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status] ?? 'outline'}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <DiscountStatusToggle discountId={d.id} status={d.status} />
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
