import Link from 'next/link';
import { Building2, Plus, AlertTriangle } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  EmptyState,
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
import { ListToolbar } from '../../_components/list-toolbar';

interface B2bAccountRow {
  id: string;
  companyName: string;
  status: string;
  pricingTier: string | null;
  creditLimit: string | number;
  creditUsed: string | number;
  fleetSize: number | null;
}

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

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'credit_hold', label: 'Credit hold' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'inactive', label: 'Inactive' },
];

export default async function B2bAccountsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = stringParam(params.status);
  const q = stringParam(params.q);

  const query = new URLSearchParams({ take: '100' });
  if (status && (STATUS_VALUES as readonly string[]).includes(status)) query.set('status', status);
  if (q) query.set('q', q);

  const { data: accounts, meta } = await api.getPaged<B2bAccountRow[]>(
    `/v1/crm/b2b-accounts?${query.toString()}`
  );
  const total = (meta?.total as number | undefined) ?? accounts.length;

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Building2 className="h-5 w-5" />}
          title="B2B accounts"
          badge={
            <Badge color="module">
              {total} account{total === 1 ? '' : 's'}
            </Badge>
          }
          description="Wholesale + fleet customers. Pricing tier, credit limit, and engine profiles feed the fitment-aware catalog and the B2B portal pricing engine."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/crm/b2b/new">New B2B account</Link>
            </Button>
          }
        />

        <ListToolbar
          searchPlaceholder="Search company…"
          filters={[{ key: 'status', label: 'Statuses', options: STATUS_OPTIONS }]}
        />

        {accounts.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No B2B accounts yet"
              description="Add a wholesale or fleet customer to start tracking pricing tiers, credit, and engine profiles."
              action={
                <Button asChild color="module">
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
                          <EntityRowLink
                            href={`/crm/b2b/${a.id}`}
                            entityType="b2b-account"
                            entityId={a.id}
                            className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                          >
                            {a.companyName}
                          </EntityRowLink>
                        </TableCell>
                        <TableCell>
                          <Badge color={STATUS_VARIANT[a.status] ?? 'outline'} className="text-xs">
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
