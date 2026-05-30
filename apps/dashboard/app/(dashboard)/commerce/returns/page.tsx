import Link from 'next/link';
import { Inbox, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { returnService } from '@sparx/commerce';
import type { ReturnStatus } from '@sparx/commerce-schemas';
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
import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { value: ReturnStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'requested', label: 'New' },
  { value: 'approved', label: 'Approved' },
  { value: 'awaiting_shipment', label: 'Awaiting shipment' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'received', label: 'Received' },
  { value: 'inspecting', label: 'Inspecting' },
  { value: 'inspected', label: 'Inspected' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'denied', label: 'Denied' },
];

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="RMA workflow."
        description="Activate the Commerce module from Billing to handle returns."
        features={[]}
      />
    );
  }

  const { status: statusParam } = await searchParams;
  const status = isStatus(statusParam) ? statusParam : undefined;

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { items, total } = await returnService.list(ctx, {
    ...(status ? { status } : {}),
    take: 100,
  });

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Inbox className="h-5 w-5" />
            <Heading level={1}>Returns</Heading>
            <Badge variant="module">{total} total</Badge>
          </Stack>
          <Text variant="muted">
            Customer- or staff-initiated returns. Approve, generate a label, receive, inspect each
            line, then settle as refund or store credit. Provider-driven refund settlement (Stripe,
            etc.) happens via the order-payments path once a TaxProvider/PaymentProvider is wired
            into the marketplace.
          </Text>
        </Stack>

        <Stack direction="row" gap={2} wrap>
          {STATUS_FILTERS.map((f) => (
            <FilterLink key={f.label} current={status} value={f.value} label={f.label} />
          ))}
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{status ? labelForStatus(status) : 'All returns'}</Heading>
              <CardDescription>Click an ID to open the inspection queue.</CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="No returns"
                description={
                  status === 'requested'
                    ? 'No new return requests waiting for staff review.'
                    : 'Returns are created when customers submit one from /account/orders.'
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Preferred outcome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/returns/${r.id}`}
                          entityType="return"
                          entityId={r.id}
                          className="font-mono text-xs hover:text-[var(--module-active)]"
                        >
                          {r.id.slice(0, 8)}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {r.orderId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {r.customerId ? (
                          <Text size="xs" className="font-mono">
                            {r.customerId.slice(0, 8)}
                          </Text>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{r.itemCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.preferredOutcome}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>{new Date(r.requestedAt).toLocaleDateString()}</TableCell>
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
  current: ReturnStatus | undefined;
  value: ReturnStatus | undefined;
  label: string;
}) {
  const isActive = current === value || (current === undefined && value === undefined);
  const href = value ? `/commerce/returns?status=${value}` : '/commerce/returns';
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

function StatusBadge({ status }: { status: ReturnStatus }) {
  const variant: Record<ReturnStatus, 'success' | 'warning' | 'outline'> = {
    requested: 'warning',
    approved: 'outline',
    denied: 'outline',
    awaiting_shipment: 'outline',
    in_transit: 'outline',
    received: 'outline',
    inspecting: 'outline',
    inspected: 'outline',
    refunded: 'success',
    cancelled: 'outline',
  };
  return <Badge variant={variant[status]}>{status}</Badge>;
}

function labelForStatus(s: ReturnStatus): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function isStatus(value: string | undefined): value is ReturnStatus {
  if (!value) return false;
  return (
    value === 'requested' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'awaiting_shipment' ||
    value === 'in_transit' ||
    value === 'received' ||
    value === 'inspecting' ||
    value === 'inspected' ||
    value === 'refunded' ||
    value === 'cancelled'
  );
}
