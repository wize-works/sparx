import { CircleDollarSign, PackageOpen } from 'lucide-react';

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

import { GrantStoreCreditForm } from './_components/grant-store-credit-form';

export const dynamic = 'force-dynamic';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default async function StoreCreditPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Per-customer credit balances."
        description="Activate the Commerce module from Billing to manage store credit."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [balances, recentCustomers] = await Promise.all([
    loadBalances(ctx),
    loadRecentCustomers(ctx),
  ]);

  const outstandingCents = balances.reduce((acc, b) => acc + b.balanceCents, 0);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <CircleDollarSign className="h-5 w-5" />
            <Heading level={1}>Store credit</Heading>
            <Badge variant="module">{moneyFmt.format(outstandingCents / 100)} outstanding</Badge>
          </Stack>
          <Text variant="muted">
            Per-customer credit balance — accrues from refunds, loyalty conversions, or manual
            grants. Spent at checkout via the pricing pipeline.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Grant credit</Heading>
              <CardDescription>
                Adds to a customer&apos;s balance for the named currency. New customer + new
                currency creates a fresh balance row.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <GrantStoreCreditForm customers={recentCustomers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Outstanding balances</Heading>
          </CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <EmptyState
                icon={<CircleDollarSign className="h-5 w-5" />}
                title="No store credit issued yet"
                description="Grant credit above or have it auto-issued from a refund."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((b) => (
                    <TableRow key={`${b.customerId}:${b.currency}`}>
                      <TableCell>
                        <Stack gap={0}>
                          <Text size="sm">{b.customerName ?? '—'}</Text>
                          <Text size="xs" variant="muted">
                            {b.customerEmail ?? b.customerId.slice(0, 8) + '…'}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>{moneyFmt.format(b.balanceCents / 100)}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{b.currency}</span>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" variant="muted">
                          {b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : 'never'}
                        </Text>
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

interface BalanceRow {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  balanceCents: number;
  currency: string;
  expiresAt: string | null;
  updatedAt: string;
}

async function loadBalances(ctx: { tenantId: string; userId: string }): Promise<BalanceRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.storeCredit.findMany({
      where: { balanceCents: { gt: 0 } },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { balanceCents: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customer
        ? `${r.customer.firstName ?? ''} ${r.customer.lastName ?? ''}`.trim() || null
        : null,
      customerEmail: r.customer?.email ?? null,
      balanceCents: r.balanceCents,
      currency: r.currency,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

interface CustomerSummary {
  id: string;
  email: string | null;
  name: string;
}

async function loadRecentCustomers(ctx: {
  tenantId: string;
  userId: string;
}): Promise<CustomerSummary[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.customer.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name:
        (`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || null) ??
        r.email ??
        r.id.slice(0, 8) + '…',
    }));
  });
}
