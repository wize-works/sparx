import Link from 'next/link';
import { PackageOpen, ShoppingCart } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
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

// Diagnostic view — abandoned carts. Recovery emails will fire from the
// cart-abandonment worker once it lands; for now this is a read-only
// triage queue so support staff can manually nudge customers.

export default async function CartsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Abandoned cart triage."
        description="Activate the Commerce module from Billing to triage carts."
        features={[]}
      />
    );
  }

  const { filter } = await searchParams;
  const showRecovered = filter === 'recovered';
  const showActive = filter === 'active';

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const carts = await withTenant(ctx, async (tx) => {
    return tx.cart.findMany({
      where: showRecovered
        ? { recoveredAt: { not: null } }
        : showActive
          ? { abandonedAt: null, recoveredAt: null }
          : { abandonedAt: { not: null }, recoveredAt: null },
      include: {
        _count: { select: { items: true } },
        customer: { select: { email: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 250,
    });
  });

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <ShoppingCart className="h-5 w-5" />
            <Heading level={1}>Carts</Heading>
            <Badge variant="module">{carts.length} shown</Badge>
          </Stack>
          <Text variant="muted">
            Read-only diagnostic view. Abandoned carts are flagged by the cart-abandonment
            worker after 2 hours of inactivity; recovered carts converted into orders. Click an
            ID to inspect the line items and pricing trace.
          </Text>
        </Stack>

        <Stack direction="row" gap={2}>
          <FilterLink current={filter} value={undefined} label="Abandoned" />
          <FilterLink current={filter} value="active" label="Active" />
          <FilterLink current={filter} value="recovered" label="Recovered" />
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>
                {showRecovered ? 'Recovered' : showActive ? 'Active' : 'Abandoned'} carts
              </Heading>
              <CardDescription>
                Storefront writes through cartService; this dashboard is read-only.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {carts.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="h-5 w-5" />}
                title="No carts"
                description="Carts surface here when the storefront / B2B portal starts writing."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Lifecycle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/commerce/carts/${c.id}`}
                          className="font-mono text-xs hover:text-[var(--module-active)]"
                        >
                          {c.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {c.customer?.email ? (
                          <Stack gap={0}>
                            <Text size="sm">{c.customer.name ?? c.customer.email}</Text>
                            {c.customer.name && (
                              <Text size="xs" variant="muted">
                                {c.customer.email}
                              </Text>
                            )}
                          </Stack>
                        ) : c.guestToken ? (
                          <Text size="xs" variant="muted">
                            guest
                          </Text>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.channel}</Badge>
                      </TableCell>
                      <TableCell>{c._count.items}</TableCell>
                      <TableCell>
                        ${(c.totalCents / 100).toFixed(2)} {c.currency}
                      </TableCell>
                      <TableCell>{new Date(c.updatedAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {c.recoveredAt ? (
                          <Badge variant="success">recovered</Badge>
                        ) : c.abandonedAt ? (
                          <Badge variant="warning">abandoned</Badge>
                        ) : (
                          <Badge variant="outline">active</Badge>
                        )}
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

function FilterLink({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const isActive = current === value || (current === undefined && value === undefined);
  const href = value ? `/commerce/carts?filter=${value}` : '/commerce/carts';
  return (
    <Link
      href={href}
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
