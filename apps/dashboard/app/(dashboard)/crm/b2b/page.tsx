import Link from 'next/link';
import { Building2, Plus, AlertTriangle } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { b2bAccountService } from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
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

import { CrmTabs } from '../_components/crm-tabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  active: 'success',
  credit_hold: 'warning',
  suspended: 'danger',
  inactive: 'outline',
};
const STATUS_VALUES = ['active', 'credit_hold', 'suspended', 'inactive'] as const;

export default async function B2bAccountsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const status = stringParam(params.status);
  const q = stringParam(params.q);

  const { items: accounts, total } = await b2bAccountService.list(
    { tenantId: session.user.tenantId, userId: session.user.id },
    {
      take: 100,
      ...(status && (STATUS_VALUES as readonly string[]).includes(status)
        ? { status: status as (typeof STATUS_VALUES)[number] }
        : {}),
      ...(q ? { q } : {}),
    }
  );

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="b2b" />
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Building2 className="h-5 w-5" />
              <Heading level={1}>B2B accounts</Heading>
              <Badge variant="module">
                {total} account{total === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Wholesale + fleet customers. Pricing tier, credit limit, and engine profiles feed the
              fitment-aware catalog and the B2B portal pricing engine.
            </Text>
          </Stack>
          <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/crm/b2b/new">New B2B account</Link>
          </Button>
        </Stack>

        {accounts.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No B2B accounts yet"
              description="Add a wholesale or fleet customer to start tracking pricing tiers, credit, and engine profiles."
              action={
                <Button asChild variant="module">
                  <Link href="/crm/b2b/new">Add a B2B account</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Card padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pricing tier</TableHead>
                    <TableHead className="text-right">Credit limit</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead>Fleet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => {
                    const limit = Number(a.creditLimit);
                    const used = Number(a.creditUsed);
                    const utilization = limit > 0 ? used / limit : 0;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link
                            href={`/crm/b2b/${a.id}`}
                            className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                          >
                            {a.companyName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_VARIANT[a.status] ?? 'outline'}
                            className="text-xs"
                          >
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Text size="sm" variant="muted">
                            {a.pricingTier ?? '—'}
                          </Text>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${limit.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Stack direction="row" gap={1} align="center" justify="end">
                            <span>${used.toLocaleString()}</span>
                            {utilization >= 0.85 && (
                              <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-warning-500)]" />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Text size="sm" variant="muted">
                            {a.fleetSize ?? '—'}
                          </Text>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
