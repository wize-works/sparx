import Link from 'next/link';
import { ShoppingCart, Plus } from 'lucide-react';

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

import { api } from '@/lib/api-rest-client';

import { EntityRowLink } from '../../_components/entity-row-link';
import { CrmTabs } from '../_components/crm-tabs';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  total: string | number;
  amountPaid: string | number;
  placedAt: string | null;
  channel: string | null;
}

// Orders index — sortable + filterable table. Filters live in the query
// string so links and saved views serialize cleanly.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  placed: 'outline',
  fulfilled: 'success',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'warning',
};

export default async function OrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = stringParam(params.status);
  const paymentStatus = stringParam(params.paymentStatus);
  const q = stringParam(params.q);

  const query = new URLSearchParams({ take: '100', sort_by: 'placedAt' });
  if (status) query.set('status', status);
  if (paymentStatus) query.set('payment_status', paymentStatus);
  if (q) query.set('q', q);

  const { data: orders, meta } = await api.getPaged<OrderRow[]>(
    `/v1/crm/orders?${query.toString()}`
  );
  const total = (meta?.total as number | undefined) ?? orders.length;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="orders" />
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <ShoppingCart className="h-5 w-5" />
              <Heading level={1}>Orders</Heading>
              <Badge color="module">
                {total} order{total === 1 ? '' : 's'}
              </Badge>
            </Stack>
            <Text variant="muted">
              Customer orders — placed, paid, fulfilled, delivered, refunded. Linked back to
              customer records and (optionally) to a sales deal via the deal_orders join.
            </Text>
          </Stack>
          <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/crm/orders/new">New order</Link>
          </Button>
        </Stack>

        {orders.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<ShoppingCart className="h-5 w-5" />}
              title="No orders match"
              description="Orders placed through the storefront, B2B portal, or admin appear here. Adjust filters above or place a new order manually."
            />
          </Card>
        ) : (
          <Card padding="none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Placed</TableHead>
                    <TableHead>Channel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/crm/orders/${o.id}`}
                          entityType="order"
                          entityId={o.id}
                          className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                        >
                          {o.orderNumber}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Badge color={STATUS_VARIANT[o.status] ?? 'outline'} className="text-xs">
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {o.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.currency} {Number(o.total).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.currency} {Number(o.amountPaid).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {o.placedAt ? new Date(o.placedAt).toLocaleDateString() : '—'}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {o.channel ?? '—'}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
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
