import Link from 'next/link';
import { BarChart3, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { reportingService } from '@sparx/commerce';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
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

const RANGES: { value: string; label: string; days: number }[] = [
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: 'ytd', label: 'Year to date', days: -1 },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Reports."
        description="Activate the Commerce module from Billing to view revenue, conversion, and subscription metrics."
        features={[]}
      />
    );
  }

  const { range: rangeParam } = await searchParams;
  const rangeSpec = RANGES.find((r) => r.value === rangeParam) ?? RANGES[1]!;
  const range = computeRange(rangeSpec);

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [revenue, topProducts, topCustomers, funnel, abandonment, subs, inventory] =
    await Promise.all([
      reportingService.revenueSummary(ctx, range),
      reportingService.topProducts(ctx, { range, limit: 10 }),
      reportingService.topCustomers(ctx, { range, limit: 10 }),
      reportingService.conversionFunnel(ctx, range),
      reportingService.abandonedCarts(ctx, range),
      reportingService.subscriptionMetrics(ctx, range),
      reportingService.inventoryValuation(ctx),
    ]);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <BarChart3 className="h-5 w-5" />
            <Heading level={1}>Reports</Heading>
            <Badge variant="module">{revenue.rangeLabel}</Badge>
          </Stack>
          <Text variant="muted">
            Live queries — no nightly rollup yet. Use the range selector to scope the period; the
            inventory valuation is always as-of-now since stock on hand is a point-in-time value.
          </Text>
        </Stack>

        <Stack direction="row" gap={2} wrap>
          {RANGES.map((r) => (
            <FilterLink key={r.value} current={rangeParam} value={r.value} label={r.label} />
          ))}
        </Stack>

        <Stack direction="row" gap={3} wrap>
          <Kpi label="Orders" value={revenue.ordersCount.toLocaleString()} />
          <Kpi
            label="Gross revenue"
            value={fmt(revenue.grossRevenueCents, revenue.currency)}
          />
          <Kpi label="Net revenue" value={fmt(revenue.netRevenueCents, revenue.currency)} />
          <Kpi label="AOV" value={fmt(revenue.averageOrderValueCents, revenue.currency)} />
          <Kpi label="Refunded" value={fmt(revenue.refundedCents, revenue.currency)} />
        </Stack>

        <Stack direction="row" gap={4} wrap>
          <Card className="min-w-[20rem] flex-1">
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Conversion funnel</Heading>
                <CardDescription>
                  Sessions land once analytics tooling is wired; the rest is from carts +
                  checkout-sessions + orders.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                <Row label="Carts created" value={funnel.cartsCreated.toLocaleString()} />
                <Row
                  label="Checkouts started"
                  value={`${funnel.checkoutsStarted.toLocaleString()} (${pct(funnel.cartToCheckoutRate)})`}
                />
                <Row
                  label="Orders placed"
                  value={`${funnel.ordersPlaced.toLocaleString()} (${pct(funnel.checkoutToOrderRate)})`}
                />
                <Row
                  label="Cart → order"
                  value={pct(funnel.overallConversion)}
                  bold
                />
              </Stack>
            </CardContent>
          </Card>

          <Card className="min-w-[20rem] flex-1">
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Abandoned carts</Heading>
                <CardDescription>
                  Recovery worker flips <code>recoveredAt</code> when a cart converts. Recovery
                  rate is recovered/(abandoned+recovered) inside the range.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                <Row
                  label="Abandoned"
                  value={abandonment.abandonedCount.toLocaleString()}
                />
                <Row
                  label="Recovered"
                  value={abandonment.recoveredCount.toLocaleString()}
                />
                <Row label="Recovery rate" value={pct(abandonment.recoveryRate)} bold />
                <Row
                  label="Recovered revenue"
                  value={fmt(abandonment.recoveredRevenueCents, revenue.currency)}
                />
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <Stack direction="row" gap={4} wrap>
          <Card className="min-w-[20rem] flex-1">
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Subscriptions</Heading>
                <CardDescription>
                  MRR estimate normalizes weekly/yearly cadences to a monthly factor. Churn counts
                  cancellations inside the period; new counts subscriptions whose row was created
                  in the period.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                <Row label="Active" value={subs.activeCount.toLocaleString()} />
                <Row label="MRR" value={fmt(subs.mrrCents, subs.currency)} bold />
                <Row label="New" value={subs.newThisPeriod.toLocaleString()} />
                <Row label="Churned" value={subs.churnedThisPeriod.toLocaleString()} />
              </Stack>
            </CardContent>
          </Card>

          <Card className="min-w-[20rem] flex-1">
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Inventory valuation</Heading>
                <CardDescription>
                  Sum of on-hand × cost (cost basis) and on-hand × price (retail basis). As of{' '}
                  {new Date(inventory.asOf).toLocaleString()}.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                <Row label="Units on hand" value={inventory.totalUnits.toLocaleString()} />
                <Row
                  label="At cost"
                  value={fmt(inventory.totalCostCents, inventory.currency)}
                />
                <Row
                  label="At retail"
                  value={fmt(inventory.totalRetailCents, inventory.currency)}
                  bold
                />
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Top products</Heading>
              <CardDescription>By revenue in the selected range.</CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <Text variant="muted" size="sm">
                No orders in this range.
              </Text>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell>{p.productTitle}</TableCell>
                      <TableCell className="text-right">{p.unitsSold.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {fmt(p.revenueCents, revenue.currency)}
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
              <Heading level={3}>Top customers</Heading>
              <CardDescription>By spend in the selected range.</CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <Text variant="muted" size="sm">
                No orders in this range.
              </Text>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c) => (
                    <TableRow key={c.customerId}>
                      <TableCell>{c.customerName}</TableCell>
                      <TableCell className="text-right">{c.ordersCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {fmt(c.totalSpentCents, revenue.currency)}
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

function computeRange(spec: { days: number }): { from: string; to: string } {
  const to = new Date();
  let from: Date;
  if (spec.days < 0) {
    // YTD
    from = new Date(to.getFullYear(), 0, 1);
  } else {
    from = new Date(to.getTime() - spec.days * 24 * 60 * 60 * 1000);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string;
  label: string;
}) {
  const isActive = current === value || (current === undefined && value === '30d');
  return (
    <Link
      href={`/commerce/reports?range=${value}`}
      className={
        isActive
          ? 'rounded bg-[var(--module-active)] px-3 py-1 text-xs text-white'
          : 'rounded border border-[var(--color-border-default)] px-3 py-1 text-xs hover:bg-[var(--color-bg-subtle)]'
      }
    >
      {label}
    </Link>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-[10rem] flex-1">
      <CardContent className="py-4">
        <Stack gap={1}>
          <Text size="xs" variant="muted">
            {label}
          </Text>
          <Text className="text-2xl font-semibold">{value}</Text>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Stack direction="row" gap={4} justify="between">
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <Text size="sm" className={bold ? 'font-semibold' : ''}>
        {value}
      </Text>
    </Stack>
  );
}

function fmt(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${currency} ${dollars.toLocaleString()}.${remainder.toString().padStart(2, '0')}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
