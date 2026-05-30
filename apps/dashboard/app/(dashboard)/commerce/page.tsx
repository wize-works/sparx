import Link from 'next/link';
import {
  Boxes,
  Layers,
  PackageOpen,
  Plug,
  PlusCircle,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Truck,
  Warehouse,
} from 'lucide-react';

import { requireSession } from '@sparx/auth';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Heading,
  Stack,
  Stat,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

// Commerce landing — KPI strip + quick-actions grid. Module gate lives in
// the parent layout; by the time we hit this page Commerce is active. All
// reporting service stubs are hit through /v1/commerce/reports/* and the
// page fails-soft on each call ("—" when a metric isn't computable yet).

export const dynamic = 'force-dynamic';

interface RevenueSummary {
  netRevenueCents: number;
  averageOrderValueCents: number;
  ordersCount: number;
  currency: string;
}

interface ConversionFunnel {
  sessions: number;
  ordersPlaced: number;
  overallConversion: number;
}

interface SubscriptionMetrics {
  mrrCents: number;
  currency: string;
  activeCount: number;
  newThisPeriod: number;
  churnedThisPeriod: number;
}

interface AbandonedCarts {
  abandonedCount: number;
  recoveredCount: number;
  recoveryRate: number;
}

export default async function CommercePage() {
  const session = await requireSession();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const range = `from=${encodeURIComponent(thirtyDaysAgo.toISOString())}&to=${encodeURIComponent(now.toISOString())}`;

  const [revenue, funnel, subs, abandoned] = await Promise.all([
    api.get<RevenueSummary>(`/v1/commerce/reports/revenue-summary?${range}`).catch(() => null),
    api.get<ConversionFunnel>(`/v1/commerce/reports/conversion-funnel?${range}`).catch(() => null),
    api.get<SubscriptionMetrics>('/v1/commerce/reports/subscription-metrics').catch(() => null),
    api.get<AbandonedCarts>(`/v1/commerce/reports/abandoned-carts?${range}`).catch(() => null),
  ]);

  return (
    <Container className="py-10">
      <Stack gap={6}>
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Heading level={1}>Commerce</Heading>
            <Text variant="muted">Last 30 days · tenant {session.user.tenantId.slice(0, 8)}</Text>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button asChild variant="secondary">
              <Link href="/commerce/orders">View orders</Link>
            </Button>
            <Button asChild variant="module" leftIcon={<PlusCircle className="h-4 w-4" />}>
              <Link href="/commerce/products/new">New product</Link>
            </Button>
          </Stack>
        </Stack>

        <Grid cols={1} mdCols={2} gap={4}>
          <Stat
            icon={<Receipt className="h-4 w-4" />}
            label="Net revenue"
            value={fmtCurrency(revenue?.netRevenueCents, revenue?.currency)}
            hint={
              revenue
                ? `${revenue.ordersCount.toLocaleString()} orders · AOV ${fmtCurrency(
                    revenue.averageOrderValueCents,
                    revenue.currency
                  )}`
                : 'Awaiting first order'
            }
          />
          <Stat
            icon={<Sparkles className="h-4 w-4" />}
            label="Conversion"
            value={funnel ? `${(funnel.overallConversion * 100).toFixed(2)}%` : '—'}
            hint={
              funnel
                ? `${funnel.sessions.toLocaleString()} sessions → ${funnel.ordersPlaced.toLocaleString()} orders`
                : 'Sessions not yet tracked'
            }
          />
          <Stat
            icon={<RotateCcw className="h-4 w-4" />}
            label="Subscription MRR"
            value={fmtCurrency(subs?.mrrCents, subs?.currency)}
            hint={
              subs
                ? `${subs.activeCount} active · +${subs.newThisPeriod} new · −${subs.churnedThisPeriod} churned`
                : 'Activate auto-ship to grow MRR'
            }
          />
          <Stat
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Cart recovery"
            value={abandoned ? `${(abandoned.recoveryRate * 100).toFixed(1)}%` : '—'}
            hint={
              abandoned
                ? `${abandoned.recoveredCount}/${abandoned.abandonedCount} recovered`
                : 'Abandoned-cart automation not yet running'
            }
          />
        </Grid>

        <Stack gap={4}>
          <Stack direction="row" justify="between" align="center" wrap gap={3}>
            <Heading level={2}>Manage</Heading>
            <Badge variant="outline">Phase 0 scaffold — surfaces wire in Phase 1+</Badge>
          </Stack>
          <Grid cols={1} mdCols={2} gap={4}>
            {QUICK_LINKS.map((link) => (
              <Card key={link.href} variant="module">
                <CardContent>
                  <Stack direction="row" gap={3} align="start">
                    <span className="mt-0.5 text-[var(--module-active)]">{link.icon}</span>
                    <Stack gap={1} className="flex-1">
                      <Link href={link.href} className="font-medium hover:underline">
                        {link.title}
                      </Link>
                      <Text variant="muted">{link.description}</Text>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Stack>
      </Stack>
    </Container>
  );
}

const QUICK_LINKS = [
  {
    href: '/commerce/products',
    title: 'Products',
    description:
      'Variants, per-color images, fitment, configurable add-ons, bundles, subscriptions.',
    icon: <PackageOpen className="h-5 w-5" />,
  },
  {
    href: '/commerce/inventory',
    title: 'Inventory',
    description: 'Multi-warehouse stock, lots, serials, reorder thresholds, hazmat routing.',
    icon: <Warehouse className="h-5 w-5" />,
  },
  {
    href: '/commerce/pricing',
    title: 'Pricing',
    description: 'Price lists, contract prices for B2B, bulk-quantity tiers.',
    icon: <Tag className="h-5 w-5" />,
  },
  {
    href: '/commerce/discounts',
    title: 'Discounts & gift cards',
    description: 'Promo codes, automatic discounts, gift cards, store credit.',
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    href: '/commerce/subscriptions',
    title: 'Subscriptions',
    description: 'Auto-ship plans, dunning policy, customer self-service portal.',
    icon: <RotateCcw className="h-5 w-5" />,
  },
  {
    href: '/commerce/returns',
    title: 'Returns & RMA',
    description: 'Customer return requests, inspection queue, refund + restock.',
    icon: <Boxes className="h-5 w-5" />,
  },
  {
    href: '/commerce/shipping',
    title: 'Shipping',
    description: 'Zones, profiles, fallback rates, label printing, freight.',
    icon: <Truck className="h-5 w-5" />,
  },
  {
    href: '/commerce/reviews',
    title: 'Reviews & Q&A',
    description: 'Moderation queue, verified-purchase badges, merchant responses.',
    icon: <Star className="h-5 w-5" />,
  },
  {
    href: '/commerce/providers',
    title: 'Providers',
    description: 'Marketplace for payment, tax, shipping, and dropship integrations.',
    icon: <Plug className="h-5 w-5" />,
  },
  {
    href: '/commerce/configurator',
    title: 'Configurator',
    description: 'Option matrix + rules + add-ons. Play structures, beauty bundles, kits.',
    icon: <Layers className="h-5 w-5" />,
  },
];

function fmtCurrency(amountCents: number | undefined, currency: string | undefined): string {
  if (amountCents == null) return '—';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  });
  return formatter.format(amountCents / 100);
}
